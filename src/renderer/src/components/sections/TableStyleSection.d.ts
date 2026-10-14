type Props = {
    elementId: string;
};
/**
 * Row and cell styling for a `<table>`, set once for every row and cell.
 *
 * Reads the stored element rather than the resolved one: `tableStyle`
 * has no breakpoint or state overrides, so the stored value is what
 * every breakpoint and state shows.
 * see docs/archive/2026-10-05-tables-plan.md
 */
export declare const TableStyleSection: ({ elementId }: Props) => JSX.Element | null;
export {};
