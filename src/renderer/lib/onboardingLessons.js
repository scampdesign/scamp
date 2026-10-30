export const USER_DOCS_URL = 'https://github.com/scampdesign/scamp/blob/main/docs/user_docs';
const TOKEN_REF_RE = /var\(--[\w-]+/;
/** A value the patch changed on one of its elements references a theme token. */
const setsToken = (signal) => signal.elementIds.some((id) => {
    const el = signal.snapshot[id];
    if (el === undefined)
        return false;
    return (signal.propertyKeys ?? []).some((key) => {
        const value = el[key];
        return typeof value === 'string' && TOKEN_REF_RE.test(value);
    });
});
export const LESSONS = [
    {
        id: 'draw',
        title: 'Draw, and it’s code',
        steps: [
            'Press **R**, and then drag on the canvas to draw a rectangle.',
            'The panel at the bottom shows the TSX and CSS that Scamp writes to your project folder.',
        ],
        why: 'Everything on the canvas is a real file you can open, edit, and ship.',
        docsPage: 'canvas.md',
        optional: false,
        highlights: ['[data-tool="rectangle"][aria-pressed="false"]'],
        isDone: (signal) => signal.kind === 'draw-rect',
    },
    {
        id: 'layout',
        title: 'Lay it out',
        steps: [
            'Click one card, and then Shift-click the other.',
            'Press **Cmd+G** on macOS or **Ctrl+G** on Windows and Linux to group them.',
        ],
        why: 'A group is a real flex container, so its layout holds at any size.',
        docsPage: 'grouping.md',
        optional: false,
        highlights: [],
        isDone: (signal) => signal.kind === 'group',
    },
    {
        id: 'code',
        title: 'The code is the design',
        steps: [
            'Select an element. At the top of the properties panel, click **CSS**.',
            'Change a value, and then click outside the editor. You can also edit the `.module.css` file in your own editor.',
        ],
        why: 'The file is the source of truth, so editors and AI agents can change your design too.',
        docsPage: 'bidirectional-sync.md',
        optional: false,
        highlights: ['[data-testid="properties-panel"] [role="radio"][aria-label="CSS"][aria-checked="false"]'],
        isDone: (signal) => signal.kind === 'external-edit',
    },
    {
        id: 'component',
        title: 'Make it reusable',
        steps: [
            'Right-click a card, and then click **Create component…**. Scamp opens the new component so you can edit it.',
            'At the top of the canvas, click the page name to go back to your page.',
            'In the sidebar, click **Components**, and then drag your component onto the page.',
            'To come back to these steps, click **Learn** in the sidebar.',
        ],
        why: 'Change a component once, and every copy of it changes.',
        docsPage: 'components.md',
        optional: false,
        highlights: [
            '[aria-label="Component editor breadcrumb"] button:first-child',
            '[data-section="components"][aria-pressed="false"]',
        ],
        isDone: (signal) => signal.kind === 'add-component-instance',
    },
    {
        id: 'tokens',
        title: 'Use your tokens',
        steps: [
            'Select a card, and then click its background color.',
            'Click **Tokens**, and then pick a color from your theme.',
        ],
        why: 'Tokens keep colors consistent, and make light and dark themes possible.',
        docsPage: 'design-system.md',
        optional: false,
        highlights: [
            '[data-picker-tab="tokens"]',
            '[data-panel-section="Background"] button[aria-label="Pick color"]',
        ],
        isDone: (signal) => signal.kind === 'patch' && setsToken(signal),
    },
    {
        id: 'agent',
        title: 'Work with an agent',
        steps: [
            'Ask the Scamp Agent for a change, or connect your own agent through the MCP server.',
        ],
        why: 'Agents edit the same files the canvas draws, and you see their changes as they land.',
        docsPage: 'ai-agents.md',
        optional: true,
        highlights: ['[data-section="agent"][aria-pressed="false"]'],
        isDone: (signal) => signal.kind === 'agent-edit',
    },
];
/** The lessons a history entry completes that aren't already done, in lesson order. */
export const lessonsCompletedBy = (signal, completed) => LESSONS.filter((lesson) => !completed.includes(lesson.id) && lesson.isDone(signal)).map((lesson) => lesson.id);
/** The first lesson not done yet, optional ones last; null when every lesson is done. */
export const nextLesson = (completed) => LESSONS.find((l) => !l.optional && !completed.includes(l.id)) ??
    LESSONS.find((l) => !completed.includes(l.id)) ??
    null;
/** Every lesson that isn't optional is done. */
export const isTutorialComplete = (completed) => LESSONS.every((l) => l.optional || completed.includes(l.id));
