export { applyAgentEvent, settleTranscript, startTurn, } from '@shared/agentTranscript';
/** What each read tool is doing, said as the panel says it. */
const TOOL_LABELS = {
    scamp_get_active_page: 'Looked at the open page',
    scamp_get_selected_element: 'Looked at the selection',
    scamp_get_element_by_id: 'Read an element',
    scamp_get_element_tree: 'Read the layer tree',
    scamp_get_canvas_state: 'Read the whole canvas',
    scamp_list_pages: 'Listed the pages',
    scamp_list_components: 'Listed the components',
    scamp_get_view_props: 'Read the view’s props',
    scamp_check_view: 'Checked the view',
    scamp_check_project: 'Checked the project',
    scamp_list_routes: 'Listed the routes',
    scamp_list_import_sources: 'Listed imported pages',
    scamp_get_import_source: 'Read the imported original',
    scamp_get_recent_edits: 'Read your recent edits',
    scamp_get_conventions: 'Read the project’s conventions',
    scamp_get_theme_tokens: 'Read the theme tokens',
    scamp_set_styles: 'Edit styles',
    scamp_add_element: 'Add an element',
    scamp_set_text: 'Edit text',
    scamp_set_tag: 'Change a tag',
    scamp_set_attributes: 'Edit attributes',
    scamp_move_element: 'Move an element',
    scamp_wrap_elements: 'Wrap elements',
    scamp_delete_element: 'Delete an element',
    scamp_extract_component: 'Make a component',
    scamp_set_theme_tokens: 'Edit theme tokens',
};
export const toolLabel = (name) => TOOL_LABELS[name] ?? name.replace(/^scamp_/, '').replace(/_/g, ' ');
const targetLabel = (target) => `${target.kind === 'component' ? 'Component' : target.kind === 'view' ? 'View' : 'Page'}: ${target.name}`;
/**
 * The line that tells the agent — and the user, in the panel — what the
 * agent is looking at.
 */
export const agentContextLine = (input) => {
    const focus = input.focus ?? 'selection';
    if (focus === 'project') {
        return input.target === null ? 'Whole project' : `Whole project · Open: ${targetLabel(input.target)}`;
    }
    const parts = [];
    if (input.target !== null)
        parts.push(targetLabel(input.target));
    const [first, ...rest] = input.selection;
    if (focus === 'page') {
        if (input.target !== null)
            parts.push('Whole page');
    }
    else if (first !== undefined) {
        const one = first.name !== undefined && first.name.length > 0 ? `${first.name} (${first.className})` : first.className;
        parts.push(rest.length === 0 ? `Selected: ${one}` : `Selected: ${one} and ${rest.length} more`);
    }
    else if (input.target !== null) {
        parts.push('Nothing selected');
    }
    return parts.join(' · ');
};
/**
 * Tokens for one exchange, for the line under a reply. Tokens read from
 * the cache are counted apart: they cost a tenth of the rest, and a long
 * conversation re-reads its whole history at every step, so one total
 * would make a cheap exchange look expensive.
 */
export const formatUsage = (usage) => {
    const fresh = usage.inputTokens + usage.outputTokens + usage.cacheWriteTokens;
    const line = `${fresh.toLocaleString('en-US')} tokens`;
    return usage.cacheReadTokens > 0
        ? `${line} · ${usage.cacheReadTokens.toLocaleString('en-US')} from cache`
        : line;
};
/**
 * A reply's words, as the agent wrote them — Markdown and all, so they
 * paste into a document or an issue the way they read in the panel.
 * Tool calls and confirmations are the panel's, not the agent's words.
 */
export const replyText = (entry) => entry.parts
    .flatMap((part) => (part.kind === 'text' && part.text.trim().length > 0 ? [part.text.trim()] : []))
    .join('\n\n');
