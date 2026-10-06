import { WRITE_TOOL_NAMES } from './writeTools';
/**
 * When the Scamp Agent stops and asks before editing.
 *
 * Deterministic, in the harness, not left to the model: a destructive edit
 * always asks, and so does a burst of edits big enough that the user
 * should see the list before it lands. The model is also told to describe
 * and ask first for large changes; this is what holds when it doesn't.
 * see docs/plans/builtin-agent-plan.md
 */
/** Edits that always ask. */
export const ALWAYS_CONFIRM = new Set([
    'scamp_delete_element',
    'scamp_extract_component',
    'scamp_set_theme_tokens',
]);
/** More edits than this in one reply, and the reply asks first. */
export const BATCH_LIMIT = 5;
/**
 * `planApproved`: a skill session where the user already approved a plan
 * — the many-edits check would only interrupt agreed work. Deletes,
 * components and theme changes ask regardless.
 */
export const needsConfirmation = (calls, options = {}) => calls.some((c) => ALWAYS_CONFIRM.has(c.name)) ||
    (options.planApproved !== true && calls.filter((c) => WRITE_TOOL_NAMES.has(c.name)).length > BATCH_LIMIT);
const str = (input, key) => {
    if (input === null || typeof input !== 'object')
        return '';
    const value = input[key];
    return typeof value === 'string' ? value : '';
};
const clip = (text, max = 80) => {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
/** One edit, said as the confirmation card lists it. */
export const describeToolCall = ({ name, input }) => {
    const element = str(input, 'element');
    switch (name) {
        case 'scamp_delete_element':
            return `Delete ${element} and everything inside it`;
        case 'scamp_set_styles': {
            const set = str(input, 'set');
            const breakpoint = str(input, 'breakpoint');
            const removeRaw = input !== null && typeof input === 'object' ? input['remove'] : undefined;
            const remove = Array.isArray(removeRaw) ? removeRaw.filter((r) => typeof r === 'string') : [];
            const parts = [...(set ? [clip(set)] : []), ...(remove.length > 0 ? [`remove ${remove.join(', ')}`] : [])];
            return `Change styles on ${element}${breakpoint ? ` at ${breakpoint}` : ''}: ${parts.join('; ')}`;
        }
        case 'scamp_add_element': {
            const text = str(input, 'text');
            const tag = str(input, 'tag');
            return `Add ${tag ? `a <${tag}>` : text ? 'text' : 'a container'}${text ? ` "${clip(text, 40)}"` : ''} to ${str(input, 'parent')}`;
        }
        case 'scamp_set_text':
            return `Change the text of ${element} to "${clip(str(input, 'text'), 60)}"`;
        case 'scamp_set_show':
            return str(input, 'flag') ? `Show ${element} only when ${str(input, 'flag')}` : `Always show ${element}`;
        case 'scamp_rename_list':
            return `Rename the list ${str(input, 'list')}${str(input, 'to') ? ` to ${str(input, 'to')}` : ''}`;
        case 'scamp_set_tag':
            return `Change ${element} to <${str(input, 'tag')}>`;
        case 'scamp_set_attributes':
            return `Change attributes on ${element}`;
        case 'scamp_move_element':
            return `Move ${element} into ${str(input, 'parent')}`;
        case 'scamp_wrap_elements':
            return 'Wrap elements in a new container';
        case 'scamp_extract_component':
            return `Make ${element} into a component named ${str(input, 'name')}`;
        case 'scamp_set_theme_tokens': {
            const tokens = input !== null && typeof input === 'object' ? input['tokens'] : undefined;
            const names = tokens !== null && typeof tokens === 'object' ? Object.keys(tokens) : [];
            return `Add or change ${names.length} theme token${names.length === 1 ? '' : 's'}: ${clip(names.join(', '), 100)}`;
        }
        default:
            return name.replace(/^scamp_/, '').replace(/_/g, ' ');
    }
};
