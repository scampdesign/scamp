import { type ScampElement } from "../element";
/**
 * Escape text for an HTML/JSX text node or a double-quoted attribute.
 * Shared by the TSX generator and the HTML exporter so the two can't
 * drift on an escaping rule.
 */
/**
 * Escape a value for an HTML document — the export path, whose output is
 * a final artifact served to a browser. `&` must be escaped there: a
 * bare one is invalid, and `&foo;` can be misread as an entity.
 */
export declare const escapeHtml: (raw: string) => string;
/**
 * Escape a value for JSX — an attribute value or a text body in a file
 * Scamp both writes and re-parses.
 *
 * Unlike the HTML export, `&` is deliberately left alone. The parser
 * decodes entities on the way in, so a literal `&amp;` in a source file
 * already arrives as `&`, and re-escaping on the way out can only move
 * away from what was written. It used to, and the cost was real: an
 * agent writing `src="…?w=2000&q=80"` had the next canvas save rewrite
 * it to `&amp;q=80` — identical once JSX decodes it, stable across
 * repeated saves, and a line dirtied in a file nobody touched. In a tool
 * whose premise is a human and an agent editing the same files, that is
 * worse than cosmetic.
 * see docs/plans/framework-release-readiness.md
 */
export declare const escapeJsx: (raw: string) => string;
/**
 * A text element's words as a JSX child, with any space at the EDGES
 * kept.
 *
 * Bare JSX text cannot carry an edge space through a round trip: the
 * generator indents a text element onto its own line, so the parser
 * reads `\n      works \n    ` and has to trim to recover the words —
 * and the trim takes a real trailing space with it. `works alongside`
 * and `works alongside ` became the same file.
 *
 * `{' '}` is the standard JSX answer and it is unambiguous in both
 * directions: it survives the indentation because it is not whitespace,
 * and the parser turns it back into a space after trimming. Only the
 * edges need it; interior spaces are safe as they are.
 * see docs/plans/inline-spans-plan.md
 */
export declare const jsxText: (raw: string) => string;
/** What `jsxText` writes for an edge space, and the parser reads back. */
export declare const SPACE_TOKEN = "{' '}";
/**
 * The CSS class name for an element. When the element has a custom name,
 * the slugified name replaces the type prefix:
 *   - unnamed rect → `rect_a1b2`
 *   - named "Hero Card" → `hero_card_a1b2`
 *   - root → `root` (always)
 */
export declare const classNameFor: (el: ScampElement) => string;
/** The actual tag to emit / render — explicit override wins over the default. */
export declare const tagFor: (el: ScampElement) => string;
/**
 * Collect the set of element IDs that need to establish a positioning
 * context (`position: relative` or similar) so their absolute-positioned
 * descendants anchor locally instead of escaping to a remote ancestor.
 *
 * An element needs a positioning context iff at least one of its direct
 * children will resolve to `position: absolute` in the output. A child
 * resolves to absolute when:
 *
 *   - `child.position === 'absolute'` (explicit), OR
 *   - `child.position === 'auto'` AND the parent isn't a flex/grid
 *     container (the generator's own auto rule — non-layout-parent
 *     auto children get absolute + left/top emitted).
 *
 * Root is always emitted with `position: relative` anyway, so it's
 * excluded — caller's existing branch handles it.
 *
 * See agent.md "Editability — prefer typed properties" / Scamp's
 * fallback positioning rules.
 */
export declare const computeElementsNeedingPositioningContext: (elements: Record<string, ScampElement>, rootId: string) => Set<string>;
