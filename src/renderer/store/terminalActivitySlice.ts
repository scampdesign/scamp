import { create } from 'zustand';

/**
 * The user's manual sync pause, from the save indicator's **Pause sync**.
 * Project switch resets it to `'auto'` so a pause doesn't bleed across
 * sessions.
 *
 * This used to also pause whenever any program ran in Scamp's terminal,
 * which kept sync off for as long as an idle Claude Code sat at its
 * prompt. Edits made then lived only in memory and were lost to the
 * agent's next write. Writes that race an agent are already covered by
 * the quiet window and the compare-and-swap merge.
 * see docs/notes/agent-coexistence.md
 */
export type UserSyncIntent = 'auto' | 'paused';

type TerminalActivityState = {
  userIntent: UserSyncIntent;
  setUserIntent: (intent: UserSyncIntent) => void;
};

export const useTerminalActivityStore = create<TerminalActivityState>((set) => ({
  userIntent: 'auto',
  setUserIntent: (intent) => {
    set({ userIntent: intent });
  },
}));

/** True while the user has paused sync. */
export const selectSyncPaused = (state: TerminalActivityState): boolean =>
  state.userIntent === 'paused';
