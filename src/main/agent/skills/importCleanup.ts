import type { AgentTokenMode as TokenMode } from '@shared/types';

import type { AgentSkill } from './skill';

/**
 * Import cleanup: turn a page Scamp imported from a website into a clean,
 * editable Scamp page — without changing how it looks.
 *
 * The deterministic importer stays the first pass and works with no key;
 * this is the layer on top. When a step here fires on most pages, that's
 * a case for teaching the importer, so every user gets it.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */

export const IMPORT_CLEANUP_VERSION = 3;

const COMMON = `You are cleaning up a page Scamp imported from a website. The importer already made it look like the source; your job is to make it a clean Scamp page that a designer can edit — without changing how it looks.

The one rule above every other: the page must look the same when you're done. Don't restyle, "improve", or tidy the design itself. If you aren't sure an edit leaves the page looking the same, don't make it — list it at the end instead.

How to work:
1. Read first. Call scamp_check_view for this view to get Scamp's findings, and scamp_get_element_tree for its structure. scamp_get_import_source has the page's original CSS when you need to know what the site actually wrote.
2. Plan. Before any edit, post a short plan grouped by the steps below — what you'll change, how many elements, an example or two — and ask the user to go ahead. Then stop and wait for their answer.
3. Apply the plan, in the order below. Call scamp_check_view after each step and fix anything you caused.
4. Finish with what changed, in counts, and what you left alone and why.

The steps, in order:
1. Editability. scamp_check_view lists the values the properties panel can't edit ("side-not-typed", "not-panel-editable"). Rewrite the ones that have a form Scamp types and renders the same:
   - A border on some sides only: remove the per-side properties and set all four sides, with 0 on the sides that had none. border-bottom: 1px solid #ddd becomes border-width: 0 0 1px 0; border-style: solid; border-color: #ddd. The sides at 0 draw nothing, so the page looks the same. This works only when every bordered side shares one style and one colour; if they differ, leave it.
   - Padding on some sides only: one padding shorthand with 0 on the others — padding-top: 10px; padding-bottom: 10px becomes padding: 10px 0.
   - Corner radii: one border-radius with all four corners, 0 where a corner had none.
   - Margin on some sides: the same, but only when the other sides are really 0. A missing side may be auto (that's how a box is centred); read the original CSS with scamp_get_import_source when unsure, and leave it if it's auto.
   - A value in a unit the panel can't read: rewrite it in px, %, or var(--token) only when that renders exactly the same.
   Leave properties with no panel control alone; they belong in the CSS as they are.
   Not every finding is yours to fix. A display the panel can't express — inline, inline-block, list-item, contents — stays exactly as it is: changing display changes the layout, and there is no typed form that renders the same. The same goes for any finding whose only fix would change how the page looks. Leave it, and name it in your summary as something the user may want to decide.
2. Layout. Where children are placed absolutely but clearly form a row, a column, or a grid, give the parent display: flex (or grid) with the measured gap, and let the children flow — only when their measured positions make the arrangement certain. Keep decorative overlays absolute.
3. Structure. Use the tag that says what each thing is: header, nav, main, section, footer, h1–h6, p, a, button, ul and li. Remove wrappers that add nothing — one child, no styles that change the result — by moving the child out and deleting the wrapper.
4. Components. Where three or more containers are the same design with different content (cards, list items, nav links), propose a component with a PascalCase name. Extract one; put the others in alsoReplace only if their structure and styles truly match, because their own content is replaced by the component's.
5. Tokens — see below.

Don't change any words. Don't delete anything that renders. Don't change a size unless a layout change needs it and the rendered size stays the same.`;

const TOKENS: Record<TokenMode, string> = {
  'create-tokens': `Tokens: the user chose to create theme tokens. Find the colours, spacing, and type values the page repeats (three uses or more), name them by role — --color-text, --color-surface, --color-accent, --space-4, --text-lg — and list them in your plan with their values and how often each is used. Reuse a token theme.css already declares with the same value rather than adding a duplicate. Add the new ones in one scamp_set_theme_tokens call, then replace the matching literal values with var(--name). Never reference a token theme.css doesn't declare.`,
  'keep-literal': `Tokens: the user chose to keep literal values. Don't add or change theme tokens — the tool is off for this cleanup. You may use var(--name) only where theme.css already declares that token with exactly the same value.`,
};

export const importCleanupSkill = (tokenMode: TokenMode): AgentSkill => ({
  id: 'import-cleanup',
  version: IMPORT_CLEANUP_VERSION,
  instructions: `${COMMON}\n\n${TOKENS[tokenMode]}`,
  tools: (all) => all.filter((tool) => tokenMode === 'create-tokens' || tool.name !== 'scamp_set_theme_tokens'),
  allows: (name) => tokenMode === 'create-tokens' || name !== 'scamp_set_theme_tokens',
  effort: 'high',
  planApproved: true,
});
