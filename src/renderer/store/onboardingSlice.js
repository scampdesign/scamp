import { create } from 'zustand';
import { lessonsCompletedBy } from '@lib/onboardingLessons';
import { useHistoryStore } from './historySlice';
const persist = (state) => {
    const { offered, hidden, completed } = state;
    void window.scamp.updateSettings({ onboarding: { offered, hidden, completed } });
};
export const useOnboardingStore = create((set, get) => {
    const update = (patch) => {
        set(patch);
        persist(get());
    };
    return {
        offered: false,
        hidden: true,
        completed: [],
        loaded: false,
        load: async () => {
            const { onboarding } = await window.scamp.getSettings();
            set({ ...onboarding, loaded: true });
        },
        complete: (ids) => {
            const fresh = ids.filter((id) => !get().completed.includes(id));
            if (fresh.length > 0)
                update({ completed: [...get().completed, ...fresh] });
        },
        setHidden: (hidden) => update({ hidden }),
        answerOffer: (taken) => update({ offered: true, hidden: !taken }),
        restart: () => update({ offered: true, hidden: false, completed: [] }),
    };
});
/**
 * Complete lessons from what the user does. Only an entry newer than the
 * last one read counts, so undo, redo, and switching pages, which move to
 * older entries, complete nothing. Returns the unsubscribe.
 */
export const watchHistoryForLessons = () => {
    let lastSeen = Date.now();
    return useHistoryStore.subscribe((state) => {
        const onboarding = useOnboardingStore.getState();
        if (!onboarding.loaded || onboarding.hidden)
            return;
        const page = state.activePageId === null ? undefined : state.perPage[state.activePageId];
        const entry = page?.entries[page.cursor];
        if (entry === undefined || entry.timestamp <= lastSeen)
            return;
        lastSeen = entry.timestamp;
        const ids = lessonsCompletedBy(entry, onboarding.completed);
        if (ids.length > 0)
            onboarding.complete(ids);
    });
};
