import { applyCssChanges, cssRuleChanges } from '@lib/cssRuleEdits';
import { parseCode } from '@lib/parseCode';
/** Two parses agree when they produce the same elements. */
/**
 * JSON with every object's keys sorted. A model's key order follows the
 * order declarations appear in the file — a breakpoint override read from
 * `align-items; gap` and one read from `gap; align-items` are the same
 * model — so a plain `JSON.stringify` compare reported a difference and
 * every save of such a file fell back to writing it whole.
 */
const canonicalJson = (value) => JSON.stringify(value, (_key, v) => v !== null && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v);
const sameModel = (a, b, input) => {
    const options = { breakpoints: input.breakpoints, isComponent: input.isComponent };
    const left = parseCode(input.tsx, a, options);
    const right = parseCode(input.tsx, b, options);
    return canonicalJson(left.elements) === canonicalJson(right.elements);
};
export const cssWriteFor = (input) => {
    const { baseCss, generatedCss } = input;
    if (baseCss === null)
        return { css: generatedCss, patched: false };
    try {
        const changes = cssRuleChanges(baseCss, generatedCss);
        if (changes.length === 0) {
            // Nothing the model cares about differs. Formatting alone is not a
            // reason to rewrite someone's file.
            return { css: baseCss, patched: true };
        }
        const patched = applyCssChanges(baseCss, changes, generatedCss);
        if (!sameModel(patched, generatedCss, input)) {
            console.warn('[cssWrite] the patched stylesheet parsed differently from the generated one; writing the generated file instead.');
            return { css: generatedCss, patched: false };
        }
        return { css: patched, patched: true };
    }
    catch (err) {
        console.warn('[cssWrite] patching failed; writing the generated file instead:', err);
        return { css: generatedCss, patched: false };
    }
};
