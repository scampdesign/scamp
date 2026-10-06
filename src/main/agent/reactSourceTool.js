/**
 * The React app's source, for the agent: the JSX an imported element came
 * from, read from the app's folder through `.scamp/react-import.json`.
 * Answered in main (`reactImport/record.ts`), which alone reads the disk.
 * Built-in only, like the write tools.
 * see docs/plans/react-import-plan.md
 */
export const REACT_SOURCE_TOOL = {
    name: 'scamp_get_react_source',
    description: 'Read the React source an imported view or component came from. With "element", the JSX around the line that drew it (marked >), with line numbers — where to find a condition (`{isLate && …}`, `a ? <B/> : <C/>`) or a list (`claims.map((claim) => …)`). Without it, which source files the view drew from and which of its elements each wrote. Words lifted into their own element have no line of their own: ask for their parent.',
    input_schema: {
        type: 'object',
        properties: {
            target: { type: 'string', description: 'The view or component, by name: "Patients".' },
            element: { type: 'string', description: 'An element, by id or class name. Omit for the overview.' },
        },
        required: ['target'],
        additionalProperties: false,
    },
};
