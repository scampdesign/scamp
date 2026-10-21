import { WRITE_TOOL_NAMES } from './writeTools';

/**
 * When the Scamp Agent stops and asks before editing.
 *
 * Deterministic, in the harness, not left to the model: a destructive edit
 * always asks, and so does a burst of edits big enough that the user
 * should see the list before it lands. The model is also told to describe
 * and ask first for large changes; this is what holds when it doesn't.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */

/** Edits that always ask. */
export const ALWAYS_CONFIRM: ReadonlySet<string> = new Set([
  'scamp_delete_element',
  'scamp_extract_component',
  'scamp_use_component',
  'scamp_set_theme_tokens',
]);

/** More edits than this in one reply, and the reply asks first. */
export const BATCH_LIMIT = 5;

export type ToolCall = { name: string; input: unknown };

/**
 * `planApproved`: a skill session where the user already approved a plan
 * — the many-edits check would only interrupt agreed work. Deletes,
 * components and theme changes ask regardless.
 */
export const needsConfirmation = (
  calls: ReadonlyArray<ToolCall>,
  options: { planApproved?: boolean } = {}
): boolean =>
  calls.some((c) => ALWAYS_CONFIRM.has(c.name) || isVariantRemoval(c)) ||
  (options.planApproved !== true && calls.filter((c) => WRITE_TOOL_NAMES.has(c.name)).length > BATCH_LIMIT);

/** Removing a variant property or value drops its styles. */
const isVariantRemoval = (c: ToolCall): boolean =>
  c.name === 'scamp_edit_variants' && ['remove_property', 'remove_value'].includes(str(c.input, 'action'));

const str = (input: unknown, key: string): string => {
  if (input === null || typeof input !== 'object') return '';
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
};

const clip = (text: string, max = 80): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** One edit, said as the confirmation card lists it — naming the view when it isn't the conversation's. */
export const describeToolCall = (call: ToolCall): string => {
  const view = str(call.input, 'view').trim();
  const said = describeEdit(call);
  return view.length > 0 ? `${said} (in ${view})` : said;
};

const describeEdit = ({ name, input }: ToolCall): string => {
  const element = str(input, 'element');
  switch (name) {
    case 'scamp_delete_element':
      return `Delete ${element} and everything inside it`;
    case 'scamp_set_styles': {
      const set = str(input, 'set');
      const breakpoint = str(input, 'breakpoint');
      const removeRaw = input !== null && typeof input === 'object' ? (input as Record<string, unknown>)['remove'] : undefined;
      const remove = Array.isArray(removeRaw) ? removeRaw.filter((r): r is string => typeof r === 'string') : [];
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
    case 'scamp_edit_variants': {
      const property = str(input, 'property');
      const value = str(input, 'value');
      switch (str(input, 'action')) {
        case 'add_property':
          return `Add the variant property ${property}`;
        case 'remove_property':
          return `Remove the variant property ${property} and its styles`;
        case 'add_value':
          return `Add ${value} to ${property}`;
        case 'remove_value':
          return `Remove ${value} from ${property}, with its styles`;
        case 'make_default':
          return `Make ${value} the default ${property}`;
        case 'add_interaction':
          return `Add a ${str(input, 'trigger')} interaction: ${property} ${str(input, 'from') || 'any'} → ${str(input, 'to')}`;
        default:
          return `Change the variants of ${property}`;
      }
    }
    case 'scamp_move_element':
      return `Move ${element} into ${str(input, 'parent')}`;
    case 'scamp_wrap_elements':
      return 'Wrap elements in a new container';
    case 'scamp_use_component':
      return `Replace ${element} with the component ${str(input, 'component')}`;
    case 'scamp_extract_component':
      return `Make ${element} into a component named ${str(input, 'name')}`;
    case 'scamp_set_theme_tokens': {
      const tokens = input !== null && typeof input === 'object' ? (input as Record<string, unknown>)['tokens'] : undefined;
      const names = tokens !== null && typeof tokens === 'object' ? Object.keys(tokens as object) : [];
      return `Add or change ${names.length} theme token${names.length === 1 ? '' : 's'}: ${clip(names.join(', '), 100)}`;
    }
    default:
      return name.replace(/^scamp_/, '').replace(/_/g, ' ');
  }
};
