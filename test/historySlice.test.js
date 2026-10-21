import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useHistoryStore } from '@store/historySlice';
import { MAX_HISTORY_ENTRIES, COALESCE_WINDOW_MS, } from '@store/historyTypes';
// Minimal stand-in for an elements map. Each test builds its own
// snapshots via `snapshot(label)` so we can assert identity by
// inspecting the `__tag` field rather than recreating the full
// ScampElement shape.
const snapshot = (tag) => ({
    [tag]: { __tag: tag },
});
const reset = () => {
    useHistoryStore.setState({
        perPage: {},
        activePageId: null,
        transactionDepth: 0,
        pendingExternalEdit: null,
        restoreSnapshot: null,
    });
};
describe('historySlice — basic stack', () => {
    beforeEach(reset);
    it('starts empty with no active page', () => {
        const state = useHistoryStore.getState();
        expect(state.perPage).toEqual({});
        expect(state.activePageId).toBeNull();
    });
    it('commitHistory is a no-op when no page is active', () => {
        useHistoryStore.getState().commitHistory({ kind: 'draw-rect' }, snapshot('a'));
        expect(useHistoryStore.getState().perPage).toEqual({});
    });
    it('initialises an empty page history on first setActivePageId', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        const page = useHistoryStore.getState().perPage['home.tsx'];
        expect(page).toEqual({ entries: [], cursor: -1 });
    });
    it('commits a draw-rect entry and advances the cursor', () => {
        const { setActivePageId, commitHistory } = useHistoryStore.getState();
        setActivePageId('home.tsx');
        commitHistory({ kind: 'draw-rect', elementIds: ['a1b2'] }, snapshot('s1'));
        const page = useHistoryStore.getState().perPage['home.tsx'];
        expect(page.entries).toHaveLength(1);
        expect(page.cursor).toBe(0);
        expect(page.entries[0]?.kind).toBe('draw-rect');
        expect(page.entries[0]?.elementIds).toEqual(['a1b2']);
    });
    it('undo moves cursor back one entry and calls restore', () => {
        const restore = vi.fn();
        useHistoryStore.getState().setRestoreSnapshot(restore);
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { commitHistory, undo } = useHistoryStore.getState();
        commitHistory({ kind: 'draw-rect' }, snapshot('s1'));
        commitHistory({ kind: 'draw-rect' }, snapshot('s2'));
        undo();
        expect(useHistoryStore.getState().perPage['home.tsx']?.cursor).toBe(0);
        expect(restore).toHaveBeenCalledTimes(1);
        expect(restore).toHaveBeenLastCalledWith(snapshot('s1'));
    });
    it('redo moves cursor forward and calls restore', () => {
        const restore = vi.fn();
        useHistoryStore.getState().setRestoreSnapshot(restore);
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { commitHistory, undo, redo } = useHistoryStore.getState();
        commitHistory({ kind: 'draw-rect' }, snapshot('s1'));
        commitHistory({ kind: 'draw-rect' }, snapshot('s2'));
        undo();
        restore.mockClear();
        redo();
        expect(useHistoryStore.getState().perPage['home.tsx']?.cursor).toBe(1);
        expect(restore).toHaveBeenCalledWith(snapshot('s2'));
    });
    it('undo at cursor 0 is a no-op (does not call restore)', () => {
        const restore = vi.fn();
        useHistoryStore.getState().setRestoreSnapshot(restore);
        useHistoryStore.getState().setActivePageId('home.tsx');
        useHistoryStore
            .getState()
            .commitHistory({ kind: 'draw-rect' }, snapshot('s1'));
        useHistoryStore.getState().undo();
        expect(useHistoryStore.getState().perPage['home.tsx']?.cursor).toBe(0);
        expect(restore).not.toHaveBeenCalled();
    });
    it('redo at the head is a no-op', () => {
        const restore = vi.fn();
        useHistoryStore.getState().setRestoreSnapshot(restore);
        useHistoryStore.getState().setActivePageId('home.tsx');
        useHistoryStore
            .getState()
            .commitHistory({ kind: 'draw-rect' }, snapshot('s1'));
        useHistoryStore.getState().redo();
        expect(restore).not.toHaveBeenCalled();
    });
    it('a new commit after undo discards forward entries', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { commitHistory, undo } = useHistoryStore.getState();
        commitHistory({ kind: 'draw-rect' }, snapshot('s1'));
        commitHistory({ kind: 'draw-rect' }, snapshot('s2'));
        commitHistory({ kind: 'draw-rect' }, snapshot('s3'));
        undo();
        undo();
        commitHistory({ kind: 'draw-rect' }, snapshot('s2b'));
        const page = useHistoryStore.getState().perPage['home.tsx'];
        expect(page.entries.map((e) => Object.keys(e.snapshot)[0])).toEqual([
            's1',
            's2b',
        ]);
        expect(page.cursor).toBe(1);
    });
    it('caps the stack at MAX_HISTORY_ENTRIES, dropping the oldest entry when full', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { commitHistory } = useHistoryStore.getState();
        for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i += 1) {
            commitHistory({ kind: 'draw-rect' }, snapshot(`s${i}`));
        }
        const page = useHistoryStore.getState().perPage['home.tsx'];
        expect(page.entries).toHaveLength(MAX_HISTORY_ENTRIES);
        expect(page.cursor).toBe(MAX_HISTORY_ENTRIES - 1);
        // The oldest 5 entries are gone.
        expect(Object.keys(page.entries[0].snapshot)[0]).toBe('s5');
    });
    it('identity-equality short-circuits a no-op commit', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        const snap = snapshot('s1');
        const { commitHistory } = useHistoryStore.getState();
        commitHistory({ kind: 'draw-rect' }, snap);
        commitHistory({ kind: 'draw-rect' }, snap);
        expect(useHistoryStore.getState().perPage['home.tsx']?.entries).toHaveLength(1);
    });
    it('jumpToHistory restores the targeted snapshot', () => {
        const restore = vi.fn();
        useHistoryStore.getState().setRestoreSnapshot(restore);
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { commitHistory, jumpToHistory } = useHistoryStore.getState();
        commitHistory({ kind: 'draw-rect' }, snapshot('s1'));
        commitHistory({ kind: 'draw-rect' }, snapshot('s2'));
        commitHistory({ kind: 'draw-rect' }, snapshot('s3'));
        jumpToHistory(0);
        expect(useHistoryStore.getState().perPage['home.tsx']?.cursor).toBe(0);
        expect(restore).toHaveBeenCalledWith(snapshot('s1'));
    });
    it('jumpToHistory ignores out-of-range indices', () => {
        const restore = vi.fn();
        useHistoryStore.getState().setRestoreSnapshot(restore);
        useHistoryStore.getState().setActivePageId('home.tsx');
        useHistoryStore
            .getState()
            .commitHistory({ kind: 'draw-rect' }, snapshot('s1'));
        useHistoryStore.getState().jumpToHistory(5);
        useHistoryStore.getState().jumpToHistory(-2);
        expect(useHistoryStore.getState().perPage['home.tsx']?.cursor).toBe(0);
        expect(restore).not.toHaveBeenCalled();
    });
});
describe('historySlice — coalescing', () => {
    beforeEach(reset);
    it('coalesces two patch entries on the same element/property within 500ms', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { commitHistory } = useHistoryStore.getState();
        commitHistory({
            kind: 'patch',
            elementIds: ['a1b2'],
            propertyKeys: ['backgroundColor'],
        }, snapshot('s1'));
        commitHistory({
            kind: 'patch',
            elementIds: ['a1b2'],
            propertyKeys: ['backgroundColor'],
        }, snapshot('s2'));
        const page = useHistoryStore.getState().perPage['home.tsx'];
        expect(page.entries).toHaveLength(1);
        // The latest snapshot wins.
        expect(Object.keys(page.entries[0].snapshot)[0]).toBe('s2');
    });
    it('does NOT coalesce when property keys differ', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { commitHistory } = useHistoryStore.getState();
        commitHistory({ kind: 'patch', elementIds: ['a1b2'], propertyKeys: ['backgroundColor'] }, snapshot('s1'));
        commitHistory({ kind: 'patch', elementIds: ['a1b2'], propertyKeys: ['opacity'] }, snapshot('s2'));
        expect(useHistoryStore.getState().perPage['home.tsx']?.entries).toHaveLength(2);
    });
    it('does NOT coalesce when element ids differ', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { commitHistory } = useHistoryStore.getState();
        commitHistory({ kind: 'patch', elementIds: ['a1b2'], propertyKeys: ['backgroundColor'] }, snapshot('s1'));
        commitHistory({ kind: 'patch', elementIds: ['c3d4'], propertyKeys: ['backgroundColor'] }, snapshot('s2'));
        expect(useHistoryStore.getState().perPage['home.tsx']?.entries).toHaveLength(2);
    });
    it('does NOT coalesce across kinds (move + patch)', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { commitHistory } = useHistoryStore.getState();
        commitHistory({ kind: 'move', elementIds: ['a1b2'] }, snapshot('s1'));
        commitHistory({ kind: 'patch', elementIds: ['a1b2'], propertyKeys: ['x'] }, snapshot('s2'));
        expect(useHistoryStore.getState().perPage['home.tsx']?.entries).toHaveLength(2);
    });
    it('does NOT coalesce when the gap is > 500ms', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { commitHistory } = useHistoryStore.getState();
        const realDate = Date.now;
        let t = 1_000_000;
        Date.now = () => t;
        try {
            commitHistory({ kind: 'patch', elementIds: ['a1b2'], propertyKeys: ['backgroundColor'] }, snapshot('s1'));
            t += COALESCE_WINDOW_MS + 50;
            commitHistory({ kind: 'patch', elementIds: ['a1b2'], propertyKeys: ['backgroundColor'] }, snapshot('s2'));
        }
        finally {
            Date.now = realDate;
        }
        expect(useHistoryStore.getState().perPage['home.tsx']?.entries).toHaveLength(2);
    });
    it('coalesces order-insensitively on property keys', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { commitHistory } = useHistoryStore.getState();
        commitHistory({
            kind: 'patch',
            elementIds: ['a1b2'],
            propertyKeys: ['backgroundColor', 'opacity'],
        }, snapshot('s1'));
        commitHistory({
            kind: 'patch',
            elementIds: ['a1b2'],
            propertyKeys: ['opacity', 'backgroundColor'],
        }, snapshot('s2'));
        expect(useHistoryStore.getState().perPage['home.tsx']?.entries).toHaveLength(1);
    });
});
describe('historySlice — transactions', () => {
    beforeEach(reset);
    it('skips commits during a transaction and records one entry on end', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { beginHistoryTransaction, commitHistory, endHistoryTransaction } = useHistoryStore.getState();
        beginHistoryTransaction();
        // 30 ticks of a drag — none should commit.
        for (let i = 0; i < 30; i += 1) {
            commitHistory({ kind: 'move', elementIds: ['a1b2'] }, snapshot(`t${i}`));
        }
        expect(useHistoryStore.getState().perPage['home.tsx']?.entries).toHaveLength(0);
        endHistoryTransaction({ kind: 'move', elementIds: ['a1b2'] }, snapshot('final'));
        const page = useHistoryStore.getState().perPage['home.tsx'];
        expect(page.entries).toHaveLength(1);
        expect(page.entries[0]?.kind).toBe('move');
        expect(Object.keys(page.entries[0].snapshot)[0]).toBe('final');
    });
    it('handles nested begins — only outermost end commits', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        const { beginHistoryTransaction, commitHistory, endHistoryTransaction, } = useHistoryStore.getState();
        beginHistoryTransaction();
        beginHistoryTransaction();
        commitHistory({ kind: 'move', elementIds: ['a1b2'] }, snapshot('inner'));
        endHistoryTransaction({ kind: 'move', elementIds: ['a1b2'] }, snapshot('inner-end'));
        expect(useHistoryStore.getState().perPage['home.tsx']?.entries).toHaveLength(0);
        endHistoryTransaction({ kind: 'move', elementIds: ['a1b2'] }, snapshot('outer-end'));
        const page = useHistoryStore.getState().perPage['home.tsx'];
        expect(page.entries).toHaveLength(1);
        expect(Object.keys(page.entries[0].snapshot)[0]).toBe('outer-end');
    });
    it('endHistoryTransaction without a matching begin is a no-op', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        useHistoryStore
            .getState()
            .endHistoryTransaction({ kind: 'move', elementIds: ['a1b2'] }, snapshot('orphan'));
        expect(useHistoryStore.getState().perPage['home.tsx']?.entries ?? []).toHaveLength(0);
    });
});
describe('historySlice — per-page isolation', () => {
    beforeEach(reset);
    it('keeps separate stacks per page id', () => {
        const { setActivePageId, commitHistory } = useHistoryStore.getState();
        setActivePageId('home.tsx');
        commitHistory({ kind: 'draw-rect' }, snapshot('home1'));
        setActivePageId('about.tsx');
        commitHistory({ kind: 'draw-rect' }, snapshot('about1'));
        const state = useHistoryStore.getState();
        expect(state.perPage['home.tsx']?.entries).toHaveLength(1);
        expect(state.perPage['about.tsx']?.entries).toHaveLength(1);
        expect(Object.keys(state.perPage['home.tsx'].entries[0].snapshot)[0]).toBe('home1');
    });
    it('switching pages restores the previous page stack on switch-back', () => {
        const { setActivePageId, commitHistory } = useHistoryStore.getState();
        setActivePageId('home.tsx');
        commitHistory({ kind: 'draw-rect' }, snapshot('home1'));
        commitHistory({ kind: 'draw-rect' }, snapshot('home2'));
        setActivePageId('about.tsx');
        commitHistory({ kind: 'draw-rect' }, snapshot('about1'));
        setActivePageId('home.tsx');
        const page = useHistoryStore.getState().perPage['home.tsx'];
        expect(page.entries).toHaveLength(2);
        expect(page.cursor).toBe(1);
    });
    it('rekeyPage moves a page history under a new key (page rename)', () => {
        const { setActivePageId, commitHistory, rekeyPage } = useHistoryStore.getState();
        setActivePageId('home.tsx');
        commitHistory({ kind: 'draw-rect' }, snapshot('home1'));
        rekeyPage('home.tsx', 'landing.tsx');
        const state = useHistoryStore.getState();
        expect(state.perPage['home.tsx']).toBeUndefined();
        expect(state.perPage['landing.tsx']?.entries).toHaveLength(1);
        expect(state.activePageId).toBe('landing.tsx');
    });
    it('forgetPage drops a deleted page’s history, so a new page of that name starts empty', () => {
        // Undo in the new page used to restore the deleted one and write it to disk.
        // see docs/audits/2026-10-20-repo-audit.md, finding 11
        const { setActivePageId, commitHistory, forgetPage, commitInitialIfEmpty } = useHistoryStore.getState();
        setActivePageId('about.tsx');
        commitHistory({ kind: 'draw-rect' }, snapshot('deleted page'));
        forgetPage('about.tsx');
        expect(useHistoryStore.getState().perPage['about.tsx']).toBeUndefined();
        commitInitialIfEmpty(snapshot('new page'));
        expect(useHistoryStore.getState().perPage['about.tsx']?.entries).toHaveLength(1);
    });
    it('forgetPage leaves other pages alone, and does nothing for an unknown page', () => {
        const { setActivePageId, commitHistory, forgetPage } = useHistoryStore.getState();
        setActivePageId('home.tsx');
        commitHistory({ kind: 'draw-rect' }, snapshot('home1'));
        forgetPage('missing.tsx');
        expect(useHistoryStore.getState().perPage['home.tsx']?.entries).toHaveLength(1);
    });
});
describe('historySlice — external edits', () => {
    beforeEach(reset);
    it('records an external edit as a single entry when no transaction is open', () => {
        useHistoryStore.getState().setActivePageId('home.tsx');
        useHistoryStore.getState().enqueueExternalEdit(snapshot('ext1'));
        const page = useHistoryStore.getState().perPage['home.tsx'];
        expect(page.entries).toHaveLength(1);
        expect(page.entries[0]?.kind).toBe('external-edit');
    });
    it('an external edit trims forward history beyond the current cursor', () => {
        const { setActivePageId, commitHistory, undo, enqueueExternalEdit } = useHistoryStore.getState();
        setActivePageId('home.tsx');
        commitHistory({ kind: 'draw-rect' }, snapshot('s1'));
        commitHistory({ kind: 'draw-rect' }, snapshot('s2'));
        commitHistory({ kind: 'draw-rect' }, snapshot('s3'));
        undo();
        undo();
        enqueueExternalEdit(snapshot('ext1'));
        const page = useHistoryStore.getState().perPage['home.tsx'];
        // Entries beyond cursor (s2, s3) are gone; ext1 replaces them.
        expect(page.entries.map((e) => Object.keys(e.snapshot)[0])).toEqual([
            's1',
            'ext1',
        ]);
        expect(page.cursor).toBe(1);
    });
    it('an external edit during a transaction is deferred and drained on transaction end', () => {
        const restore = vi.fn();
        useHistoryStore.getState().setRestoreSnapshot(restore);
        const { setActivePageId, beginHistoryTransaction, enqueueExternalEdit, endHistoryTransaction, } = useHistoryStore.getState();
        setActivePageId('home.tsx');
        beginHistoryTransaction();
        enqueueExternalEdit(snapshot('ext1'));
        // While inside the transaction, the external edit is still pending.
        expect(useHistoryStore.getState().pendingExternalEdit?.snapshot).toEqual(snapshot('ext1'));
        expect(useHistoryStore.getState().perPage['home.tsx']?.entries ?? []).toHaveLength(0);
        endHistoryTransaction({ kind: 'move', elementIds: ['a1b2'] }, snapshot('drag-final'));
        // After the transaction ends: drag entry committed, then external entry committed.
        const page = useHistoryStore.getState().perPage['home.tsx'];
        expect(page.entries.map((e) => e.kind)).toEqual([
            'move',
            'external-edit',
        ]);
        // The restore callback was called once to apply the external snapshot.
        expect(restore).toHaveBeenCalledTimes(1);
        expect(restore).toHaveBeenCalledWith(snapshot('ext1'));
        expect(useHistoryStore.getState().pendingExternalEdit).toBeNull();
    });
    it('multiple external edits during a transaction collapse to the latest', () => {
        const restore = vi.fn();
        useHistoryStore.getState().setRestoreSnapshot(restore);
        const { setActivePageId, beginHistoryTransaction, enqueueExternalEdit, endHistoryTransaction, } = useHistoryStore.getState();
        setActivePageId('home.tsx');
        beginHistoryTransaction();
        enqueueExternalEdit(snapshot('ext1'));
        enqueueExternalEdit(snapshot('ext2'));
        enqueueExternalEdit(snapshot('ext3'));
        endHistoryTransaction({ kind: 'move', elementIds: ['a1b2'] }, snapshot('drag-final'));
        const page = useHistoryStore.getState().perPage['home.tsx'];
        expect(page.entries).toHaveLength(2);
        expect(Object.keys(page.entries[1].snapshot)[0]).toBe('ext3');
        expect(restore).toHaveBeenCalledTimes(1);
        expect(restore).toHaveBeenCalledWith(snapshot('ext3'));
    });
});
