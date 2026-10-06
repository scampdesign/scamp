/** A user message and the reply it's waiting for. */
export const startTurn = (entries, turnId, text, context) => [
    ...entries,
    { role: 'user', id: `${turnId}:user`, text, context },
    { role: 'assistant', id: turnId, parts: [], progress: '', status: 'working' },
];
const withLastPart = (parts, kind, update) => {
    const last = parts.at(-1);
    if (last !== undefined && last.kind === kind)
        return [...parts.slice(0, -1), update(last)];
    return [...parts, update(null)];
};
const reduceAssistant = (entry, event) => {
    switch (event.kind) {
        case 'text':
            return {
                ...entry,
                progress: '',
                parts: withLastPart(entry.parts, 'text', (part) => ({
                    kind: 'text',
                    text: (part?.kind === 'text' ? part.text : '') + event.text,
                })),
            };
        case 'progress':
            return { ...entry, progress: entry.progress + event.text };
        case 'tool-start':
            return {
                ...entry,
                progress: '',
                parts: withLastPart(entry.parts, 'tools', (part) => ({
                    kind: 'tools',
                    calls: [
                        ...(part?.kind === 'tools' ? part.calls : []),
                        { id: event.toolId, name: event.name, status: 'running' },
                    ],
                })),
            };
        case 'tool-end':
            return {
                ...entry,
                parts: entry.parts.map((part) => part.kind !== 'tools'
                    ? part
                    : {
                        kind: 'tools',
                        calls: part.calls.map((call) => call.id === event.toolId
                            ? {
                                ...call,
                                status: event.ok ? 'ok' : 'failed',
                                ...(event.summary !== undefined ? { summary: event.summary } : {}),
                            }
                            : call),
                    }),
            };
        case 'confirm-request':
            return {
                ...entry,
                progress: '',
                parts: [...entry.parts, { kind: 'confirm', id: event.confirmId, items: event.items, state: 'pending' }],
            };
        case 'confirm-resolved':
            return {
                ...entry,
                parts: entry.parts.map((part) => part.kind === 'confirm' && part.id === event.confirmId
                    ? { ...part, state: event.approved ? 'approved' : 'declined' }
                    : part),
            };
        case 'turn-end':
            return {
                ...entry,
                progress: '',
                status: event.outcome,
                usage: event.usage,
                ...(event.message !== undefined ? { message: event.message } : {}),
            };
    }
};
/**
 * Fold one event in. An event for a turn the transcript doesn't have — one
 * from before a reset — is ignored.
 */
export const applyAgentEvent = (entries, event) => entries.map((entry) => entry.role === 'assistant' && entry.id === event.turnId ? reduceAssistant(entry, event) : entry);
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
/**
 * The line that tells the agent — and the user, in the panel — what the
 * agent is looking at.
 */
export const agentContextLine = (input) => {
    const parts = [];
    if (input.target !== null) {
        const kind = input.target.kind === 'component' ? 'Component' : input.target.kind === 'view' ? 'View' : 'Page';
        parts.push(`${kind}: ${input.target.name}`);
    }
    const [first, ...rest] = input.selection;
    if (first !== undefined) {
        const one = first.name !== undefined && first.name.length > 0 ? `${first.name} (${first.className})` : first.className;
        parts.push(rest.length === 0 ? `Selected: ${one}` : `Selected: ${one} and ${rest.length} more`);
    }
    else if (input.target !== null) {
        parts.push('Nothing selected');
    }
    return parts.join(' · ');
};
/** Tokens for one exchange, for the line under a reply. */
export const formatUsage = (usage) => {
    const total = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
    return `${total.toLocaleString('en-US')} tokens`;
};
