// generateCode/index.ts — split out of generateCode.ts (4.5).
import { type KeyframesBlock, type ScampElement } from "../element";
import { generateCss } from "./css";
import { generateTsx } from "./tsx";
import { withInteractionAttributes } from "../variantInteractions";
import { type Breakpoint } from "@shared/types";

/**
 * Pure function: produces real TSX + CSS module text from canvas state.
 *
 * Contract guarantees (also enforced by tests):
 *   - Output is deterministic — same input always produces the same output
 *   - Only emits CSS properties that differ from DEFAULT_RECT_STYLES
 *   - `customProperties` always go in verbatim, last, in their original order
 *   - The depth-first traversal matches the parent → childIds order
 *   - Text content is HTML-escaped
 *   - The function reads no external state — no Date.now, no Math.random
 */

export type GenerateCodeArgs = {
  elements: Record<string, ScampElement>;
  rootId: string;
  pageName: string;
  /**
   * Project's breakpoint table, ordered widest first. Used to emit
   * `@media (max-width: Npx)` blocks after the base class rules.
   * When omitted (or only contains desktop), no `@media` output is
   * emitted — backwards-compatible with callers that predate the
   * breakpoints feature.
   */
  breakpoints?: ReadonlyArray<Breakpoint>;
  /**
   * Raw `@media` blocks that the parser couldn't match to a known
   * breakpoint. Appended verbatim at the very end of the CSS so
   * agent-written / hand-written queries round-trip untouched.
   */
  customMediaBlocks?: ReadonlyArray<string>;
  /**
   * `@keyframes` blocks for the page. Emitted between the per-element
   * chunks and the `@media` blocks, in the order given. Multiple
   * elements can reference the same keyframe name; the block list
   * deduplicates by name on parse, so we trust the input here.
   */
  pageKeyframesBlocks?: ReadonlyArray<KeyframesBlock>;
  /**
   * Basename (no extension) of the CSS module the TSX should import.
   * The single point of divergence between the legacy flat layout
   * (where each page imports `./<pageName>.module.css` because all
   * pages share a folder) and the Next.js App Router layout (where
   * every page lives in its own folder and imports `./page.module.css`).
   * Defaults to `pageName` for back-compat with legacy callers.
   */
  cssModuleImportName?: string;
  /**
   * `true` when emitting a component file (Phase 5 onwards), `false`
   * (or undefined) for pages. Components emit `{propName}` in JSX
   * for any text element with `prop` set, a destructure on the
   * function signature, and a `type [Name]Props = { … }` declaration
   * above the function. Pages keep the literal-text emission path
   * since the prop concept doesn't apply there.
   */
  isComponent?: boolean;
};


export type GeneratedCode = {
  tsx: string;
  css: string;
};


export const generateCode = (args: GenerateCodeArgs): GeneratedCode => {
  return {
    tsx: generateTsx(
      // Click, outside, and Escape interactions are attributes in the TSX.
      withInteractionAttributes(args.elements),
      args.rootId,
      args.pageName,
      args.cssModuleImportName ?? args.pageName,
      args.isComponent === true
    ),
    css: generateCss(
      args.elements,
      args.rootId,
      args.breakpoints ?? [],
      args.customMediaBlocks ?? [],
      args.pageKeyframesBlocks ?? []
    ),
  };
};

