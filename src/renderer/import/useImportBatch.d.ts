import { type RefObject } from 'react';
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
    components?: Array<{
        name: string;
        instances: number;
        views: number;
    }>;
    /** Lists made into repeats. */
    repeats?: Array<{
        list: string;
        rows: number;
    }>;
    /** Copies that stayed copies, and why. */
    notes?: string[];
    finishError?: string;
    /** Set once the run is undone: what it removed. */
    undone?: {
        removed: string[];
        error?: string;
    };
};
type Options = {
    webviewRef: RefObject<HTMLElement | null>;
    projectPath: string;
    /** The app's address, routes are visited relative to it. */
    baseUrl: string;
    /** The React app's name, recorded with what the import made. */
    appName: string;
    readAllWidths: (onWidth?: (label: string) => void) => Promise<{
        payload: unknown;
        narrower: Array<{
            breakpointId: string;
            payload: unknown;
        }>;
    }>;
};
export declare const useImportBatch: ({ webviewRef, projectPath, baseUrl, appName, readAllWidths, }: Options) => {
    batch: BatchState | null;
    start: (targets: ReadonlyArray<{
        route: string;
        path: string;
    }>) => Promise<void>;
    stop: () => void;
    undo: () => Promise<void>;
    dismiss: () => void;
};
export {};
