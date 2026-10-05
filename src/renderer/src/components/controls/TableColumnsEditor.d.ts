import type { ScampElement } from '@lib/element';
type Props = {
    /** The `<table>` element being edited. */
    table: ScampElement;
    /** Every element on the page, to count the cells in the first row. */
    elements: Record<string, ScampElement>;
    onChange: (patch: {
        display?: ScampElement['display'];
        gridTemplateColumns?: string;
    }) => void;
};
export declare const TableColumnsEditor: ({ table, elements, onChange, }: Props) => JSX.Element;
export {};
