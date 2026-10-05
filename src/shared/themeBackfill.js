import postcss from 'postcss';
import { BROWSER_RESET_BLOCK, BROWSER_RESET_SENTINEL, DEFAULT_BODY_FONT_FAMILY, LINK_CURSOR_BLOCK, LINK_CURSOR_SENTINEL, LIST_PADDING_BLOCK, LIST_PADDING_SENTINEL, TABLE_RESET_BLOCK, TABLE_RESET_SENTINEL, } from './agentMd';
/**
 * Additively backfill Scamp's project defaults into a `theme.css`
 * string. Pure: takes the raw CSS, returns the (possibly-updated) CSS
 * plus a `changed` flag.
 *
 * Seven independent additive checks:
 *
 *   1. If no `:root` rule declares `--font-sans`, append the token to
 *      the first `:root` rule (or create a `:root` block if there
 *      isn't one).
 *   2. If no top-level rule with a universal (`*`) selector declares
 *      `box-sizing`, append the universal `*, *::before, *::after`
 *      reset.
 *   3. If no top-level `body` rule declares `font-family`, append a
 *      `body { font-family: var(--font-sans); }` rule at the bottom.
 *   4. If the browser-reset sentinel comment isn't already in the
 *      file, append the full reset block (margins, replaced-media
 *      display, interactive-tag chrome). Sentinel-based detection
 *      so user edits to the reset rules don't trigger reinsertion.
 *
 * Each check is independent: the helper inserts only what's missing
 * and leaves user-authored rules / tokens / comments intact. This is
 * the migration path for projects scaffolded before any of these
 * defaults landed in `DEFAULT_THEME_CSS`.
 */
