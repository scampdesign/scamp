import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { viewNameForRoute } from '@shared/reactRoutes';
import type { ImportResultPayload } from '@shared/types';

/**
 * Import several of a React app's routes in one run: visit each, read it
 * at every width, hand it to the app window, wait for the verdict, move
 * on. One route at a time — the app window writes a view per delivery,
 * and the next route's name has to see the last one's.
 *
 * Every view the run makes is one batch, which **Remove these pages**
 * undoes in one step.
 * see docs/plans/react-import-plan.md
 */

export type BatchItemStatus = 'waiting' | 'running' | 'imported' | 'redirected' | 'failed' | 'skipped';

export type BatchItem = {
  /** The route pattern, `/patients/:patientId`. */
  route: string;
  /** What was visited, params filled in. */
  path: string;
  status: BatchItemStatus;
  viewName?: string;
  /** Where a redirect went, or why it failed. */
  detail?: string;
};

export type BatchState = {
  id: string;
  items: BatchItem[];
  running: boolean;
  /** Once every page is in: the components the app window found across them. */
  finishing?: boolean;
  components?: Array<{ name: string; instances: number; views: number }>;
  /** Lists made into repeats. */
  repeats?: Array<{ list: string; rows: number }>;
  /** Copies that stayed copies, and why. */
  notes?: string[];
  finishError?: string;
  /** Set once the run is undone: what it removed. */
  undone?: { removed: string[]; error?: string };
};

/** How long a page may take to load before it counts as failed. */
const LOAD_TIMEOUT_MS = 30_000;
/** After loading: time for client-side redirects and data to arrive. */
const SETTLE_MS = 1200;
/** How long the app window may take to write one view. */
const RESULT_TIMEOUT_MS = 120_000;

type Webview = HTMLElement & {
  loadURL: (url: string) => Promise<void>;
  getURL: () => string;
};

