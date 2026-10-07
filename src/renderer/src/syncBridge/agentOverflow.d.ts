import type { ScampElement } from '@lib/element';
/**
 * `scamp_find_overflow`: build the view's HTML export from what Scamp
 * holds now — the canvas for the open view, the stored trees for the rest
 * — have main lay it out, and say what overflows.
 * see docs/notes/agent-overflow-check.md
 */
export type OverflowTarget = {
    name: string;
    kind: 'page' | 'view' | 'component';
    elements: Record<string, ScampElement>;
    rootId: string;
};
export declare const findOverflow: (projectPath: string, target: OverflowTarget, input: Record<string, unknown>) => Promise<{
    ok: boolean;
    text: string;
    summary?: string;
}>;
