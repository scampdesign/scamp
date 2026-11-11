/**
 * @param send          How to deliver an ack to the renderer.
 * @param expiryMs      If chokidar never fires for a registered path,
 *                      the ack is emitted anyway after this delay so
 *                      the indicator unwinds.
 */
export const createPendingWriteTracker = (send, expiryMs) => {
    const pending = new Map();
    const register = (path, writeId, suppressChanged, expected) => {
        const existing = pending.get(path);
        if (existing) {
            // Ack the superseded write so the renderer doesn't watchdog it.
            // see docs/notes/components-sync.md
            clearTimeout(existing.timer);
            send({ writeId: existing.writeId, path });
        }
        const timer = setTimeout(() => {
            const entry = pending.get(path);
            pending.delete(path);
            if (!entry)
                return;
            send({ writeId: entry.writeId, path });
        }, expiryMs);
        pending.set(path, { writeId, suppressChanged, expected, timer });
    };
    const cancel = (path) => {
        const existing = pending.get(path);
        if (!existing)
            return;
        clearTimeout(existing.timer);
        pending.delete(path);
    };
    const consume = (path) => {
        const entry = pending.get(path);
        if (!entry)
            return null;
        clearTimeout(entry.timer);
        pending.delete(path);
        send({ writeId: entry.writeId, path });
        return entry.expected === undefined
            ? { writeId: entry.writeId, suppressChanged: entry.suppressChanged }
            : { writeId: entry.writeId, suppressChanged: entry.suppressChanged, expected: entry.expected };
    };
    return {
        register,
        cancel,
        consume,
        size: () => pending.size,
    };
};
