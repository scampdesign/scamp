/**
 * Import cleanup: turn a page Scamp imported from a website into a clean,
 * editable Scamp page — without changing how it looks.
 *
 * The deterministic importer stays the first pass and works with no key;
 * this is the layer on top. When a step here fires on most pages, that's
 * a case for teaching the importer, so every user gets it.
 * see docs/plans/builtin-agent-plan.md
 */
export const IMPORT_CLEANUP_VERSION = 1;
const COMMON = `You are cleaning up a page Scamp imported from a website. The importer already made it look like the source; your job is to make it a clean Scamp page that a designer can edit — without changing how it looks.

The one rule above every other: the page must look the same when you're done. Don't restyle, "improve", or tidy the design itself. If you aren't sure an edit leaves the page looking the same, don't make it — list it at the end instead.

How to work:
1. Read first. Call scamp_check_view for this view to get Scamp's findings, and scamp_get_element_tree for its structure. scamp_get_import_source has the page's original CSS when you need to know what the site actually wrote.
2. Plan. Before any edit, post a short plan grouped by the steps below — what you'll change, how many elements, an example or two — and ask the user to go ahead. Then stop and wait for their answer.
3. Apply the plan, in the order below. Call scamp_check_view after each step and fix anything you caused.
4. Finish with what changed, in counts, and what you left alone and why.

The steps, in order:
1. Editability. Fold per-side values into the shorthands Scamp types — border-top/right/bottom/left into border, padding-* into padding, margin-* into margin, corner radii into border-radius — when the sides allow it. Rewrite a value the properties panel can't read into a form it can (px, %, or var(--token)) when that renders the same. Leave properties with no panel control alone; they belong in the CSS as they are.
2. Layout. Where children are placed absolutely but clearly form a row, a column, or a grid, give the parent display: flex (or grid) with the measured gap, and let the children flow — only when their measured positions make the arrangement certain. Keep decorative overlays absolute.
3. Structure. Use the tag that says what each thing is: header, nav, main, section, footer, h1–h6, p, a, button, ul and li. Remove wrappers that add nothing — one child, no styles that change the result — by moving the child out and deleting the wrapper.
4. Components. Where three or more containers are the same design with different content (cards, list items, nav links), propose a component with a PascalCase name. Extract one; put the others in alsoReplace only if their structure and styles truly match, because their own content is replaced by the component's.
5. Tokens — see below.

Don't change any words. Don't delete anything that renders. Don't change a size unless a layout change needs it and the rendered size stays the same.`;
const TOKENS = {
    'create-tokens': `Tokens: the user chose to create theme tokens. Find the colours, spacing, and type values the page repeats (three uses or more), name them by role — --color-text, --color-surface, --color-accent, --space-4, --text-lg — and list them in your plan with their values and how often each is used. Reuse a token theme.css already declares with the same value rather than adding a duplicate. Add the new ones in one scamp_set_theme_tokens call, then replace the matching literal values with var(--name). Never reference a token theme.css doesn't declare.`,
    'keep-literal': `Tokens: the user chose to keep literal values. Don't add or change theme tokens — the tool is off for this cleanup. You may use var(--name) only where theme.css already declares that token with exactly the same value.`,
};
export const importCleanupSkill = (tokenMode) => ({
    id: 'import-cleanup',
    version: IMPORT_CLEANUP_VERSION,
    instructions: `${COMMON}\n\n${TOKENS[tokenMode]}`,
    tools: (all) => all.filter((tool) => tokenMode === 'create-tokens' || tool.name !== 'scamp_set_theme_tokens'),
    allows: (name) => tokenMode === 'create-tokens' || name !== 'scamp_set_theme_tokens',
    effort: 'high',
    planApproved: true,
});
