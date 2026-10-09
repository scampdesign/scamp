import type { ScampElement } from '@lib/element';
/**
 * `scamp_find_overflow`, for the built-in agent and MCP: build the view's
 * HTML export — the canvas for the open target, the files for the rest —
 * have main lay it out, and say what overflows.
 * see docs/notes/agent-overflow-check.md
 */
export type OverflowTarget = {
    name: string;
    kind: 'page' | 'view' | 'component';
    /** The canvas's elements when this is the open target; absent reads its files. */
    live?: {
        elements: Record<string, ScampElement>;
        rootId: string;
    };
};
/**
 * Measures what is saved for anything not on the canvas: an agent over MCP
 * edits files, and a stored tree can lag what it wrote.
 */
export declare const findOverflow: (projectPath: string, target: OverflowTarget, input: Record<string, unknown>) => Promise<{
    ok: boolean;
    text: string;
    summary?: string;
}>;