const newBatchId = (): string =>
  `b${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
};

type Options = {
  webviewRef: RefObject<HTMLElement | null>;
  projectPath: string;
  /** The app's address, routes are visited relative to it. */
  baseUrl: string;
  readAllWidths: (onWidth?: (label: string) => void) => Promise<{
    payload: unknown;
    narrower: Array<{ breakpointId: string; payload: unknown }>;
  }>;
};

export const useImportBatch = ({
  webviewRef,
  projectPath,
  baseUrl,
  readAllWidths,
}: Options): {
  batch: BatchState | null;
  start: (targets: ReadonlyArray<{ route: string; path: string }>) => Promise<void>;
  stop: () => void;
  undo: () => Promise<void>;
  dismiss: () => void;
} => {
  const [batch, setBatch] = useState<BatchState | null>(null);
  const stopRequested = useRef(false);
  const awaiting = useRef<((payload: ImportResultPayload) => void) | null>(null);

  // The verdict for the page in flight.
  useEffect(
    () =>
      window.scampImport.onResult((payload) => {
        const resolve = awaiting.current;
        if (resolve !== null && payload.batchId !== undefined) {
          awaiting.current = null;
          resolve(payload);
        }
      }),
    []
  );

  useEffect(
    () =>
      window.scampImport.onBatchReport((payload) => {
        setBatch((b) => {
          if (b === null || b.id !== payload.batchId) return b;
          if (payload.kind === 'undone') {
            return { ...b, undone: { removed: payload.removed, ...(payload.error !== undefined ? { error: payload.error } : {}) } };
          }
          return {
            ...b,
            finishing: false,
            components: payload.components,
            repeats: payload.repeats ?? [],
            notes: payload.notes,
            ...(payload.error !== undefined ? { finishError: payload.error } : {}),
          };
        });
      }),
    []
  );

  const start = useCallback(
    async (targets: ReadonlyArray<{ route: string; path: string }>): Promise<void> => {
      if (targets.length === 0 || projectPath.length === 0) return;
      const update = (id: string, index: number, patch: Partial<BatchItem>): void =>
        setBatch((b) =>
          b === null || b.id !== id
            ? b
            : { ...b, items: b.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }
        );

      /** Load a page and wait until it has stopped loading and settled. */
      const visit = async (url: string): Promise<string> => {
        const node = webviewRef.current as Webview | null;
        if (node === null) throw new Error('The page went away.');
        const stopped = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            node.removeEventListener('did-stop-loading', done);
            reject(new Error('The page took too long to load.'));
          }, LOAD_TIMEOUT_MS);
          const done = (): void => {
            clearTimeout(timer);
            node.removeEventListener('did-stop-loading', done);
            resolve();
          };
          node.addEventListener('did-stop-loading', done);
        });
        // `loadURL` rejects on an aborted load — which a redirect is — so the
        // load event, not the promise, says when the page is there.
        node.loadURL(url).catch(() => {});
        await stopped;
        await new Promise((r) => setTimeout(r, SETTLE_MS));
        return node.getURL();
      };

      const id = newBatchId();
      stopRequested.current = false;
      setBatch({ id, running: true, items: targets.map((t) => ({ ...t, status: 'waiting' })) });

      for (const [index, target] of targets.entries()) {
        if (stopRequested.current) {
          for (let rest = index; rest < targets.length; rest += 1) update(id, rest, { status: 'skipped' });
          break;
        }
        update(id, index, { status: 'running' });
        try {
          const url = new URL(target.path, baseUrl).href;
          const landed = pathOf(await visit(url));
          if (landed !== pathOf(url)) {
            update(id, index, { status: 'redirected', detail: landed });
            continue;
          }
          const { payload, narrower } = await readAllWidths();
          const verdict = new Promise<ImportResultPayload>((resolve, reject) => {
            const timer = setTimeout(() => {
              awaiting.current = null;
              reject(new Error('Scamp didn’t finish writing the view.'));
            }, RESULT_TIMEOUT_MS);
            awaiting.current = (p) => {
              clearTimeout(timer);
              resolve(p);
            };
          });
          const sent = await window.scampImport.deliver(projectPath, payload, narrower, viewNameForRoute(target.route), {
            id,
            index,
            total: targets.length,
          });
          if (!sent.ok) {
            awaiting.current = null;
            throw new Error(sent.error ?? 'Scamp could not take the page.');
          }
          const result = await verdict;
          update(
            id,
            index,
            result.ok
              ? { status: 'imported', ...(result.viewName !== undefined ? { viewName: result.viewName } : {}) }
              : { status: 'failed', detail: result.error ?? 'The import failed.' }
          );
        } catch (err) {
          update(id, index, { status: 'failed', detail: err instanceof Error ? err.message : String(err) });
        }
      }
      // Every page is in: the app window looks for the app's components
      // across them, and answers on `onBatchReport`.
      setBatch((b) => (b !== null && b.id === id ? { ...b, running: false, finishing: true } : b));
      const finished = await window.scampImport.batchAction(projectPath, id, 'finish');
      if (!finished.ok) {
        setBatch((b) =>
          b !== null && b.id === id ? { ...b, finishing: false, finishError: finished.error ?? 'Scamp couldn’t look for components.' } : b
        );
      }
    },
    [webviewRef, projectPath, baseUrl, readAllWidths]
  );

  const stop = useCallback((): void => {
    stopRequested.current = true;
  }, []);

  const undo = useCallback(async (): Promise<void> => {
    if (batch === null || batch.running || batch.finishing === true) return;
    const result = await window.scampImport.batchAction(projectPath, batch.id, 'undo');
    if (!result.ok) setBatch((b) => (b === null ? b : { ...b, undone: { removed: [], error: result.error ?? 'Couldn’t undo the import.' } }));
  }, [batch, projectPath]);

  const dismiss = useCallback((): void => setBatch(null), []);

  return { batch, start, stop, undo, dismiss };
};
