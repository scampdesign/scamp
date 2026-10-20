/**
 * Whether the preview may open a pop-up in the system browser: only just
 * after the user pressed something in it, and once per press. Page code
 * calling `window.open` on a timer (an agent's, or a cloned project's)
 * could otherwise open tab after tab with no click at all.
 */
export declare const createPopupGate: (now?: () => number, windowMs?: number) => {
    noteInput: (type: string) => void;
    allow: () => boolean;
};
