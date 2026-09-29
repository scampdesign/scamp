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
