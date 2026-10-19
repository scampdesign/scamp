import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';

/**
 * The edits the built-in agent can make. Answered by the renderer
 * (`agentToolResponder`): against the live store for the open view, and
 * against the files for any other (`view`), each through Scamp's own
 * generate → parse round trip — the agent never writes a file itself.
 * Built-in only: the MCP server stays read-only.
 *
 * `eager_input_streaming` so a long CSS value arrives as it's written; the
 * renderer validates every input before it acts on it.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */

const element = {
  type: 'string',
  description: 'The element: its Scamp id (e.g. "a1b2") or class name (e.g. "card_a1b2"). "root" is the page root.',
} as const;

/** Any view or component, not only the open one. see docs/notes/agent-whole-project.md */
const view = {
  type: 'string',
  description:
    'The view or component to edit (scamp_list_pages `view`, scamp_list_components). Omit for the one this conversation is about. Element ids are per view, so read that view’s tree first.',
} as const;

export const WRITE_TOOLS: BetaTool[] = [
  {
    name: 'scamp_set_styles',
    description:
      'Set and remove CSS declarations on an element’s class rule, as if typed in its CSS module. "set" takes declarations ("display: flex; gap: 12px"); a property already in the rule is replaced, others are kept. "remove" deletes properties. Pass a breakpoint label (e.g. "Mobile") to style that breakpoint only. In a component with variants, pass "variant" (a value, or axis=value such as "variant=outline") to style that value only: the rest of the component keeps its base styles. The result says which values rendered but the properties panel can’t edit — prefer shorthands Scamp types (padding, border, border-radius) over per-side longhands.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        view,
        element,
        set: { type: 'string', description: 'CSS declarations to set.' },
        remove: { type: 'array', items: { type: 'string' }, description: 'CSS properties to remove.' },
        breakpoint: { type: 'string', description: 'A breakpoint label or id. Omit for desktop.' },
        variant: { type: 'string', description: 'A component variant value, e.g. "outline" or "size=small". Omit for the base styles.' },
      },
      required: ['element'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_add_element',
    description:
      'Add an element inside a container. Pass "text" for a text element (default tag p); omit it for a container (default tag div). "css" styles it from nothing — no default size. "name" becomes its class prefix (name "cta" → class cta_a1b2). Put it in a flex or grid parent so it flows; in any other parent it is placed absolutely at the top-left.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        view,
        parent: { ...element, description: 'The container to add to.' },
        text: { type: 'string', description: 'The words, for a text element.' },
        tag: { type: 'string', description: 'An HTML tag Scamp offers for that kind of element.' },
        css: { type: 'string', description: 'CSS declarations for its class.' },
        name: { type: 'string', description: 'A short name for the layer and class, e.g. "cta".' },
        index: { type: 'integer', description: 'Position among the parent’s children. Omit to add at the end.' },
      },
      required: ['parent'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_set_text',
    description: 'Replace the words of a text element. A container’s words are in a text element inside it.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: { view, element, text: { type: 'string' } },
      required: ['element', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_set_tag',
    description:
      'Change an element’s HTML tag, to one Scamp offers for that kind of element — e.g. a container to section, nav, header, or button; text to h1–h6, p, a, or li.',
    input_schema: {
      type: 'object',
      properties: { view, element, tag: { type: 'string' } },
      required: ['element', 'tag'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_set_attributes',
    description:
      'Set HTML attributes on an element (href, alt, title, aria-*, role…). A null value removes one. Class names, data-scamp-* ids, inline styles and event handlers are managed by Scamp and refused.',
    input_schema: {
      type: 'object',
      properties: {
        view,
        element,
        attributes: {
          type: 'object',
          description: 'Attribute name → string value, or null to remove.',
          additionalProperties: { type: ['string', 'null'] },
        },
      },
      required: ['element', 'attributes'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_move_element',
    description: 'Move an element into another container, or to another position in its own.',
    input_schema: {
      type: 'object',
      properties: {
        view,
        element,
        parent: { ...element, description: 'The container to move it into.' },
        index: { type: 'integer', description: 'Position among the new parent’s children. Omit for the end.' },
      },
      required: ['element', 'parent'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_delete_element',
    description:
      'Delete an element and everything inside it. Scamp always asks the user to confirm first; if they decline, the result says so — ask what they want instead of retrying.',
    input_schema: {
      type: 'object',
      properties: { view, element },
      required: ['element'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_extract_component',
    description:
      'Turn a container into a reusable component (PascalCase name, e.g. Card), replacing it with an instance. "alsoReplace" lists other containers that are the same design — they become instances of the new component too, so check they really match: their own content is replaced by the component’s. Scamp asks the user first.',
    input_schema: {
      type: 'object',
      properties: {
        view,
        element,
        name: { type: 'string', description: 'PascalCase component name.' },
        alsoReplace: {
          type: 'array',
          items: { type: 'string' },
          description: 'Other matching containers to replace with instances.',
        },
      },
      required: ['element', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_use_component',
    description:
      'Replace a container with an instance of an existing component — e.g. the same header on every view, once one view’s header has been extracted with scamp_extract_component. The container and everything inside it are replaced by the component’s design, so check they match first. Scamp asks the user first.',
    input_schema: {
      type: 'object',
      properties: {
        view,
        element: { ...element, description: 'The container to replace.' },
        component: { type: 'string', description: 'The component, by name (scamp_list_components).' },
      },
      required: ['element', 'component'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_set_theme_tokens',
    description:
      'Add or change base theme tokens in theme.css: { "--color-text": "#1a1a1a" }. Then reference them with var(--name) in styles. Reuse a token that already has the value rather than adding a duplicate. Scamp asks the user first; theme changes are undone by Undo AI changes, not Cmd+Z.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        tokens: {
          type: 'object',
          description: 'Token name (--kebab-case) → value.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['tokens'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_wrap_elements',
    description:
      'Wrap sibling elements in a new container, optionally with a tag, a name, and CSS — e.g. to group a heading and its text in a header with display: flex.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        view,
        elements: { type: 'array', items: { type: 'string' }, description: 'Sibling elements, by id or class.' },
        tag: { type: 'string' },
        name: { type: 'string' },
        css: { type: 'string' },
      },
      required: ['elements'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_set_show',
    description:
      'Make an element appear only when a boolean prop is true — the `{flag && …}` a React app writes. "flag" names the prop (camelCase; prefix with "!" to show when it is false); "shown" is its sample value, which decides whether the canvas shows the element now. Pass flag "" to remove the condition.',
    input_schema: {
      type: 'object',
      properties: {
        view,
        element,
        flag: { type: 'string', description: 'The prop, e.g. "hasOverdue" or "!isEmpty". Empty to remove.' },
        shown: { type: 'boolean', description: 'The sample: whether the element shows on the canvas now. Default true.' },
      },
      required: ['element', 'flag'],
      additionalProperties: false,
    },
  },
  {
    name: 'scamp_rename_list',
    description:
      'Rename a repeated list in a view or component: the list prop, its row variable, and any of its row fields — everywhere they are used, and in the sample rows. Use the names the source gives (`claims.map((claim) => …)`, `claim.patientName`).',
    input_schema: {
      type: 'object',
      properties: {
        view,
        list: { type: 'string', description: 'The list as it is named now.' },
        to: { type: 'string', description: 'Its new name.' },
        row: { type: 'string', description: 'A new name for its row variable.' },
        fields: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Row fields to rename, old name → new name.',
        },
      },
      required: ['list'],
      additionalProperties: false,
    },
  },
];

export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(WRITE_TOOLS.map((t) => t.name));
