/**
 * Forced pseudo-classes in the project's page, through the debugger
 * protocol, as DevTools' `:hov` does: the only way to hold a CSS `:hover`
 * once the pointer has left. The inspector marks each element to force
 * with `data-scamp-force="hover,focus"`; `syncPseudo` applies the marks.
 * see docs/plans/embedded-scamp-plan.md
 */
const FORCE_SELECTOR = '[data-scamp-force]';
const guests = new WeakMap();
const listening = new WeakSet();
const send = async (guest, method, params) => (await guest.debugger.sendCommand(method, params));
const stateOf = async (guest) => {
    const known = guests.get(guest);
    if (known !== undefined && guest.debugger.isAttached())
        return known;
    if (!guest.debugger.isAttached())
        guest.debugger.attach('1.3');
    const state = { root: null, forced: new Set() };
    guests.set(guest, state);
    if (!listening.has(guest)) {
        listening.add(guest);
        // A new document drops every node id, and the forced states with it.
        guest.debugger.on('message', (_e, method) => {
            const now = guests.get(guest);
            if (method === 'DOM.documentUpdated' && now !== undefined)
                now.root = null;
        });
    }
    await send(guest, 'DOM.enable');
    await send(guest, 'CSS.enable');
    return state;
};
const apply = async (guest, state) => {
    if (state.root === null)
        state.root = (await send(guest, 'DOM.getDocument', { depth: 0 })).root.nodeId;
    const { nodeIds } = await send(guest, 'DOM.querySelectorAll', { nodeId: state.root, selector: FORCE_SELECTOR });
    const now = new Set();
    for (const nodeId of nodeIds) {
        const { node } = await send(guest, 'DOM.describeNode', { nodeId });
        now.add(node.backendNodeId);
        const attributes = node.attributes ?? [];
        const value = attributes[attributes.indexOf('data-scamp-force') + 1] ?? '';
        await send(guest, 'CSS.forcePseudoState', { nodeId, forcedPseudoClasses: value.split(',').filter((c) => c.length > 0) });
    }
    const stale = [...state.forced].filter((id) => !now.has(id));
    if (stale.length > 0) {
        const pushed = await send(guest, 'DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: stale }).catch(() => ({ nodeIds: [] }));
        for (const nodeId of pushed.nodeIds) {
            if (nodeId !== 0)
                await send(guest, 'CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => undefined);
        }
    }
    state.forced = now;
};
const running = new WeakMap();
/** Force on each marked element the states it's marked with, and release the rest. One sync at a time per page. */
export const syncPseudo = (guest) => {
    const run = async () => {
        try {
            const state = await stateOf(guest);
            try {
                await apply(guest, state);
            }
            catch {
                // A new document makes the root stale before its event arrives: ask for it again, once.
                state.root = null;
                await apply(guest, state);
            }
            return true;
        }
        catch {
            // Detached (DevTools took the debugger) or mid-navigation: the next sync tries again.
            return false;
        }
    };
    const next = (running.get(guest) ?? Promise.resolve(true)).then(run, run);
    running.set(guest, next);
    return next;
};
