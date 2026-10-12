import { describe, it, expect, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  AGENT_EDIT_COLLAPSE_MS,
  createSnapshot,
  deleteSnapshot,
  enumerateProjectFiles,
  formatTriggerLabel,
  listSnapshots,
  pruneToLimit,
  readSnapshotPage,
  restoreSnapshot,
  shouldCollapseAgentEdit,
  snapshotIdFor,
  SNAPSHOT_LIMIT,
} from '../src/main/ipc/snapshotOps';
import type { SnapshotMeta } from '../src/shared/types';

// --- temp project helpers ---------------------------------------------------

const tmpRoots: string[] = [];

const makeNextjsProject = async (): Promise<string> => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'snap-ops-'));
  tmpRoots.push(tmp);
  const root = path.join(tmp, 'proj');
  await fs.mkdir(path.join(root, 'app', 'dashboard'), { recursive: true });
  await fs.writeFile(path.join(root, 'app', 'page.tsx'), 'home tsx');
  await fs.writeFile(path.join(root, 'app', 'page.module.css'), 'home css');
  await fs.writeFile(path.join(root, 'app', 'dashboard', 'page.tsx'), 'dash tsx');
  await fs.writeFile(
    path.join(root, 'app', 'dashboard', 'page.module.css'),
    'dash css'
  );
  await fs.mkdir(path.join(root, 'components', 'Button'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'components', 'Button', 'Button.tsx'),
    'btn tsx'
  );
  await fs.writeFile(
    path.join(root, 'components', 'Button', 'Button.module.css'),
    'btn css'
  );
  return root;
};

const makeLegacyProject = async (): Promise<string> => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'snap-ops-legacy-'));
  tmpRoots.push(tmp);
  const root = path.join(tmp, 'proj');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'home.tsx'), 'home tsx');
  await fs.writeFile(path.join(root, 'home.module.css'), 'home css');
  await fs.writeFile(path.join(root, 'about.tsx'), 'about tsx');
  await fs.writeFile(path.join(root, 'about.module.css'), 'about css');
  return root;
};

const meta = (over: Partial<SnapshotMeta>): SnapshotMeta => ({
  id: 'snap_x',
  timestamp: '2026-05-01T10:00:00.000Z',
  trigger: 'manual',
  label: 'Manual snapshot',
  pageCount: 1,
  ...over,
});

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((d) => fs.rm(d, { recursive: true, force: true }))
  );
});

// --- pure helpers -----------------------------------------------------------

describe('formatTriggerLabel', () => {
  it('labels the Scamp Agent’s restore point', () => {
    expect(formatTriggerLabel('agent_session')).toBe('Before Scamp Agent');
  });

  it('returns concise labels per trigger', () => {
    expect(formatTriggerLabel('session_open')).toBe('Session opened');
    expect(formatTriggerLabel('session_close')).toBe('Session closed');
    expect(formatTriggerLabel('auto_save')).toBe('Auto-save');
    expect(formatTriggerLabel('before_restore')).toBe('Before restore');
  });

  it('embeds the filename for an external edit', () => {
    expect(formatTriggerLabel('agent_edit', 'page.module.css')).toBe(
      'External edit — page.module.css'
    );
    expect(formatTriggerLabel('agent_edit')).toBe('External edit');
  });

  it('uses the user-typed name for a manual snapshot, else a default', () => {
    expect(formatTriggerLabel('manual', 'before refactor')).toBe(
      'before refactor'
    );
    expect(formatTriggerLabel('manual', '   ')).toBe('Manual snapshot');
    expect(formatTriggerLabel('manual')).toBe('Manual snapshot');
  });
});

