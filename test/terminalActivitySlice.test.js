import { describe, it, expect, beforeEach } from 'vitest';
import { selectSyncPaused, useTerminalActivityStore } from '@store/terminalActivitySlice';
const store = () => useTerminalActivityStore.getState();
describe('terminalActivitySlice', () => {
    beforeEach(() => {
        useTerminalActivityStore.setState({ userIntent: 'auto' });
    });
    it('starts unpaused', () => {
        expect(selectSyncPaused(store())).toBe(false);
    });
    it('pauses only when the user pauses, and resumes when they resume', () => {
        store().setUserIntent('paused');
        expect(selectSyncPaused(store())).toBe(true);
        store().setUserIntent('auto');
        expect(selectSyncPaused(store())).toBe(false);
    });
});
