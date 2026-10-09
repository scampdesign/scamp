export const triggerIcon = (trigger) => {
    switch (trigger) {
        case 'session_open':
            return 'session-open';
        case 'session_close':
            return 'session-close';
        case 'agent_edit':
        case 'agent_session':
            return 'agent';
        case 'manual':
            return 'manual';
        case 'auto_save':
            return 'auto';
        case 'before_restore':
            return 'restore';
    }
};
/**
 * Snapshots are stored oldest-first in `snapshots.json`; the panel shows
 * newest at the top. Returns a new array (doesn't mutate).
 */
export const snapshotsNewestFirst = (snapshots) => [...snapshots].reverse();
/** `pageCount` → "2 pages" / "1 page". */
export const formatPageCount = (count) => `${count} ${count === 1 ? 'page' : 'pages'}`;
/**
 * Build the unified History timeline: durable on-disk snapshots interleaved
 * with the active page's in-memory undo entries, newest first. The undo
 * entries give per-edit granularity between the coarser snapshots without
 * extra disk writes. The synthetic `load` baseline entry is omitted (it's
 * not a user action). `cursor` is the undo entry the canvas is currently at
 * (`-1` = none); entries past it are redoable. See docs/notes/snapshots.md.
 */
export const mergeHistoryTimeline = (snapshots, undoEntries, cursor) => {
    const items = [];
    for (const snapshot of snapshots) {
        items.push({ kind: 'snapshot', ts: Date.parse(snapshot.timestamp), snapshot });
    }
    undoEntries.forEach((entry, index) => {
        if (entry.kind === 'load')
            return;
        items.push({
            kind: 'undo',
            ts: entry.timestamp,
            index,
            entry,
            isCurrent: index === cursor,
            isFuture: index > cursor,
        });
    });
    // Newest first. Tie-break: a snapshot shares its moment with the undo
    // entry it was taken at — show the durable checkpoint above.
    return items.sort((a, b) => {
        if (b.ts !== a.ts)
            return b.ts - a.ts;
        if (a.kind === b.kind)
            return 0;
        return a.kind === 'snapshot' ? -1 : 1;
    });
};
