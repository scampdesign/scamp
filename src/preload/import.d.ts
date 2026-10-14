import type { ImportBatchRef, ImportBatchReport, ImportOpenArgs, ImportResultPayload } from '@shared/types';
/**
 * Preload for the import window.
 *
 * Deliberately tiny, and deliberately without a file-system or project
 * API: this window hosts a third-party page in a `<webview>`, so its
 * renderer is the least trusted in the app. It can say "here is a page
 * I captured" and nothing else.
 * see docs/archive/2026-09-23-website-import-plan.md
 */
declare const importApi: {
    /** The project and starting URL, sent once the window is up. */
    onOpen: (listener: (args: ImportOpenArgs) => void) => (() => void);
    /** What the app window made of the last capture. */
    onResult: (listener: (payload: ImportResultPayload) => void) => (() => void);
    /** Hand a captured page, and its narrower readings, to the app window. */
    deliver: (projectPath: string, payload: unknown, narrower: Array<{
        breakpointId: string;
        payload: unknown;
    }>, nameHint?: string, batch?: ImportBatchRef) => Promise<{
        ok: boolean;
        error?: string;
    }>;
    /**
     * Finish a multi-page import (find its components) or undo it. A batch
     * id and an action, nothing else; the app window answers on `onBatchReport`.
     */
    batchAction: (projectPath: string, batchId: string, action: "finish" | "undo") => Promise<{
        ok: boolean;
        error?: string;
    }>;
    onBatchReport: (listener: (payload: ImportBatchReport) => void) => (() => void);
    /**
     * Ask the app window to start an AI cleanup of the view just imported.
     * A view name and a mode, and nothing else; main checks both.
     */
    startCleanup: (projectPath: string, viewName: string, tokenMode: "create-tokens" | "keep-literal") => Promise<{
        ok: boolean;
        error?: string;
    }>;
    close: (projectPath: string) => Promise<void>;
};
export type ScampImportApi = typeof importApi;
export {};
