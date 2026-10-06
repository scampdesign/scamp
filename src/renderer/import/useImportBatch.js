import { useCallback, useEffect, useRef, useState } from 'react';
import { viewNameForRoute } from '@shared/reactRoutes';
/** How long a page may take to load before it counts as failed. */
const LOAD_TIMEOUT_MS = 30_000;
/** After loading: time for client-side redirects and data to arrive. */
const SETTLE_MS = 1200;
/** How long the app window may take to write one view. */
const RESULT_TIMEOUT_MS = 120_000;
const newBatchId = () => `b${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const pathOf = (url) => {
    try {
        return new URL(url).pathname;
    }
    catch {
        return '';
    }
};
export const useImportBatch = ({ webviewRef, projectPath, baseUrl, readAllWidths, }) => {
    const [batch, setBatch] = useState(null);
    const stopRequested = useRef(false);
    const awaiting = useRef(null);
    // The verdict for the page in flight.
    useEffect(() => window.scampImport.onResult((payload) => {
        const resolve = awaiting.current;
        if (resolve !== null && payload.batchId !== undefined) {
            awaiting.current = null;
            resolve(payload);
        }
    }), []);
    useEffect(() => window.scampImport.onBatchReport((payload) => {
        setBatch((b) => {
            if (b === null || b.id !== payload.batchId)
                return b;
            if (payload.kind === 'undone') {
                return { ...b, undone: { removed: payload.removed, ...(payload.error !== undefined ? { error: payload.error } : {}) } };
            }
            return {
                ...b,
                finishing: false,
                components: payload.components,
                notes: payload.notes,
                ...(payload.error !== undefined ? { finishError: payload.error } : {}),
            };
        });
    }), []);
    const start = useCallback(async (targets) => {
        if (targets.length === 0 || projectPath.length === 0)
            return;
        const update = (id, index, patch) => setBatch((b) => b === null || b.id !== id
            ? b
            : { ...b, items: b.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
        /** Load a page and wait until it has stopped loading and settled. */
        const visit = async (url) => {
            const node = webviewRef.current;
            if (node === null)
                throw new Error('The page went away.');
            const stopped = new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    node.removeEventListener('did-stop-loading', done);
                    reject(new Error('The page took too long to load.'));
                }, LOAD_TIMEOUT_MS);
                const done = () => {
                    clearTimeout(timer);
                    node.removeEventListener('did-stop-loading', done);
                    resolve();
                };
                node.addEventListener('did-stop-loading', done);
            });
            // `loadURL` rejects on an aborted load — which a redirect is — so the
            // load event, not the promise, says when the page is there.
            node.loadURL(url).catch(() => { });
            await stopped;
            await new Promise((r) => setTimeout(r, SETTLE_MS));
            return node.getURL();
        };
        const id = newBatchId();
        stopRequested.current = false;
        setBatch({ id, running: true, items: targets.map((t) => ({ ...t, status: 'waiting' })) });
        for (const [index, target] of targets.entries()) {
            if (stopRequested.current) {
                for (let rest = index; rest < targets.length; rest += 1)
                    update(id, rest, { status: 'skipped' });
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
                const verdict = new Promise((resolve, reject) => {
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
                update(id, index, result.ok
                    ? { status: 'imported', ...(result.viewName !== undefined ? { viewName: result.viewName } : {}) }
                    : { status: 'failed', detail: result.error ?? 'The import failed.' });
            }
            catch (err) {
                update(id, index, { status: 'failed', detail: err instanceof Error ? err.message : String(err) });
            }
        }
        // Every page is in: the app window looks for the app's components
        // across them, and answers on `onBatchReport`.
        setBatch((b) => (b !== null && b.id === id ? { ...b, running: false, finishing: true } : b));
        const finished = await window.scampImport.batchAction(projectPath, id, 'finish');
        if (!finished.ok) {
            setBatch((b) => b !== null && b.id === id ? { ...b, finishing: false, finishError: finished.error ?? 'Scamp couldn’t look for components.' } : b);
        }
    }, [webviewRef, projectPath, baseUrl, readAllWidths]);
    const stop = useCallback(() => {
        stopRequested.current = true;
    }, []);
    const undo = useCallback(async () => {
        if (batch === null || batch.running || batch.finishing === true)
            return;
        const result = await window.scampImport.batchAction(projectPath, batch.id, 'undo');
        if (!result.ok)
            setBatch((b) => (b === null ? b : { ...b, undone: { removed: [], error: result.error ?? 'Couldn’t undo the import.' } }));
    }, [batch, projectPath]);
    const dismiss = useCallback(() => setBatch(null), []);
    return { batch, start, stop, undo, dismiss };
};
