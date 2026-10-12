// Project snapshots — main-side storage core. Persistent point-in-time
// copies of every page + component file, stored under `.scamp/snapshots/`
// with an index at `.scamp/snapshots.json`. The renderer never touches
// `.scamp/`; it drives these through the snapshot IPC channels.
// See docs/notes/snapshots.md.
import { promises as fs } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { randomUUID } from 'crypto';

import { designMdPathFor } from './designMdOps';
import { themePathFor } from './themeOps';

import type {
  ProjectFormat,
  SnapshotMeta,
  SnapshotTrigger,
} from '@shared/types';

/** Max snapshots kept locally; oldest is pruned when a new one exceeds it. */
export const SNAPSHOT_LIMIT = 50;
/** Consecutive external edits within this window collapse into one snapshot. */
export const AGENT_EDIT_COLLAPSE_MS = 5000;

const scampDir = (projectPath: string): string => join(projectPath, '.scamp');
const snapshotsRoot = (projectPath: string): string =>
  join(scampDir(projectPath), 'snapshots');
const indexPath = (projectPath: string): string =>
  join(scampDir(projectPath), 'snapshots.json');
// The id names a folder and arrives from the renderer: no separators, no `..`.
const snapshotDirFor = (projectPath: string, id: string): string => {
  if (!/^[\w-]+$/.test(id)) throw new Error(`Invalid snapshot id "${id}".`);
  return join(snapshotsRoot(projectPath), id);
};

// ---- Pure helpers (unit-tested directly) ----

