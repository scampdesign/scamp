import { type Breakpoint } from '@shared/types';
import type { ToolResult } from '../../main/mcp/protocol';
import type { ScampElement } from './element';
export type HeadlessState = {
    elements: Record<string, ScampElement>;
    rootId: string;
    themeCss: string;
    /** Components the agent extracted, as the files Scamp would write. */
    components: Record<string, {
        tsx: string;
        css: string;
    }>;
};
export type HeadlessOptions = {
    /** The imported view being cleaned up. */
    viewName: string;
    breakpoints?: ReadonlyArray<Breakpoint>;
    /** The page's original, for `scamp_get_import_source`. */
    importSource?: {
        url: string;
        html: string;
        css: string;
    };
    /**
     * A React app's source, for `scamp_get_react_source` — answered by the
     * caller, which has the app's files. see docs/plans/react-import-plan.md
     */
    reactSource?: (target: string, element: string | undefined) => Promise<{
        ok: true;
        text: string;
    } | {
        ok: false;
        error: string;
    }>;
};
type AgentAnswer = ToolResult & {
    summary?: string;
};
export declare const createHeadlessCanvas: (initial: HeadlessState, options: HeadlessOptions) => {
    invoke: (name: string, args: Record<string, unknown>) => Promise<AgentAnswer>;
    state: () => HeadlessState;
};
export {};
