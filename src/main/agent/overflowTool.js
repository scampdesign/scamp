/**
 * What overflows on a view, measured on a render of it rather than read
 * off its styles. Answered by the renderer, which builds the view's HTML
 * export, and main, which lays it out (`overflowRender.ts`). Built-in only.
 * see docs/notes/agent-overflow-check.md
 */
export const OVERFLOW_TOOL = {
    name: 'scamp_find_overflow',
    description: 'Render a view or component the way its HTML export renders in a browser, and measure what overflows: elements past an edge of the page or widening it, elements outside their parent (shown, clipped, or scrolled to), and text wider than its box. Each finding names the element (and the component that owns it, for one inside an instance), how many px past which side, and its position. Use it to find overflow instead of guessing from styles, and again after fixing to check. Rows of a list share one finding.',
    input_schema: {
        type: 'object',
        properties: {
            view: {
                type: 'string',
                description: 'The view or component to measure. Omit for the one this conversation is about.',
            },
            width: {
                type: 'integer',
                description: 'The window width in px to lay it out at. Omit for the desktop width; pass a breakpoint’s width to check it there.',
            },
        },
        additionalProperties: false,
    },
};
