import { type SourceMap } from "../sourceMap";
import { type ElementType, type RepeatBinding, type SelectOption } from "../element";
/**
 * Where an element sits in the text it was parsed from. Offsets are
 * into the file as written: `parseTsxStructure` maps them back through
 * its own normalisation, and `parseCode` maps them back through the
 * hoisting passes. see docs/plans/incremental-writes-plan.md, phase 5
 */
export type SourceRange = {
    /** The `<` of the opening tag. */
    start: number;
    /** Just past the opening tag's `>`. */
    openEnd: number;
    /** The `<` of the closing tag, or `openEnd` when self-closing. */
    innerEnd: number;
    /** Just past the closing tag, or `openEnd` when self-closing. */
    end: number;
};
/** A run as the TSX gives it: words plus the class that styles them. */
export type RawTextRun = {
    text: string;
    runClassName?: string;
};
export type RawElement = {
    id: string;
    type: ElementType;
    /**
     * Styled runs, when the element has any. Carries the CLASS rather
     * than the style — the TSX only says which class each run wears, and
     * the CSS pass attaches what it means.
     * see docs/plans/inline-spans-plan.md
     */
    runs?: RawTextRun[];
    /** The HTML tag name as written in the source file. Captured so the
     *  generator can round-trip semantic tags like h1, section, header.
     *  For component instances, this is the PascalCase component name
     *  (recovered from the file's import pre-pass — htmlparser2
     *  lowercases by default). */
    tag: string;
    className: string;
    parentId: string | null;
    childIds: string[];
    /**
     * Set only when this element's id collided with an earlier one and was
     * reassigned a fresh id. Holds the ORIGINAL class name so `index.ts`
     * can source this element's styles from the duplicated class (keeping
     * the repaired copy visually identical). Also drives the load-time
     * "repaired duplicate id" notice. Undefined for the normal case.
     * see docs/notes/duplicate-id-repair.md
     */
    dedupedFrom?: string;
    text: string | null;
    /**
     * Loose text + unclassed JSX subtrees that appear between this
     * element's child elements (or before/after them). Captured in
     * source order so the generator can emit them verbatim. Pure-
     * whitespace text fragments are dropped to avoid double-spacing
     * generator-emitted indentation.
     */
    inlineFragments: Array<{
        kind: 'text';
        value: string;
        afterChildIndex: number;
    } | {
        kind: 'jsx';
        source: string;
        afterChildIndex: number;
    }>;
    /** The element's name, recovered from the class prefix (`menu_a1b2`
     *  → `menu`). Null when the prefix is a default type prefix. */
    name: string | null;
    /** Image src attribute, if present. */
    src: string | null;
    /** Image alt attribute, if present. */
    alt: string | null;
    /** Every attribute other than the ones typed above, preserved
     *  verbatim so round-trips don't discard agent-written extras. */
    attributes: Record<string, string>;
    /** Verbatim inner source of an `<svg>` element — the substring
     *  between the opening tag's `>` and the closing `</svg>`. */
    svgSource: string | null;
    /** Options collected from `<select>` child `<option>` elements. */
    selectOptions: SelectOption[] | null;
    componentName: string | null;
    instanceId: string | null;
    propOverrides: Record<string, string> | null;
    missingComponent: boolean;
    bind: Record<string, string> | null;
    on: Record<string, string> | null;
    repeat: RepeatBinding | null;
    showIf: string | null;
    /** Null when the parse could not place the element. */
    range: SourceRange | null;
};
/**
 * Match a JSX-expression-only text body, ignoring surrounding
 * whitespace from generator indentation. Used to detect when a
 * parsed text element's content is a single `{propName}` ref so
 * we can hydrate it into the typed `prop` field.
 */
export declare const PROP_REF_TEXT_RE: RegExp;
/**
 * Collect the slot names declared in a component's props type (the
 * `React.ReactNode` props). Empty for pages (no props type). Used by the
 * parser to hydrate a slot-marked rectangle's `slot` field.
 */
export declare const parseSlotNames: (tsx: string) => Set<string>;
/**
 * Parse the function-signature destructure into a `propName →
 * defaultText` map. Components with no text-props (and pages,
 * which never emit this form) return an empty map. The returned
 * map is the authoritative source for restoring a text element's
 * `text` field after its JSX-expression body resolves to a known
 * prop name.
 */
/** The `_scamp` export a component or view ends with. */
export type ScampViewMeta = {
    contract: number;
    events: string[];
};
/**
 * Read the `_scamp` export (contract version + event-prop names). Null
 * when the file has none — every page, and components written before
 * the framework contract. The generator always writes it back, so
 * nothing here needs preserving. see docs/plans/framework-phase-1-plan.md
 */
export declare const parseScampMeta: (tsx: string) => ScampViewMeta | null;
export declare const parsePropsDestructure: (tsx: string) => Map<string, string>;
/** A range in a rewritten text, as a range in what it was rewritten from. */
export declare const mapRange: (map: SourceMap, range: SourceRange) => SourceRange;
export declare const parseTsxStructure: (rawTsx: string) => RawElement[];