export const backfillThemeDefaults = (css) => {
    let root;
    try {
        root = postcss.parse(css);
    }
    catch {
        // Malformed CSS — leave it alone. The user can fix the parse
        // error before we add anything.
        return { content: css, changed: false };
    }
    const hasFontSansToken = checkHasFontSansToken(root);
    const hasBoxSizingReset = checkHasBoxSizingReset(root);
    const hasBodyFontFamily = checkHasBodyFontFamily(root);
    // Browser reset detection is sentinel-comment-based on the raw
    // string — postcss strips comments from rule selectors but keeps
    // them as standalone Comment nodes. A literal-string check is
    // simpler and tolerant of whatever postcss does on parse / stringify.
    const hasBrowserReset = css.includes(BROWSER_RESET_SENTINEL);
    const hasListPadding = css.includes(LIST_PADDING_SENTINEL);
    const hasLinkCursor = css.includes(LINK_CURSOR_SENTINEL);
    const hasTableReset = css.includes(TABLE_RESET_SENTINEL);
    if (hasFontSansToken &&
        hasBoxSizingReset &&
        hasBodyFontFamily &&
        hasBrowserReset &&
        hasListPadding &&
        hasLinkCursor &&
        hasTableReset) {
        return { content: css, changed: false };
    }
    if (!hasFontSansToken) {
        insertFontSansToken(root);
    }
    if (!hasBoxSizingReset) {
        insertBoxSizingReset(root);
    }
    if (!hasBodyFontFamily) {
        insertBodyFontRule(root);
    }
    let content = root.toString();
    if (!hasBrowserReset) {
        // Appended as raw text rather than parsed nodes so the sentinel
        // comment + commented-style block remain intact through future
        // postcss reads. Trailing newline kept tidy.
        content = content.replace(/\s*$/, '\n\n') + BROWSER_RESET_BLOCK + '\n';
    }
    if (!hasListPadding) {
        content = content.replace(/\s*$/, '\n\n') + LIST_PADDING_BLOCK + '\n';
    }
    if (!hasLinkCursor) {
        content = content.replace(/\s*$/, '\n\n') + LINK_CURSOR_BLOCK + '\n';
    }
    if (!hasTableReset) {
        content = content.replace(/\s*$/, '\n\n') + TABLE_RESET_BLOCK + '\n';
    }
    return { content, changed: true };
};
const checkHasFontSansToken = (root) => {
    let found = false;
    root.walkRules((rule) => {
        if (rule.selector.trim() !== ':root')
            return;
        rule.walkDecls((decl) => {
            if (decl.prop === '--font-sans')
                found = true;
        });
    });
    return found;
};
const checkHasBoxSizingReset = (root) => {
    // Any top-level rule whose selector includes `*` AND declares
    // `box-sizing` counts. Covers `* { box-sizing }`, the canonical
    // `*, *::before, *::after { box-sizing }`, and the
    // `html { box-sizing } *, *::before, *::after { box-sizing: inherit }`
    // pattern (the inherit half includes a `*` selector). Per-class
    // overrides like `.foo { box-sizing: content-box }` don't count —
    // those are intentional per-element exceptions, not a global reset.
    for (const node of root.nodes) {
        if (node.type !== 'rule')
            continue;
        if (!node.selector.includes('*'))
            continue;
        let found = false;
        node.walkDecls('box-sizing', () => {
            found = true;
        });
        if (found)
            return true;
    }
    return false;
};
const checkHasBodyFontFamily = (root) => {
    let found = false;
    // Top-level rules only — not inside @media or @supports etc., which
    // are conditional and shouldn't count as "the user has set the
    // page-wide default font".
    for (const node of root.nodes) {
        if (node.type !== 'rule')
            continue;
        if (node.selector.trim() !== 'body')
            continue;
        node.walkDecls('font-family', () => {
            found = true;
        });
        if (found)
            return true;
    }
    return false;
};
const insertFontSansToken = (root) => {
    // Find the first :root rule. If none exists, create one at the top
    // (after any leading @import at-rules, which conventionally come
    // first).
    let target = null;
    root.walkRules((rule) => {
        if (target)
            return;
        if (rule.selector.trim() === ':root')
            target = rule;
    });
    const decl = postcss.decl({
        prop: '--font-sans',
        value: DEFAULT_BODY_FONT_FAMILY,
    });
    if (target) {
        target.append(decl);
        return;
    }
    // No :root rule yet — create one. Insert AFTER any top-level
    // @import nodes so the conventional ordering (`@import` first,
    // then declarations) stays intact.
    const newRoot = postcss.rule({ selector: ':root' });
    newRoot.append(decl);
    let lastImportIndex = -1;
    root.nodes.forEach((node, idx) => {
        if (node.type === 'atrule' && node.name === 'import') {
            lastImportIndex = idx;
        }
    });
    if (lastImportIndex === -1) {
        root.prepend(newRoot);
    }
    else {
        const after = root.nodes[lastImportIndex];
        if (after)
            root.insertAfter(after, newRoot);
    }
};
const insertBoxSizingReset = (root) => {
    // Universal reset: `*, *::before, *::after { box-sizing: border-box; }`.
    // Postcss's selector parser handles the comma-separated form via
    // `selectors` — pass the joined string and the serializer keeps
    // them on one line.
    const rule = postcss.rule({ selector: '*,\n*::before,\n*::after' });
    rule.append(postcss.decl({ prop: 'box-sizing', value: 'border-box' }));
    // Append at the end of the file. Source-order doesn't matter for
    // this rule because the universal selector has the lowest possible
    // specificity (0,0,0) — any per-element / per-class override wins
    // regardless of where the reset lives in the file.
    root.append(rule);
};
const insertBodyFontRule = (root) => {
    const rule = postcss.rule({ selector: 'body' });
    rule.append(postcss.decl({ prop: 'font-family', value: 'var(--font-sans)' }));
    // Append at the end of the file so it follows any user-authored
    // rules — unlikely to clash with anything because we only call this
    // when there's no existing body { font-family } declaration.
    root.append(rule);
};
