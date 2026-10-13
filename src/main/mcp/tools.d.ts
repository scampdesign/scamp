import { type ToolDescriptor, type ToolInvoker } from './protocol';
export declare const TOOL_DESCRIPTORS: ToolDescriptor[];
/** Names the invoker will accept — derived so the two can never drift. */
export declare const TOOL_NAMES: ReadonlyArray<string>;
/**
 * Build the invoker the protocol layer calls.
 *
 * `runQuery` is injected — in the app it's the renderer round trip, in tests
 * it's a stub. Keeping the boundary here is what lets the whole tool surface
 * be tested without an Electron window.
 */
export type ToolInvokerOptions = {
    /** Answers scamp_list_routes from disk; the routes aren't canvas state. */
    listRoutes?: () => Promise<unknown>;
    /**
     * scamp_check_view / scamp_check_project, read fresh from disk by the
     * renderer. Absent (the headless runner), they answer from the snapshot.
     */
    checks?: (tool: string, args: Record<string, unknown>) => Promise<{
        ok: boolean;
        text: string;
    }>;
    /** Imported pages' originals; they live in temp, not on the canvas. */
    listImportSources?: () => Promise<unknown>;
    readImportSource?: (view: string, part: 'css' | 'html') => Promise<{
        text: string;
        truncated: boolean;
        path: string;
        url: string;
    } | null>;
    /** A React import's source, read from the app's folder. */
    reactSource?: (target: string, element: string | undefined) => Promise<{
        ok: true;
        text: string;
    } | {
        ok: false;
        error: string;
    }>;
    /** Lay a view out and measure what overflows. see docs/notes/agent-overflow-check.md */
    findOverflow?: (args: Record<string, unknown>) => Promise<{
        ok: boolean;
        text: string;
    }>;
};
/**
 * How much of an original one call returns.
 *
 * A stylesheet runs to megabytes and an agent's context does not. The
 * reply names the file, so the rest is one file read away for anything
 * that genuinely needs it.
 */
export declare const IMPORT_SOURCE_REPLY_LIMIT = 120000;
export declare const createToolInvoker: (runQuery: (tool: string, args: Record<string, unknown>) => Promise<unknown>, options?: ToolInvokerOptions) => ToolInvoker;
