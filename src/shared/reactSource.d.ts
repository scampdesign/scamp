/**
 * Names a React app's source gives a list: `navItems.map((item) => …)`
 * says the list is `navItems` and a row is an `item`. React hands the
 * import a JSX call site — file, line, column — inside the callback; the
 * `.map(` is on that line or a few above it.
 *
 * Pure: the caller reads the file. Used by main for the import and by
 * the eval script.
 * see docs/plans/react-import-plan.md
 */
export type CallSite = {
    path: string;
    line: number;
    column: number;
};
/** `/src/app/nav.tsx:102:72` → its parts, or null. */
export declare const parseCallSite: (site: string) => CallSite | null;
/**
 * The list and row names of the nearest `.map(` before the call site,
 * looking back at most `lookBack` lines. Null when there's none, or when
 * the callback destructures its row (`({ id, label }) =>`), which names
 * no row.
 */
export declare const listNamesAt: (lines: ReadonlyArray<string>, site: CallSite, lookBack?: number) => {
    over: string;
    as: string;
} | null;
