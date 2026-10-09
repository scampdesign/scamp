import { applyCssChanges, cssRuleChanges } from '@lib/cssRuleEdits';
import { parseCode } from '@lib/parseCode';
import type { Breakpoint } from '@shared/types';

/**
 * What a save actually writes to the stylesheet.
 *
 * Phase 2 of docs/plans/incremental-writes-plan.md. Instead of replacing
 * the file with a freshly generated one, rewrite only the rules whose
 * declarations changed and leave the rest of the file as it is. The
 * write itself is still a whole-file atomic write; what changes is how
 * much of the content differs.
 *
 * The case this is really for is the first save after opening a project
 * Scamp did not write. Until now that reformatted the whole stylesheet
 * and dropped anything the generator has no opinion about.
 *
 * Every patch is verified before it is offered: the patched stylesheet
 * has to parse to the same element map as the generated one. If it
 * doesn't, the save falls back to the generated file, so this can only
 * ever be as correct as what it replaces.
 */

export type CssWrite = {
  /** The content to write. */
  css: string;
  /** False when the patch was skipped or failed verification. */
  patched: boolean;
};

export type CssWriteInput = {
  /** What we believe is on disk. Null before the first save of a target. */
  baseCss: string | null;
  generatedCss: string;
  /** The TSX that goes with it, needed to parse the stylesheet in context. */
  tsx: string;
  breakpoints: ReadonlyArray<Breakpoint>;
  isComponent: boolean;
};

/** Two parses agree when they produce the same elements. */
/**
 * JSON with every object's keys sorted. A model's key order follows the
 * order declarations appear in the file — a breakpoint override read from
 * `align-items; gap` and one read from `gap; align-items` are the same
 * model — so a plain `JSON.stringify` compare reported a difference and
 * every save of such a file fell back to writing it whole.
 */
const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v
  );

const sameModel = (a: string, b: string, input: CssWriteInput): boolean => {
  const options = { breakpoints: input.breakpoints, isComponent: input.isComponent };
  const left = parseCode(input.tsx, a, options);
  const right = parseCode(input.tsx, b, options);
  return canonicalJson(left.elements) === canonicalJson(right.elements);
};

export const cssWriteFor = (input: CssWriteInput): CssWrite => {
  const { baseCss, generatedCss } = input;
  if (baseCss === null) return { css: generatedCss, patched: false };
  try {
    const changes = cssRuleChanges(baseCss, generatedCss);
    if (changes.length === 0) {
      // Nothing the model cares about differs. Formatting alone is not a
      // reason to rewrite someone's file.
      return { css: baseCss, patched: true };
    }
    const patched = applyCssChanges(baseCss, changes, generatedCss);
    if (!sameModel(patched, generatedCss, input)) {
      console.warn(
        '[cssWrite] the patched stylesheet parsed differently from the generated one; writing the generated file instead.'
      );
      return { css: generatedCss, patched: false };
    }
    return { css: patched, patched: true };
  } catch (err) {
    console.warn('[cssWrite] patching failed; writing the generated file instead:', err);
    return { css: generatedCss, patched: false };
  }
};
