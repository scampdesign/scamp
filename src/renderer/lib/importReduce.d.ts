import { type CaptureNote, type CapturePayload, type CapturedNode } from '@shared/importCapture';
import { type ScampElement } from './element';
/**
 * Reduce a captured page to a Scamp element tree.
 *
 * Pure, and the only new idea in the importer: everything either side
 * of it already exists. Capture is a DOM walk; what comes out the far
 * end goes through `generateCode` unchanged. This is the part that has
 * to decide what a page *means* in a model that is far more
 * constrained than a browser's.
 *
 * Three ideas do most of the work:
 *
 * 1. **A computed value is not a decision.** `width: 442.656px` on a
 *    flexing card is the layout's answer, not the author's. Declaring
 *    it freezes the design. Capture drops the obvious cases; this drops
 *    the ones that need the tree to spot.
 * 2. **A DOM is deeper than a design.** Wrapper elements that carry no
 *    visual decision are removed, conservatively — a redundant div is a
 *    smaller problem than a broken layout.
 * 3. **Nothing is dropped silently.** Everything removed or
 *    unrepresentable becomes a finding, because an import that quietly
 *    loses three icons reads as Scamp being broken.
 *
 * The declaration → typed field mapping is NOT reimplemented here: it
 * reuses `makeBaseline` + `applyDeclarations`, the same pair `parseCode`
 * uses, so an imported element and a hand-written one can't disagree.
 * see docs/plans/website-import-plan.md
 */
export type ImportFindingKind = CaptureNote['kind'] | 'collapsed-wrapper' | 'dropped-computed-size' | 'wrapped-bare-text' | 'inline-kept' | 'block-to-flex' | 'breakpoint-captured' | 'breakpoint-absent' | 'restored-auto-margin' | 'grid-tracks-to-fr' | 'pseudo-materialized' | 'table-to-grid' | 'unsupported-display';
export type ImportFinding = {
    kind: ImportFindingKind;
    /** Where in the source page, as the capture described it. */
    at?: string;
    detail?: string;
    /**
     * How many things this finding stands for, when it is not one.
     * Most findings are raised per element and leave this alone. The
     * breakpoint passes raise one per breakpoint covering everything
     * that changed at that width, and without this the report said
     * "1 element is missing at a narrower width" for any number of them.
     */
    count?: number;
};
export type ImportResult = {
    elements: Record<string, ScampElement>;
    rootId: string;
    /** Everything removed, changed, or impossible — for the import report. */
    findings: ImportFinding[];
    /** A PascalCase view name derived from the page title. */
    suggestedName: string;
    /** Element id → its source node's structural path, for breakpoints. */
    sourcePaths: Record<string, string>;
    /**
     * The declarations each element was built from, kept so a narrower
     * capture can be diffed against what the base actually used rather
     * than against the model's idea of it.
     */
    baseStyles: Record<string, Record<string, string>>;
    /**
     * Element id → the captured node it came from. Recorded rather than
     * inferred: the fidelity harness compares each imported element
     * against its own source box, and matching them by position in the
     * tree guesses wrong the moment anything is collapsed.
     */
    sourceNodes: Record<string, number>;
};
/** PascalCase view name from a page title, falling back to `Imported`. */
export declare const viewNameFromTitle: (title: string) => string;
export type ReduceOptions = {
    /**
     * Id source. Injected so tests get a deterministic sequence, the same
     * approach the tree mutators in `element/tree.ts` take.
     */
    randomId?: () => string;
};
/**
 * Fold captures taken at narrower widths into breakpoint overrides.
 *
 * Pure, and separate from `reduceCapture` on purpose: a base import
 * must not depend on the narrow captures succeeding, and a page whose
 * mobile layout is a different DOM should still import its desktop one.
 *
 * Elements are matched by structural path, never by id — ids are walk
 * order, and a mobile menu appearing shifts every one after it. A path
 * that does not appear at the narrow width means the element is not
 * there, which is not an override but an absence, and Scamp has no way
 * to say "gone below 768px". Those are counted and reported rather than
 * guessed at.
 * see docs/plans/website-import-plan.md
 */
/**
 * Push inherited typography down onto the elements that render words.
 *
 * The capture drops a property inheritance already supplies; Scamp
 * emits typography only on text elements. Together those lose the font
 * entirely. see docs/notes/import-inherited-typography.md
 */
export declare const resolveInheritance: (root: CapturedNode) => CapturedNode;
/**
 * Turn a recovered `::before` / `::after` into a real text element.
 *
 * A page's ticks and toggles are usually pseudo-elements — a "✓" on
 * every bullet, a "+" on every collapsed row — and dropping them hands
 * back a design with its punctuation missing. Scamp has no
 * pseudo-elements, but it does have text elements, and a text element
 * is the better answer anyway: you can see it in the layers panel and
 * change it.
 *
 * The host's own words move into a child of their own at the same
 * time, so the order is `[::before, the words, children, ::after]`.
 * Without that the recovered glyph lands after the text it was meant
 * to precede.
 *
 * Runs AFTER `collapse`, so a wrapper is judged on what the page gave
 * it rather than on children this pass invented, and after
 * `resolveInheritance`, which is why each synthesized child is handed
 * the host's inherited typography explicitly here.
 * see docs/notes/import-inherited-typography.md
 */
export declare const materializePseudos: (root: CapturedNode, findings: ImportFinding[]) => CapturedNode;
export declare const applyBreakpointCaptures: (base: ImportResult, narrower: ReadonlyArray<{
    breakpointId: string;
    payload: CapturePayload;
}>) => ImportResult;
/** Reduce a captured page to an element tree. Pure. */
export declare const reduceCapture: (payload: CapturePayload, options?: ReduceOptions) => ImportResult;
