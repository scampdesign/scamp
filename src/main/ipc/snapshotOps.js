// Project snapshots — main-side storage core. Persistent point-in-time
// copies of every page + component file, stored under `.scamp/snapshots/`
// with an index at `.scamp/snapshots.json`. The renderer never touches
// `.scamp/`; it drives these through the snapshot IPC channels.
// See docs/notes/snapshots.md.
import { promises as fs } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { randomUUID } from 'crypto';
import { designMdPathFor } from './designMdOps';
import { atomicWrite, serializeByKey } from './fileOps';
import { themePathFor } from './themeOps';
/** Max snapshots kept locally; oldest is pruned when a new one exceeds it. */
export const SNAPSHOT_LIMIT = 50;
/** Consecutive external edits within this window collapse into one snapshot. */
export const AGENT_EDIT_COLLAPSE_MS = 5000;
const scampDir = (projectPath) => join(projectPath, '.scamp');
const snapshotsRoot = (projectPath) => join(scampDir(projectPath), 'snapshots');
const indexPath = (projectPath) => join(scampDir(projectPath), 'snapshots.json');
// The id names a folder and arrives from the renderer: no separators, no `..`.
const snapshotDirFor = (projectPath, id) => {
    if (!/^[\w-]+$/.test(id))
        throw new Error(`Invalid snapshot id "${id}".`);
    return join(snapshotsRoot(projectPath), id);
};
// ---- Pure helpers (unit-tested directly) ----
/** A fresh, collision-resistant snapshot id (also the on-disk folder name). */
export const snapshotIdFor = () => `snap_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
/**
 * Concise display label per trigger. Time isn't embedded — the panel
 * renders it from the snapshot's `timestamp`. `detail` carries the
 * changed filename (`agent_edit`) or the user-typed name (`manual`).
 */
export const formatTriggerLabel = (trigger, detail) => {
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
export const shouldCollapseAgentEdit = (snapshots, trigger, nowMs, windowMs = AGENT_EDIT_COLLAPSE_MS) => {
    if (trigger !== 'agent_edit')
        return false;
    let latest = null;
    for (const s of snapshots) {
        if (!latest || Date.parse(s.timestamp) > Date.parse(latest.timestamp)) {
            latest = s;
        }
    }
    if (!latest || latest.trigger !== 'agent_edit')
        return false;
    return nowMs - Date.parse(latest.timestamp) < windowMs;
};
/**
 * Split a snapshot list into the newest `limit` to keep and the oldest to
 * remove. Pure — the caller deletes the removed folders + rewrites the
 * index. Pruning is purely by age, no trigger is exempt.
 */
export const pruneToLimit = (snapshots, limit = SNAPSHOT_LIMIT, 
/** Never removed: the snapshot a restore is about to copy back. */
keepId) => {
    const sorted = [...snapshots].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    if (sorted.length <= limit)
        return { kept: sorted, removed: [] };
    const overBy = sorted.length - limit;
    const removed = sorted.filter((s) => s.id !== keepId).slice(0, overBy);
    return { removed, kept: sorted.filter((s) => !removed.includes(s)) };
};
// ---- Index read/write ----
const readIndex = async (projectPath) => {
    try {
        const raw = await fs.readFile(indexPath(projectPath), 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed &&
            typeof parsed === 'object' &&
            Array.isArray(parsed.snapshots)) {
            return parsed.snapshots;
        }
        return [];
    }
    catch {
        // Missing or malformed index — treat as no snapshots.
        return [];
    }
};
const writeIndex = async (projectPath, snapshots) => {
    await fs.mkdir(scampDir(projectPath), { recursive: true });
    // Atomic: a torn index reads back as no snapshots at all.
    await atomicWrite(indexPath(projectPath), JSON.stringify({ snapshots }, null, 2));
};
/**
 * Read, change, and write the index as one step. Snapshots are taken
 * concurrently (session open, an agent edit, auto-save), and two that
 * each read the index then wrote it back dropped one entry.
 */
const updateIndex = (projectPath, change) => serializeByKey(indexPath(projectPath), async () => {
    await writeIndex(projectPath, await change(await readIndex(projectPath)));
});
// ---- File enumeration + recursive walk ----
const exists = async (p) => {
    try {
        await fs.access(p);
        return true;
    }
    catch {
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
const addTree = async (dir, out) => {
    let entries = [];
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory())
            await addTree(p, out);
        else
            out.push(p);
    }
};
export const enumerateProjectFiles = async (projectPath, format) => {
    const out = [];
    const add = async (p) => {
        if (await exists(p))
            out.push(p);
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
        let views = [];
        try {
            views = await fs.readdir(viewsDir, { withFileTypes: true });
        }
        catch {
            // no views yet
        }
        for (const v of views) {
            if (!v.isDirectory())
                continue;
            await add(join(viewsDir, v.name, `${v.name}.tsx`));
            await add(join(viewsDir, v.name, `${v.name}.module.css`));
        }
    }
    else if (format === 'nextjs') {
        const appDir = join(projectPath, 'app');
        await add(join(appDir, 'page.tsx'));
        await add(join(appDir, 'page.module.css'));
        let entries = [];
        try {
            entries = await fs.readdir(appDir, { withFileTypes: true });
        }
        catch {
            // no app/ dir
        }
        for (const e of entries) {
            if (!e.isDirectory())
                continue;
            await add(join(appDir, e.name, 'page.tsx'));
            await add(join(appDir, e.name, 'page.module.css'));
        }
    }
    else {
        let entries = [];
        try {
            entries = await fs.readdir(projectPath);
        }
        catch {
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
    let comps = [];
    try {
        comps = await fs.readdir(componentsDir, { withFileTypes: true });
    }
    catch {
        // no components/ dir
    }
    for (const c of comps) {
        if (!c.isDirectory())
            continue;
        await add(join(componentsDir, c.name, `${c.name}.tsx`));
        await add(join(componentsDir, c.name, `${c.name}.module.css`));
    }
    return out;
};
const walkFiles = async (dir) => {
    const out = [];
    let entries = [];
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    }
    catch {
        return out;
    }
    for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory())
            out.push(...(await walkFiles(full)));
        else
            out.push(full);
    }
    return out;
};
/** Pages = enumerated `.tsx` not under `components/`. */
const countPages = (projectPath, files) => files.filter((f) => {
    if (!f.endsWith('.tsx'))
        return false;
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
export const createSnapshot = async (projectPath, format, trigger, detail, nowMs = Date.now(), keepId) => {
    try {
        const existing = await readIndex(projectPath);
        if (shouldCollapseAgentEdit(existing, trigger, nowMs))
            return null;
        const files = await enumerateProjectFiles(projectPath, format);
        const id = snapshotIdFor();
        const dir = snapshotDirFor(projectPath, id);
        for (const abs of files) {
            const dest = join(dir, relative(projectPath, abs));
            await fs.mkdir(dirname(dest), { recursive: true });
            await fs.copyFile(abs, dest);
        }
        const meta = {
            id,
            timestamp: new Date(nowMs).toISOString(),
            trigger,
            label: formatTriggerLabel(trigger, detail),
            pageCount: countPages(projectPath, files),
        };
        await updateIndex(projectPath, async (current) => {
            const { kept, removed } = pruneToLimit([...current, meta], SNAPSHOT_LIMIT, keepId);
            for (const r of removed) {
                await fs
                    .rm(snapshotDirFor(projectPath, r.id), { recursive: true, force: true })
                    .catch(() => undefined);
            }
            return kept;
        });
        return meta;
    }
    catch (err) {
        // PRD: silent-fail — never let a snapshot failure block the user.
        console.warn('[snapshotOps] createSnapshot failed:', err);
        return null;
    }
};
export const listSnapshots = async (projectPath) => readIndex(projectPath);
/**
 * Read a single page's `.tsx` + `.css` from a snapshot WITHOUT restoring —
 * powers the read-only preview. The snapshot mirrors the project layout
 * (`join(dir, relative(projectPath, abs))`), so the current absolute page
 * paths map straight back in. Returns `null` for either file the snapshot
 * doesn't contain (e.g. a page added after the snapshot was taken).
 */
export const readSnapshotPage = async (projectPath, snapshotId, tsxPath, cssPath) => {
    const dir = snapshotDirFor(projectPath, snapshotId);
    const read = async (abs) => {
        try {
            return await fs.readFile(join(dir, relative(projectPath, abs)), 'utf-8');
        }
        catch {
            return null;
        }
    };
    return { tsx: await read(tsxPath), css: await read(cssPath) };
};
export const deleteSnapshot = async (projectPath, snapshotId) => {
    try {
        const dir = snapshotDirFor(projectPath, snapshotId);
        await updateIndex(projectPath, async (current) => {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
            return current.filter((s) => s.id !== snapshotId);
        });
        return { ok: true };
    }
    catch {
        return { ok: false };
    }
};
/**
 * Restore a snapshot: first snapshot the current state (`before_restore`)
 * so the restore itself is undoable, then copy the snapshot's files back
 * over the project. Overlay copy — files added since the snapshot are
 * left in place.
 */
export const restoreSnapshot = async (projectPath, format, snapshotId, opts = {}) => {
    try {
        const existing = await readIndex(projectPath);
        if (!existing.some((s) => s.id === snapshotId)) {
            return { ok: false, error: 'Snapshot not found.' };
        }
        const dir = snapshotDirFor(projectPath, snapshotId);
        const files = await walkFiles(dir);
        if (files.length === 0) {
            return { ok: false, error: 'That snapshot has no files to restore.' };
        }
        // No safety copy, no restore: it would overwrite work with no way back.
        // The safety copy can push the count past the limit, which prunes the
        // oldest snapshot; that must not be the one being restored.
        const safety = await createSnapshot(projectPath, format, 'before_restore', undefined, opts.nowMs, snapshotId);
        if (safety === null) {
            return { ok: false, error: "Couldn't save the current state first, so nothing was restored." };
        }
        for (const abs of files) {
            const dest = join(projectPath, relative(dir, abs));
            await fs.mkdir(dirname(dest), { recursive: true });
            opts.beforeWrite?.(dest);
            await fs.copyFile(abs, dest);
        }
        return { ok: true };
    }
    catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : 'Restore failed.',
        };
    }
};
