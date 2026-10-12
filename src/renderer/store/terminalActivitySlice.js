import { create } from 'zustand';
export const useTerminalActivityStore = create((set) => ({
    userIntent: 'auto',
    setUserIntent: (intent) => {
        set({ userIntent: intent });
    },
}));
/** True while the user has paused sync. */
export const selectSyncPaused = (state) => state.userIntent === 'paused';