describe('shouldCollapseAgentEdit', () => {
  const now = Date.parse('2026-05-01T10:00:10.000Z');

  it('collapses a second agent edit within the window', () => {
    const snaps = [
      meta({ trigger: 'agent_edit', timestamp: '2026-05-01T10:00:08.000Z' }),
    ];
    expect(shouldCollapseAgentEdit(snaps, 'agent_edit', now)).toBe(true);
  });

  it('does not collapse outside the window', () => {
    const snaps = [
      meta({ trigger: 'agent_edit', timestamp: '2026-05-01T10:00:00.000Z' }),
    ];
    expect(shouldCollapseAgentEdit(snaps, 'agent_edit', now)).toBe(false);
  });

  it('does not collapse when the latest snapshot is a different trigger', () => {
    const snaps = [
      meta({ trigger: 'manual', timestamp: '2026-05-01T10:00:09.000Z' }),
    ];
    expect(shouldCollapseAgentEdit(snaps, 'agent_edit', now)).toBe(false);
  });

  it('never collapses a non-agent trigger', () => {
    const snaps = [
      meta({ trigger: 'agent_edit', timestamp: '2026-05-01T10:00:09.000Z' }),
    ];
    expect(shouldCollapseAgentEdit(snaps, 'manual', now)).toBe(false);
  });

  it('does not collapse against an empty history', () => {
    expect(shouldCollapseAgentEdit([], 'agent_edit', now)).toBe(false);
  });

  it('uses a 5 second default window', () => {
    expect(AGENT_EDIT_COLLAPSE_MS).toBe(5000);
  });
});

describe('pruneToLimit', () => {
  const at = (s: number): string =>
    new Date(Date.parse('2026-05-01T10:00:00.000Z') + s * 1000).toISOString();

  it('keeps everything when at or under the limit', () => {
    const snaps = [meta({ id: 'a', timestamp: at(0) })];
    expect(pruneToLimit(snaps, 50).removed).toEqual([]);
  });

  it('removes the oldest when over the limit', () => {
    const snaps = Array.from({ length: 52 }, (_, i) =>
      meta({ id: `s${i}`, timestamp: at(i) })
    );
    const { kept, removed } = pruneToLimit(snaps, 50);
    expect(kept).toHaveLength(50);
    expect(removed.map((s) => s.id)).toEqual(['s0', 's1']);
  });

  it('defaults to a 50-snapshot limit', () => {
    expect(SNAPSHOT_LIMIT).toBe(50);
  });
});

