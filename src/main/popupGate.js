/**
 * Whether the preview may open a pop-up in the system browser: only just
 * after the user pressed something in it, and once per press. Page code
 * calling `window.open` on a timer (an agent's, or a cloned project's)
 * could otherwise open tab after tab with no click at all.
 */
export const createPopupGate = (now = Date.now, windowMs = 1000) => {
    let pressedAt = null;
    return {
        noteInput: (type) => {
            if (type === 'mouseDown' || type === 'keyDown' || type === 'rawKeyDown' || type === 'touchStart')
                pressedAt = now();
        },
        allow: () => {
            if (pressedAt === null || now() - pressedAt > windowMs)
                return false;
            pressedAt = null;
            return true;
        },
    };
};
