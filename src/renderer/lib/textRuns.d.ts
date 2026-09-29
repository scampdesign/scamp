/**
 * A text element's content as a list of styled RUNS rather than a
 * string.
 *
 * `alongside` in "works alongside AI" is not a box inside the headline —
 * it is three words that are a different colour. Modelling it as a child
 * element is what forces the "a host with children cannot also hold
 * words" rule, which splits the sentence, which is how the spaces around
 * it get lost. Runs keep the sentence one element.
 *
 * **Phase 1 stores nothing.** `ScampElement.runs` is optional and
 * nothing writes it yet; `runsOf` treats an absent list as one unstyled
 * run of the element's `text`, so every existing element already has a
 * runs view and no file changes. The operations below are the half that
 * later phases need and that can be built and tested now.
 * see docs/plans/inline-spans-plan.md
 */
/**
 * Style a run may carry.
 *
 * Deliberately only properties that paint GLYPHS. Anything affecting
 * layout — margin, width, display — is an element, not a run, and
 * putting it here would let the panel write CSS that silently does
 * nothing inside a line.
 */
export type TextRunStyle = {
    color?: string;
    /** Gradient text: a background clipped to the glyphs. */
    backgroundImage?: string;
    fontWeight?: number;
    fontStyle?: string;
    textDecorationLine?: string;
    /** Anything the typed fields do not cover, as CSS. */
    customProperties?: Record<string, string>;
};
export type TextRun = {
    text: string;
    /** Absent for the unstyled majority. */
    style?: TextRunStyle;
    /** A run can be a link without becoming its own element. */
    href?: string;
};
/** Does this run paint differently from plain text? */
export declare const isStyled: (run: TextRun) => boolean;
/** One unstyled run. The shape every plain text element implies. */
export declare const runsFromText: (text: string) => TextRun[];
/** The words, with every run's styling dropped. */
export declare const textFromRuns: (runs: ReadonlyArray<TextRun>) => string;
/**
 * The runs view of an element that may not store any.
 *
 * An element with no `runs` is one unstyled run of its `text`, which is
 * every element in every project today.
 */
export declare const runsOf: (element: {
    runs?: ReadonlyArray<TextRun>;
    text?: string | null;
}) => TextRun[];
/**
 * Join neighbours that paint the same, and drop empties.
 *
 * Without this every edit leaves a seam: styling "AI" and then unstyling
 * it gives three runs that render exactly like one, and the next split
 * happens at a boundary the user cannot see.
 */
export declare const mergeRuns: (runs: ReadonlyArray<TextRun>) => TextRun[];
/**
 * Split the list at a character offset, so a boundary exists there.
 *
 * Offsets are over the JOINED text — what a DOM selection reports — not
 * over run indices, which the caller has no way to know.
 */
export declare const splitAt: (runs: ReadonlyArray<TextRun>, offset: number) => TextRun[];
/**
 * Apply a style to the characters between two offsets.
 *
 * The range is split out first, so only the covered runs change, then
 * the result is merged — styling a range and undoing it has to give back
 * the list you started with, or the model accumulates seams.
 *
 * `style` is merged into whatever a covered run already had, so making a
 * bold word red keeps it bold. Pass `null` for a property to clear it.
 */
export declare const applyStyleToRange: (runs: ReadonlyArray<TextRun>, start: number, end: number, style: Readonly<Record<string, string | number | null>>) => TextRun[];
/**
 * The style shared by every run across a range, and the properties that
 * differ.
 *
 * The properties panel needs both: a value to show, and which controls
 * have to say "mixed" rather than pick one run's answer and lie.
 */
export declare const styleOfRange: (runs: ReadonlyArray<TextRun>, start: number, end: number) => {
    shared: TextRunStyle;
    mixed: string[];
};
/**
 * The class a styled run is written with: the element's own class, then
 * `__r` and the run's index.
 *
 * A separate convention from an element's class on purpose. Element
 * classes end in the element's id, and the CSS parser routes a rule to
 * an element by reading that id — so a run needed a shape that cannot
 * be mistaken for one, and that says which element it belongs to.
 */
export declare const runClassName: (elementClass: string, index: number) => string;
/** `hero_004e__r1` → `{ elementClass: 'hero_004e', index: 1 }`, or null. */
export declare const parseRunClassName: (className: string) => {
    elementClass: string;
    index: number;
} | null;
/** A run's style as CSS declarations, in a stable order. */
export declare const runStyleDeclarations: (style: TextRunStyle) => string[];
/** The inverse: CSS declarations back into a run style. */
export declare const runStyleFromDeclarations: (declarations: ReadonlyArray<{
    prop: string;
    value: string;
}>) => TextRunStyle;
/**
 * A run's style as a React inline style object.
 *
 * The canvas styles elements inline rather than through the CSS module —
 * it has no stylesheet of the project's own — so a run needs the same
 * treatment or it renders unstyled on the canvas while looking right in
 * the preview.
 */
export declare const runInlineStyle: (run: TextRun) => Record<string, string | number>;