describe('snapshotIdFor', () => {
  it('produces unique snap_-prefixed ids', () => {
    const a = snapshotIdFor();
    const b = snapshotIdFor();
    expect(a).toMatch(/^snap_[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

// --- enumeration ------------------------------------------------------------

describe('enumerateProjectFiles', () => {
  it('collects page + component files for a nextjs project', async () => {
    const root = await makeNextjsProject();
    const files = (await enumerateProjectFiles(root, 'nextjs')).map((f) =>
      path.relative(root, f)
    );
    expect(files.sort()).toEqual(
      [
        'app/page.tsx',
        'app/page.module.css',
        'app/dashboard/page.tsx',
        'app/dashboard/page.module.css',
        'components/Button/Button.tsx',
        'components/Button/Button.module.css',
      ].sort()
    );
  });

  it('collects root .tsx/.module.css for a legacy project', async () => {
    const root = await makeLegacyProject();
    const files = (await enumerateProjectFiles(root, 'legacy')).map((f) =>
      path.relative(root, f)
    );
    expect(files.sort()).toEqual(
      ['home.tsx', 'home.module.css', 'about.tsx', 'about.module.css'].sort()
    );
  });

  it('collects the theme and DESIGN.md of a nextjs project', async () => {
    // Without them a restore brought the pages back in the current
    // theme — and an agent session that added tokens couldn't be undone.
    const root = await makeNextjsProject();
    await fs.writeFile(path.join(root, 'app', 'theme.css'), ':root {}');
    await fs.writeFile(path.join(root, 'DESIGN.md'), '# Design');
    const files = (await enumerateProjectFiles(root, 'nextjs')).map((f) => path.relative(root, f));
    expect(files).toContain('app/theme.css');
    expect(files).toContain('DESIGN.md');
  });

  it('collects the theme and DESIGN.md of a legacy project', async () => {
    const root = await makeLegacyProject();
    await fs.writeFile(path.join(root, 'theme.css'), ':root {}');
    await fs.writeFile(path.join(root, 'DESIGN.md'), '# Design');
    const files = (await enumerateProjectFiles(root, 'legacy')).map((f) => path.relative(root, f));
    expect(files).toContain('theme.css');
    expect(files).toContain('DESIGN.md');
  });

  it('collects the theme and DESIGN.md of a scamp project from design/', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'snap-ops-scamp-'));
    tmpRoots.push(tmp);
    await fs.mkdir(path.join(tmp, 'design'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'design', 'theme.css'), ':root {}');
    await fs.writeFile(path.join(tmp, 'design', 'DESIGN.md'), '# Design');
    const files = (await enumerateProjectFiles(tmp, 'scamp')).map((f) => path.relative(tmp, f));
    expect(files.sort()).toEqual(['design/DESIGN.md', 'design/theme.css']);
  });
});

// --- createSnapshot ---------------------------------------------------------

describe('createSnapshot', () => {
  const now = Date.parse('2026-05-01T10:00:00.000Z');

  it('mirrors the project files under .scamp/snapshots/<id>/ and indexes it', async () => {
    const root = await makeNextjsProject();
    const snap = await createSnapshot(root, 'nextjs', 'session_open', undefined, now);
    expect(snap).not.toBeNull();
    expect(snap?.trigger).toBe('session_open');
    expect(snap?.label).toBe('Session opened');
    expect(snap?.pageCount).toBe(2);
    expect(snap?.timestamp).toBe('2026-05-01T10:00:00.000Z');

    const dir = path.join(root, '.scamp', 'snapshots', snap!.id);
    expect(await fs.readFile(path.join(dir, 'app', 'page.tsx'), 'utf-8')).toBe(
      'home tsx'
    );
    expect(
      await fs.readFile(
        path.join(dir, 'components', 'Button', 'Button.module.css'),
        'utf-8'
      )
    ).toBe('btn css');

    const index = JSON.parse(
      await fs.readFile(path.join(root, '.scamp', 'snapshots.json'), 'utf-8')
    );
    expect(index.snapshots).toHaveLength(1);
    expect(index.snapshots[0].id).toBe(snap!.id);
  });

  it('faithfully copies a malformed file (the safety-net case)', async () => {
    const root = await makeNextjsProject();
    await fs.writeFile(
      path.join(root, 'app', 'page.tsx'),
      '<div className={styles.broken'
    );
    const snap = await createSnapshot(root, 'nextjs', 'agent_edit', 'page.tsx', now);
    const copied = await fs.readFile(
      path.join(root, '.scamp', 'snapshots', snap!.id, 'app', 'page.tsx'),
      'utf-8'
    );
    expect(copied).toBe('<div className={styles.broken');
  });

  it('collapses a rapid second agent edit into no new snapshot', async () => {
    const root = await makeNextjsProject();
    const first = await createSnapshot(root, 'nextjs', 'agent_edit', 'page.tsx', now);
    const second = await createSnapshot(
      root,
      'nextjs',
      'agent_edit',
      'page.module.css',
      now + 2000
    );
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await listSnapshots(root)).toHaveLength(1);
  });

  it('prunes the oldest snapshot once the 50 limit is exceeded', async () => {
    const root = await makeNextjsProject();
    let firstId = '';
    for (let i = 0; i <= SNAPSHOT_LIMIT; i += 1) {
      const s = await createSnapshot(root, 'nextjs', 'manual', `s${i}`, now + i * 1000);
      if (i === 0) firstId = s!.id;
    }
    const list = await listSnapshots(root);
    expect(list).toHaveLength(SNAPSHOT_LIMIT);
    expect(list.some((s) => s.id === firstId)).toBe(false);
    // The pruned snapshot's folder is gone too.
    await expect(
      fs.access(path.join(root, '.scamp', 'snapshots', firstId))
    ).rejects.toThrow();
  });

  it('stays silent (returns null, logs, no throw) when the write fails', async () => {
    const root = await makeNextjsProject();
    // Make `.scamp` a file so mkdir of the snapshot dir fails.
    await fs.writeFile(path.join(root, '.scamp'), 'not a dir');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const snap = await createSnapshot(root, 'nextjs', 'manual', undefined, now);
    expect(snap).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// --- list / delete ----------------------------------------------------------

describe('listSnapshots', () => {
  it('returns [] for a project with no snapshots', async () => {
    const root = await makeNextjsProject();
    expect(await listSnapshots(root)).toEqual([]);
  });

  it('returns [] when snapshots.json is malformed', async () => {
    const root = await makeNextjsProject();
    await fs.mkdir(path.join(root, '.scamp'), { recursive: true });
    await fs.writeFile(path.join(root, '.scamp', 'snapshots.json'), '{ not json');
    expect(await listSnapshots(root)).toEqual([]);
  });
});

describe('deleteSnapshot', () => {
  it('removes the folder and the index entry', async () => {
    const root = await makeNextjsProject();
    const snap = await createSnapshot(root, 'nextjs', 'manual', 'keep me');
    const res = await deleteSnapshot(root, snap!.id);
    expect(res.ok).toBe(true);
    expect(await listSnapshots(root)).toEqual([]);
    await expect(
      fs.access(path.join(root, '.scamp', 'snapshots', snap!.id))
    ).rejects.toThrow();
  });

  it('refuses an id that climbs out of the snapshots folder, and deletes nothing', async () => {
    const root = await makeNextjsProject();
    const res = await deleteSnapshot(root, '../..');
    expect(res.ok).toBe(false);
    await expect(fs.access(path.join(root, 'app', 'page.tsx'))).resolves.toBeUndefined();
  });
});

describe('readSnapshotPage', () => {
  it('refuses an id that climbs out of the snapshots folder', async () => {
    const root = await makeNextjsProject();
    await expect(
      readSnapshotPage(root, '../..', path.join(root, 'app', 'page.tsx'), path.join(root, 'app', 'page.module.css'))
    ).rejects.toThrow('Invalid snapshot id');
  });
});

// --- restore ----------------------------------------------------------------

describe('restoreSnapshot', () => {
  const now = Date.parse('2026-05-01T10:00:00.000Z');

  it('copies the snapshot files back and snapshots the current state first', async () => {
    const root = await makeNextjsProject();
    const snap = await createSnapshot(root, 'nextjs', 'manual', 'good state', now);

    // Mutate the project after the snapshot.
    await fs.writeFile(path.join(root, 'app', 'page.tsx'), 'BROKEN by agent');

    const res = await restoreSnapshot(root, 'nextjs', snap!.id, {
      nowMs: now + 60000,
    });
    expect(res.ok).toBe(true);

    // Files are back to the snapshot content.
    expect(await fs.readFile(path.join(root, 'app', 'page.tsx'), 'utf-8')).toBe(
      'home tsx'
    );

    // A before_restore snapshot captured the broken state.
    const list = await listSnapshots(root);
    const beforeRestore = list.find((s) => s.trigger === 'before_restore');
    expect(beforeRestore).toBeDefined();
    const captured = await fs.readFile(
      path.join(root, '.scamp', 'snapshots', beforeRestore!.id, 'app', 'page.tsx'),
      'utf-8'
    );
    expect(captured).toBe('BROKEN by agent');
  });

  it('refuses to restore, and touches nothing, when the safety snapshot fails', async () => {
    const root = await makeNextjsProject();
    const snap = await createSnapshot(root, 'nextjs', 'manual', 'good state', now);
    await fs.writeFile(path.join(root, 'app', 'page.tsx'), 'current work');
    // An unreadable file makes copying the current state fail.
    const unreadable = path.join(root, 'components', 'Button', 'Button.tsx');
    await fs.chmod(unreadable, 0o000);
    try {
      const res = await restoreSnapshot(root, 'nextjs', snap!.id, { nowMs: now + 60000 });
      expect(res.ok).toBe(false);
      expect(await fs.readFile(path.join(root, 'app', 'page.tsx'), 'utf-8')).toBe('current work');
    } finally {
      await fs.chmod(unreadable, 0o644);
    }
  });

  it('fails cleanly for an unknown snapshot id', async () => {
    const root = await makeNextjsProject();
    const res = await restoreSnapshot(root, 'nextjs', 'snap_nope');
    expect(res).toEqual({ ok: false, error: 'Snapshot not found.' });
  });

  it('announces every restored file via beforeWrite (watcher suppression hook)', async () => {
    // The IPC handler registers a suppressed pending-write per dest so the
    // watcher doesn't treat the restore burst as external edits.
    const root = await makeNextjsProject();
    const snap = await createSnapshot(root, 'nextjs', 'manual', 'good', now);
    const announced: string[] = [];
    await restoreSnapshot(root, 'nextjs', snap!.id, {
      nowMs: now + 1000,
      beforeWrite: (dest) => announced.push(path.relative(root, dest)),
    });
    expect(announced).toContain(path.join('app', 'page.tsx'));
    expect(announced).toContain(
      path.join('components', 'Button', 'Button.module.css')
    );
    // Every page + component file (6) was announced before being written.
    expect(announced).toHaveLength(6);
  });
});
