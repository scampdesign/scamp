import type { AgentSkill } from './skill';

/**
 * React import tidy-up: the part of importing a React app that needs the
 * source, not the render. The deterministic import already made the app's
 * components, its lists into repeats, and kept its tokens; one render
 * can't say what a page shows only sometimes, or what the app calls its
 * lists. The source can.
 * see docs/plans/react-import-plan.md, Phase 6
 */

export const REACT_IMPORT_VERSION = 1;

const ALLOWED: ReadonlySet<string> = new Set([
  'scamp_get_react_source',
  'scamp_get_element_tree',
  'scamp_get_element_by_id',
  'scamp_check_view',
  'scamp_get_view_props',
  'scamp_get_active_page',
  'scamp_get_theme_tokens',
  'scamp_get_conventions',
  'scamp_list_components',
  'scamp_set_show',
  'scamp_rename_list',
  'scamp_set_tag',
]);

const INSTRUCTIONS = `You are tidying a view Scamp imported from a React app. The importer drew it from one render of the app: it already made the app's repeated parts into components, its lists into repeated elements, and kept its theme tokens. What one render can't tell is what the page shows only sometimes, and what the app calls its lists. The app's source can, and you can read it with scamp_get_react_source.

The one rule above every other: the view must look the same when you're done. Every element on it now is showing; a condition you add must keep it showing (its sample is true unless the source says the page was rendered with it off, which it can't have been — it's on the page).

How to work:
1. Read. Call scamp_get_react_source with the view's name and no element for the files it came from, then scamp_get_element_tree. Read the source of the elements that look conditional — badges, alerts, empty states, counts, banners, buttons that appear for some rows — and of each repeated list.
2. Plan. Post a short plan, then stop and wait for the user to go ahead:
   - Conditions: for each element the source renders only when something is true — \`{isOverdue && <Badge/>}\`, \`{items.length > 0 && …}\`, the shown side of \`a ? <X/> : <Y/>\` — the flag you'll add, named after the source's condition in camelCase (\`isOverdue\`, \`hasItems\`). A condition on a value (\`count > 0\`) becomes a flag named for what it means (\`hasCount\`).
   - Names: for each repeated list whose list, row or field names are generic (\`items\`, \`texts\`, \`text2\`), the source's names: \`claims.map((claim) => …)\`, \`claim.patientName\`.
   - Tags: an element the source writes as a different tag (a \`<button>\` the import made a \`<div>\`), only if it looks the same.
3. Apply, with scamp_set_show (shown: true), scamp_rename_list, and scamp_set_tag. Don't restyle anything.
4. Finish with what changed, in counts, and what you couldn't do and why — in particular anything the source decides per page that Scamp can't hold, like the selected item in a navigation.

Keep to what the source says. Don't invent a condition the source doesn't have, and don't rename something the source doesn't name. Don't change any words.`;

export const reactImportSkill = (): AgentSkill => ({
  id: 'react-import',
  version: REACT_IMPORT_VERSION,
  instructions: INSTRUCTIONS,
  tools: (all) => all.filter((tool) => ALLOWED.has(tool.name)),
  allows: (name) => ALLOWED.has(name),
  effort: 'high',
  planApproved: true,
});
