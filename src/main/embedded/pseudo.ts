import type { WebContents } from 'electron';

/**
 * Forced pseudo-classes in the project's page, through the debugger
 * protocol, as DevTools' `:hov` does: the only way to hold a CSS `:hover`
 * once the pointer has left. The inspector marks each element to force
 * with `data-scamp-force="hover,focus"`; `syncPseudo` applies the marks.
 * see docs/plans/embedded-scamp-plan.md
 */

const FORCE_SELECTOR = '[data-scamp-force]';

/** `forced` holds backend node ids: they survive `DOM.getDocument`, which renumbers node ids. */
type GuestState = { root: number | null; forced: Set<number> };
const guests = new WeakMap<WebContents, GuestState>();
const listening = new WeakSet<WebContents>();

const send = async <T>(guest: WebContents, method: string, params?: Record<string, unknown>): Promise<T> =>
  (await guest.debugger.sendCommand(method, params)) as T;

const stateOf = async (guest: WebContents): Promise<GuestState> => {
  const known = guests.get(guest);
  if (known !== undefined && guest.debugger.isAttached()) return known;
  if (!guest.debugger.isAttached()) guest.debugger.attach('1.3');
  const state: GuestState = { root: null, forced: new Set() };
  guests.set(guest, state);
  if (!listening.has(guest)) {
    listening.add(guest);
    // A new document drops every node id, and the forced states with it.
    guest.debugger.on('message', (_e, method) => {
      const now = guests.get(guest);
      if (method === 'DOM.documentUpdated' && now !== undefined) now.root = null;
    });
  }
  await send(guest, 'DOM.enable');
  await send(guest, 'CSS.enable');
  return state;
};

const apply = async (guest: WebContents, state: GuestState): Promise<void> => {
  if (state.root === null) state.root = (await send<{ root: { nodeId: number } }>(guest, 'DOM.getDocument', { depth: 0 })).root.nodeId;
  const { nodeIds } = await send<{ nodeIds: number[] }>(guest, 'DOM.querySelectorAll', { nodeId: state.root, selector: FORCE_SELECTOR });
  const now = new Set<number>();
  for (const nodeId of nodeIds) {
    const { node } = await send<{ node: { backendNodeId: number; attributes?: string[] } }>(guest, 'DOM.describeNode', { nodeId });
    now.add(node.backendNodeId);
    const attributes = node.attributes ?? [];
    const value = attributes[attributes.indexOf('data-scamp-force') + 1] ?? '';
    await send(guest, 'CSS.forcePseudoState', { nodeId, forcedPseudoClasses: value.split(',').filter((c) => c.length > 0) });
  }
  const stale = [...state.forced].filter((id) => !now.has(id));
  if (stale.length > 0) {
    const pushed = await send<{ nodeIds: number[] }>(guest, 'DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: stale }).catch(() => ({ nodeIds: [] }));
    for (const nodeId of pushed.nodeIds) {
      if (nodeId !== 0) await send(guest, 'CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => undefined);
    }
  }
  state.forced = now;
};

const running = new WeakMap<WebContents, Promise<boolean>>();

/** Force on each marked element the states it's marked with, and release the rest. One sync at a time per page. */
export const syncPseudo = (guest: WebContents): Promise<boolean> => {
  const run = async (): Promise<boolean> => {
    try {
      const state = await stateOf(guest);
      try {
        await apply(guest, state);
      } catch {
        // A new document makes the root stale before its event arrives: ask for it again, once.
        state.root = null;
        await apply(guest, state);
      }
      return true;
    } catch {
      // Detached (DevTools took the debugger) or mid-navigation: the next sync tries again.
      return false;
    }
  };
  const next = (running.get(guest) ?? Promise.resolve(true)).then(run, run);
  running.set(guest, next);
  return next;
};
