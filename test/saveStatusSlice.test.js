import { describe, it, expect, beforeEach } from 'vitest';
import { useSaveStatusStore, } from '@store/saveStatusSlice';
const makeWriteAttempt = () => ({
    kind: 'write',
    tsxPath: '/tmp/home.tsx',
    cssPath: '/tmp/home.module.css',
    tsxContent: '<div />',
    cssContent: '.root {}',
});
const makePatchAttempt = () => ({
    kind: 'patch',
    cssPath: '/tmp/home.module.css',
    className: 'rect_a1b2',
    newDeclarations: 'background: red;',
});
const store = () => useSaveStatusStore.getState();
describe('saveStatusSlice', () => {
    beforeEach(() => {
        useSaveStatusStore.setState({
            state: { kind: 'saved' },
            toast: null,
            pauseStartedAt: null,
        });
    });
    describe('happy path', () => {
        it('transitions saved → unsaved → saving → saved on a full write cycle', () => {
            expect(store().state).toEqual({ kind: 'saved' });
            store().markUnsaved();
            expect(store().state).toEqual({ kind: 'unsaved' });
            const attempt = makeWriteAttempt();
            store().markSaving(attempt);
            expect(store().state).toEqual({ kind: 'saving', attempt });
            store().markConfirmed();
            expect(store().state).toEqual({ kind: 'saved' });
        });
        it('skips straight from unsaved → saved when markClean is called', () => {
            store().markUnsaved();
            store().markClean();
            expect(store().state).toEqual({ kind: 'saved' });
        });
    });
    describe('error path', () => {
        it('transitions saving → error and retains the attempt for retry', () => {
            const attempt = makeWriteAttempt();
            store().markSaving(attempt);
            store().markError('disk full', attempt);
            expect(store().state).toEqual({
                kind: 'error',
                message: 'disk full',
                lastAttempt: attempt,
            });
        });
        it('keeps the error state visible through a subsequent unsaved edit', () => {
            const attempt = makeWriteAttempt();
            store().markError('disk full', attempt);
            store().markUnsaved();
            expect(store().state.kind).toBe('error');
        });
        it('clears the error state when a later save confirms', () => {
            const attempt = makeWriteAttempt();
            store().markError('disk full', attempt);
            store().markSaving(attempt);
            expect(store().state.kind).toBe('saving');
            store().markConfirmed();
            expect(store().state).toEqual({ kind: 'saved' });
        });
    });
    describe('markClean guards', () => {
        it('does not flip saving or error states to saved', () => {
            const attempt = makePatchAttempt();
            store().markSaving(attempt);
            store().markClean();
            expect(store().state.kind).toBe('saving');
            store().markError('bad', attempt);
            store().markClean();
            expect(store().state.kind).toBe('error');
        });
        it('leaves saved unchanged', () => {
            store().markClean();
            expect(store().state).toEqual({ kind: 'saved' });
        });
    });
    describe('markConfirmed guards', () => {
        it('is a no-op when no save is in flight', () => {
            store().markConfirmed();
            expect(store().state).toEqual({ kind: 'saved' });
            store().markUnsaved();
            store().markConfirmed();
            expect(store().state).toEqual({ kind: 'unsaved' });
        });
        it('does not override a pending error', () => {
            const attempt = makeWriteAttempt();
            store().markError('bad', attempt);
            store().markConfirmed();
            expect(store().state.kind).toBe('error');
        });
    });
    describe('markUnsaved guards', () => {
        it('does not interrupt an in-flight save', () => {
            const attempt = makeWriteAttempt();
            store().markSaving(attempt);
            store().markUnsaved();
            expect(store().state).toEqual({ kind: 'saving', attempt });
        });
    });
    describe('patch attempts', () => {
        it('stores the full patch attempt on markSaving for retry', () => {
            const attempt = makePatchAttempt();
            store().markSaving(attempt);
            expect(store().state).toEqual({ kind: 'saving', attempt });
            store().markError('parse failed', attempt);
            expect(store().state).toEqual({
                kind: 'error',
                message: 'parse failed',
                lastAttempt: attempt,
            });
        });
    });
    describe('markPaused', () => {
        it('transitions saved → paused with the reason', () => {
            store().markPaused('external-edit');
            expect(store().state).toEqual({
                kind: 'paused',
                reason: 'external-edit',
            });
        });
        it('transitions unsaved → paused', () => {
            store().markUnsaved();
            store().markPaused('manual');
            expect(store().state.kind).toBe('paused');
        });
        it('does not stomp saving / error / diverged / reloaded-from-disk', () => {
            const attempt = makeWriteAttempt();
            store().markSaving(attempt);
            store().markPaused('external-edit');
            expect(store().state.kind).toBe('saving');
            store().markError('boom', attempt);
            store().markPaused('external-edit');
            expect(store().state.kind).toBe('error');
            useSaveStatusStore.setState({
                state: { kind: 'diverged', lastAttempt: attempt },
            });
            store().markPaused('external-edit');
            expect(store().state.kind).toBe('diverged');
            useSaveStatusStore.setState({
                state: { kind: 'reloaded-from-disk', file: 'home.tsx' },
            });
            store().markPaused('external-edit');
            expect(store().state.kind).toBe('reloaded-from-disk');
        });
        it('idempotent for the same reason; refreshes when reason changes', () => {
            store().markPaused('external-edit');
            const before = store().state;
            store().markPaused('external-edit');
            expect(store().state).toBe(before);
            store().markPaused('manual');
            expect(store().state).toEqual({
                kind: 'paused',
                reason: 'manual',
            });
        });
        it('captures pauseStartedAt on entry; preserves across reason flips', () => {
            const before = Date.now();
            store().markPaused('external-edit');
            const started = store().pauseStartedAt;
            expect(started).not.toBeNull();
            expect(started).toBeGreaterThanOrEqual(before);
            // Reason flips don't reset the timestamp — the diverged
            // popover needs to keep filtering history from the original
            // pause moment, not whichever sub-signal is most recent.
            store().markPaused('manual');
            expect(store().pauseStartedAt).toBe(started);
        });
    });
    describe('markResumed', () => {
        it('paused → saved when the canvas matches disk; clears pauseStartedAt', () => {
            store().markPaused('external-edit');
            expect(store().pauseStartedAt).not.toBeNull();
            store().markResumed(null);
            expect(store().state).toEqual({ kind: 'saved' });
            expect(store().pauseStartedAt).toBeNull();
        });
        it('paused → diverged when canvas state differs from disk; keeps pauseStartedAt', () => {
            const attempt = makeWriteAttempt();
            store().markPaused('external-edit');
            const started = store().pauseStartedAt;
            store().markResumed(attempt);
            expect(store().state).toEqual({ kind: 'diverged', lastAttempt: attempt });
            // Diverged popover filters history from this moment.
            expect(store().pauseStartedAt).toBe(started);
        });
        it('is a no-op when not paused', () => {
            store().markUnsaved();
            store().markResumed(null);
            expect(store().state).toEqual({ kind: 'unsaved' });
        });
    });
    describe('toast', () => {
        it('starts null; showToast sets a unique id + message', () => {
            expect(store().toast).toBeNull();
            store().showToast('first');
            const first = store().toast;
            expect(first?.message).toBe('first');
            store().showToast('second');
            const second = store().toast;
            expect(second?.message).toBe('second');
            expect(second?.id).not.toBe(first?.id);
        });
        it('dismissToast clears only when id matches', () => {
            store().showToast('first');
            const id = store().toast?.id ?? -1;
            store().dismissToast(999);
            expect(store().toast?.message).toBe('first');
            store().dismissToast(id);
            expect(store().toast).toBeNull();
        });
        it('toast lifecycle is independent of state transitions', () => {
            store().showToast('hello');
            store().markUnsaved();
            expect(store().toast?.message).toBe('hello');
            const attempt = makeWriteAttempt();
            store().markSaving(attempt);
            store().markConfirmed();
            expect(store().toast?.message).toBe('hello');
        });
    });
    describe('markReloadedFromDisk', () => {
        it('overrides any prior state — disk drift is terminal', () => {
            const attempt = makeWriteAttempt();
            store().markSaving(attempt);
            store().markReloadedFromDisk('home.tsx');
            expect(store().state).toEqual({
                kind: 'reloaded-from-disk',
                file: 'home.tsx',
            });
        });
        it('clears on a subsequent successful save cycle', () => {
            store().markReloadedFromDisk('home.tsx');
            store().markUnsaved();
            // markUnsaved is a no-op on terminal states by design — error
            // already worked that way; reloaded-from-disk follows the same
            // rule so the user sees it until they take a fresh action.
            expect(store().state.kind).toBe('reloaded-from-disk');
            const attempt = makeWriteAttempt();
            store().markSaving(attempt);
            store().markConfirmed();
            expect(store().state).toEqual({ kind: 'saved' });
        });
    });
});