/** A fresh, collision-resistant snapshot id (also the on-disk folder name). */
export const snapshotIdFor = (): string =>
  `snap_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

/**
 * Concise display label per trigger. Time isn't embedded — the panel
 * renders it from the snapshot's `timestamp`. `detail` carries the
 * changed filename (`agent_edit`) or the user-typed name (`manual`).
 */
export const formatTriggerLabel = (
  trigger: SnapshotTrigger,
  detail?: string
): string => {
  switch (trigger) {
    case 'session_open':
      return 'Session opened';
    case 'session_close':
      return 'Session closed';
    case 'agent_edit':
      return detail ? `External edit — ${detail}` : 'External edit';
    case 'manual':
      return detail && detail.trim().length > 0 ? detail.trim() : 'Manual snapshot';
    case 'auto_save':
      return 'Auto-save';
    case 'before_restore':
      return 'Before restore';
    case 'agent_session':
      return detail ? `Before Scamp Agent — ${detail}` : 'Before Scamp Agent';
  }
};

/**
 * True when an `agent_edit` snapshot should be skipped because the most
 * recent snapshot is also an `agent_edit` within the collapse window —
 * keeps a rapid agent burst from flooding the history.
 */
export const shouldCollapseAgentEdit = (
  snapshots: ReadonlyArray<SnapshotMeta>,
  trigger: SnapshotTrigger,
  nowMs: number,
  windowMs: number = AGENT_EDIT_COLLAPSE_MS
): boolean => {
  if (trigger !== 'agent_edit') return false;
  let latest: SnapshotMeta | null = null;
  for (const s of snapshots) {
    if (!latest || Date.parse(s.timestamp) > Date.parse(latest.timestamp)) {
      latest = s;
    }
  }
  if (!latest || latest.trigger !== 'agent_edit') return false;
  return nowMs - Date.parse(latest.timestamp) < windowMs;
};

/**
 * Split a snapshot list into the newest `limit` to keep and the oldest to
 * remove. Pure — the caller deletes the removed folders + rewrites the
 * index. Pruning is purely by age, no trigger is exempt.
 */
export const pruneToLimit = (
  snapshots: ReadonlyArray<SnapshotMeta>,
  limit: number = SNAPSHOT_LIMIT
): { kept: SnapshotMeta[]; removed: SnapshotMeta[] } => {
  const sorted = [...snapshots].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );
  if (sorted.length <= limit) return { kept: sorted, removed: [] };
  const overBy = sorted.length - limit;
  return { removed: sorted.slice(0, overBy), kept: sorted.slice(overBy) };
};

// ---- Index read/write ----

const readIndex = async (projectPath: string): Promise<SnapshotMeta[]> => {
  try {
    const raw = await fs.readFile(indexPath(projectPath), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { snapshots?: unknown }).snapshots)
    ) {
      return (parsed as { snapshots: SnapshotMeta[] }).snapshots;
    }
    return [];
  } catch {
    // Missing or malformed index — treat as no snapshots.
    return [];
  }
};

const writeIndex = async (
  projectPath: string,
  snapshots: SnapshotMeta[]
): Promise<void> => {
  await fs.mkdir(scampDir(projectPath), { recursive: true });
  await fs.writeFile(
    indexPath(projectPath),
    JSON.stringify({ snapshots }, null, 2),
    'utf-8'
  );
};

// ---- File enumeration + recursive walk ----

const exists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

/**
 * The absolute paths of every snapshot-relevant file: page `.tsx` +
 * `.module.css` (nextjs: `app/page.*` + `app/<page>/page.*`; legacy: root
 * `*.tsx` + `*.module.css`) plus `components/<Name>/<Name>.*`. A direct
 * byte walk — independent of `parseCode`, so even a malformed file an
 * agent just wrote is captured (the whole point of the safety net).
 */
/** Every file under `dir`, recursively; nothing when it doesn't exist. */
const addTree = async (dir: string, out: string[]): Promise<void> => {
  let entries: { name: string; isDirectory: () => boolean }[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await addTree(p, out);
    else out.push(p);
  }
};

export const enumerateProjectFiles = async (
  projectPath: string,
  format: ProjectFormat
): Promise<string[]> => {
  const out: string[] = [];
  const add = async (p: string): Promise<void> => {
    if (await exists(p)) out.push(p);
  };

  // The design system, in every format: a restore that brought the pages
  // back but left the theme as it was would show the old design in the
  // new colours.
  await add(themePathFor(projectPath, format));
  await add(designMdPathFor(projectPath, format));

  if (format === 'scamp') {
    // Views share the components layout below; routes are the user's
    // logic and go in whole.
    await addTree(join(projectPath, 'routes'), out);
    const viewsDir = join(projectPath, 'views');
    let views: { name: string; isDirectory: () => boolean }[] = [];
    try {
      views = await fs.readdir(viewsDir, { withFileTypes: true });
    } catch {
      // no views yet
    }
    for (const v of views) {
      if (!v.isDirectory()) continue;
      await add(join(viewsDir, v.name, `${v.name}.tsx`));
      await add(join(viewsDir, v.name, `${v.name}.module.css`));
    }
  } else if (format === 'nextjs') {
    const appDir = join(projectPath, 'app');
    await add(join(appDir, 'page.tsx'));
    await add(join(appDir, 'page.module.css'));
    let entries: { name: string; isDirectory: () => boolean }[] = [];
    try {
      entries = await fs.readdir(appDir, { withFileTypes: true });
    } catch {
      // no app/ dir
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      await add(join(appDir, e.name, 'page.tsx'));
      await add(join(appDir, e.name, 'page.module.css'));
    }
  } else {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(projectPath);
    } catch {
      // unreadable project root
    }
    for (const f of entries) {
      if (f.endsWith('.tsx') || f.endsWith('.module.css')) {
        await add(join(projectPath, f));
      }
    }
  }

  // Components (Next.js layout in practice; walked defensively if present).
  const componentsDir = join(projectPath, 'components');
  let comps: { name: string; isDirectory: () => boolean }[] = [];
  try {
    comps = await fs.readdir(componentsDir, { withFileTypes: true });
  } catch {
    // no components/ dir
  }
  for (const c of comps) {
    if (!c.isDirectory()) continue;
    await add(join(componentsDir, c.name, `${c.name}.tsx`));
    await add(join(componentsDir, c.name, `${c.name}.module.css`));
  }

  return out;
};

const walkFiles = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  let entries: { name: string; isDirectory: () => boolean }[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(full)));
    else out.push(full);
  }
  return out;
};

/** Pages = enumerated `.tsx` not under `components/`. */
const countPages = (projectPath: string, files: string[]): number =>
  files.filter((f) => {
    if (!f.endsWith('.tsx')) return false;
    const rel = relative(projectPath, f);
    return rel.split(sep)[0] !== 'components';
  }).length;

// ---- Public operations ----

/**
 * Snapshot the project's current on-disk state. Never throws — on any
 * failure (disk full, permissions) it logs and returns null so a failed
 * snapshot can't block the user. Returns null (no snapshot) when an
 * `agent_edit` is collapsed into a recent one. `nowMs` is injectable for
 * deterministic tests.
 */
export const createSnapshot = async (
  projectPath: string,
  format: ProjectFormat,
  trigger: SnapshotTrigger,
  detail?: string,
  nowMs: number = Date.now()
): Promise<SnapshotMeta | null> => {
  try {
    const existing = await readIndex(projectPath);
    if (shouldCollapseAgentEdit(existing, trigger, nowMs)) return null;

    const files = await enumerateProjectFiles(projectPath, format);
    const id = snapshotIdFor();
    const dir = snapshotDirFor(projectPath, id);
    for (const abs of files) {
      const dest = join(dir, relative(projectPath, abs));
      await fs.mkdir(dirname(dest), { recursive: true });
      await fs.copyFile(abs, dest);
    }

    const meta: SnapshotMeta = {
      id,
      timestamp: new Date(nowMs).toISOString(),
      trigger,
      label: formatTriggerLabel(trigger, detail),
      pageCount: countPages(projectPath, files),
    };

    const { kept, removed } = pruneToLimit([...existing, meta]);
    for (const r of removed) {
      await fs
        .rm(snapshotDirFor(projectPath, r.id), { recursive: true, force: true })
        .catch(() => undefined);
    }
    await writeIndex(projectPath, kept);
    return meta;
  } catch (err) {
    // PRD: silent-fail — never let a snapshot failure block the user.
    console.warn('[snapshotOps] createSnapshot failed:', err);
    return null;
  }
};

export const listSnapshots = async (
  projectPath: string
): Promise<SnapshotMeta[]> => readIndex(projectPath);

/**
 * Read a single page's `.tsx` + `.css` from a snapshot WITHOUT restoring —
 * powers the read-only preview. The snapshot mirrors the project layout
 * (`join(dir, relative(projectPath, abs))`), so the current absolute page
 * paths map straight back in. Returns `null` for either file the snapshot
 * doesn't contain (e.g. a page added after the snapshot was taken).
 */
export const readSnapshotPage = async (
  projectPath: string,
  snapshotId: string,
  tsxPath: string,
  cssPath: string
): Promise<{ tsx: string | null; css: string | null }> => {
  const dir = snapshotDirFor(projectPath, snapshotId);
  const read = async (abs: string): Promise<string | null> => {
    try {
      return await fs.readFile(join(dir, relative(projectPath, abs)), 'utf-8');
    } catch {
      return null;
    }
  };
  return { tsx: await read(tsxPath), css: await read(cssPath) };
};

export const deleteSnapshot = async (
  projectPath: string,
  snapshotId: string
): Promise<{ ok: boolean }> => {
  try {
    const existing = await readIndex(projectPath);
    await fs
      .rm(snapshotDirFor(projectPath, snapshotId), {
        recursive: true,
        force: true,
      })
      .catch(() => undefined);
    await writeIndex(
      projectPath,
      existing.filter((s) => s.id !== snapshotId)
    );
    return { ok: true };
  } catch {
    return { ok: false };
  }
};

type RestoreOptions = {
  nowMs?: number;
  /**
   * Called with each destination path just before it's overwritten.
   * The IPC handler uses this to register a suppressed pending-write so
   * the watcher doesn't treat the restore's copies as external edits
   * (which would spawn `agent_edit` snapshots and a redundant reload).
   */
  beforeWrite?: (dest: string) => void;
};

/**
 * Restore a snapshot: first snapshot the current state (`before_restore`)
 * so the restore itself is undoable, then copy the snapshot's files back
 * over the project. Overlay copy — files added since the snapshot are
 * left in place.
 */
export const restoreSnapshot = async (
  projectPath: string,
  format: ProjectFormat,
  snapshotId: string,
  opts: RestoreOptions = {}
): Promise<{ ok: boolean; error?: string }> => {
  try {
    const existing = await readIndex(projectPath);
    if (!existing.some((s) => s.id === snapshotId)) {
      return { ok: false, error: 'Snapshot not found.' };
    }
    await createSnapshot(
      projectPath,
      format,
      'before_restore',
      undefined,
      opts.nowMs
    );

    const dir = snapshotDirFor(projectPath, snapshotId);
    const files = await walkFiles(dir);
    for (const abs of files) {
      const dest = join(projectPath, relative(dir, abs));
      await fs.mkdir(dirname(dest), { recursive: true });
      opts.beforeWrite?.(dest);
      await fs.copyFile(abs, dest);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Restore failed.',
    };
  }
};
