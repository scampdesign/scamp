import type { ElementType } from './element';

/**
 * One option in the tag dropdown. The `value` is the literal HTML tag
 * name; `label` is what the user sees.
 */
export type TagOption = {
  value: string;
  label: string;
};

/**
 * A tag-specific attribute field the Element section renders.
 *
 * - `text`    — free-form string input
 * - `select`  — dropdown with a fixed option set
 * - `boolean` — checkbox; stored as `""` when checked, absent when not
 */
export type AttributeSpec =
  | { name: string; label: string; kind: 'text'; placeholder?: string }
  | {
      name: string;
      label: string;
      kind: 'select';
      options: ReadonlyArray<TagOption>;
    }
  | { name: string; label: string; kind: 'boolean' };

/**
 * Tag options offered in the Element section's tag dropdown, keyed by
 * the element's `type` discriminator.
 *
 * Class-prefix defaults (rect_/text_/img_/input_) stay tied to the
 * element's `type`, not its tag, so a `nav` rectangle still gets a
 * `rect_` prefix.
 */
export const TAG_OPTIONS: Record<ElementType, ReadonlyArray<TagOption>> = {
  // Component instances render as the user-defined component's own
  // PascalCase JSX tag — not configurable through the tag dropdown.
  // The empty list signals "no tag picker for this element"; the
  // Element section can detect it and surface the component
  // identity instead.
  'component-instance': [],
  rectangle: [
    { value: 'div', label: 'div' },
    { value: 'section', label: 'section' },
    { value: 'article', label: 'article' },
    { value: 'aside', label: 'aside' },
    { value: 'main', label: 'main' },
    { value: 'header', label: 'header' },
    { value: 'footer', label: 'footer' },
    { value: 'nav', label: 'nav' },
    { value: 'figure', label: 'figure' },
    { value: 'form', label: 'form' },
    { value: 'fieldset', label: 'fieldset' },
    { value: 'ul', label: 'ul' },
    { value: 'ol', label: 'ol' },
    { value: 'li', label: 'li' },
    { value: 'details', label: 'details' },
    { value: 'summary', label: 'summary' },
    // The table family. `table`, its sections and `tr` are containers;
    // `th` and `td` are dual-natured like `li` — a plain `<td>Smith</td>`
    // parses as a text element, one with element children as a
    // rectangle — so they appear in BOTH lists.
    // see docs/plans/tables-plan.md
    { value: 'table', label: 'table' },
    { value: 'thead', label: 'thead' },
    { value: 'tbody', label: 'tbody' },
    { value: 'tfoot', label: 'tfoot' },
    { value: 'tr', label: 'tr' },
    { value: 'th', label: 'th' },
    { value: 'td', label: 'td' },
    { value: 'dialog', label: 'dialog' },
    { value: 'button', label: 'button' },
    { value: 'a', label: 'a' },
  ],
  text: [
    { value: 'p', label: 'p' },
    { value: 'h1', label: 'h1' },
    { value: 'h2', label: 'h2' },
    { value: 'h3', label: 'h3' },
    { value: 'h4', label: 'h4' },
    { value: 'h5', label: 'h5' },
    { value: 'h6', label: 'h6' },
    { value: 'span', label: 'span' },
    { value: 'label', label: 'label' },
    { value: 'blockquote', label: 'blockquote' },
    { value: 'pre', label: 'pre' },
    { value: 'code', label: 'code' },
    { value: 'strong', label: 'strong' },
    { value: 'em', label: 'em' },
    { value: 'small', label: 'small' },
    { value: 'time', label: 'time' },
    { value: 'figcaption', label: 'figcaption' },
    { value: 'legend', label: 'legend' },
    { value: 'li', label: 'li' },
    // `<a>` is a valid text-element tag too — the LinkField's Convert
    // path swaps a text element's tag to `<a>` directly, so the
    // dropdown needs to be able to render `'a'` as the selected
    // option when that's happened.
    { value: 'a', label: 'a' },
    // `<button>` is dual-natured like `<a>`: a plain button with just a
    // label parses as a text element (editable text), so the text-tag
    // dropdown must be able to render `'button'` as the selected option.
    // A button with element children is a rectangle (see the rectangle
    // list above).
    { value: 'button', label: 'button' },
    // The dual-natured half of the table family, plus `caption`, which
    // only ever holds words. see docs/plans/tables-plan.md
    { value: 'th', label: 'th' },
    { value: 'td', label: 'td' },
    { value: 'caption', label: 'caption' },
  ],
  image: [
    { value: 'img', label: 'img' },
    { value: 'video', label: 'video' },
    { value: 'iframe', label: 'iframe' },
    { value: 'svg', label: 'svg' },
  ],
  input: [
    { value: 'input', label: 'input' },
    { value: 'textarea', label: 'textarea' },
    { value: 'select', label: 'select' },
  ],
};

/** Default tag for a given element type, used when `tag` is undefined. */
export const DEFAULT_TAG: Record<ElementType, string> = {
  rectangle: 'div',
  text: 'p',
  image: 'img',
  input: 'input',
  // Component instances render as their PascalCase component name
  // (set from `componentName` on the element). This sentinel is
  // never emitted directly — `tagFor` reads `componentName` for
  // component-instance elements before falling back to the type
  // default.
  'component-instance': '',
};

const METHOD_OPTIONS: ReadonlyArray<TagOption> = [
  { value: 'get', label: 'GET' },
  { value: 'post', label: 'POST' },
];

const BUTTON_TYPE_OPTIONS: ReadonlyArray<TagOption> = [
  { value: 'button', label: 'button' },
  { value: 'submit', label: 'submit' },
  { value: 'reset', label: 'reset' },
];

const INPUT_TYPE_OPTIONS: ReadonlyArray<TagOption> = [
  { value: 'text', label: 'text' },
  { value: 'email', label: 'email' },
  { value: 'password', label: 'password' },
  { value: 'number', label: 'number' },
  { value: 'checkbox', label: 'checkbox' },
  { value: 'radio', label: 'radio' },
  { value: 'range', label: 'range' },
  { value: 'date', label: 'date' },
  { value: 'file', label: 'file' },
];

/**
 * Per-tag attribute specs shown in the Element section below the tag
 * dropdown. A tag with no entry here shows just the dropdown.
 *
 * `<select>` (option list) and `<svg>` (raw source) aren't in this map
 * because they have dedicated editors rendered separately.
 */
/**
 * Attributes a tag can BIND that are deliberately absent from
 * `TAG_ATTRIBUTES`, because another section already owns their editing
 * UI. `ElementSection` renders one input per `TAG_ATTRIBUTES` entry, so
 * listing `<img>`'s `src` and `alt` there would put a second Src and
 * Alt field beside the ones the Image section owns — but they bind like
 * any other attribute, and the Data tab has to offer them.
 * see docs/notes/view-bindings.md
 */
export const BINDABLE_TYPED_ATTRIBUTES: Record<string, ReadonlyArray<string>> = {
  img: ['src', 'alt'],
};

/** Shared by `th` and `td` — the two tags that can span tracks. */
const TABLE_CELL_ATTRIBUTES: ReadonlyArray<AttributeSpec> = [
  { name: 'colSpan', label: 'Col span', kind: 'text', placeholder: '1' },
  { name: 'rowSpan', label: 'Row span', kind: 'text', placeholder: '1' },
];

export const TAG_ATTRIBUTES: Record<string, ReadonlyArray<AttributeSpec>> = {
  // `<a>` href/target/rel are managed by the LinkField in the Element
  // section — that flow handles internal page references, external URL
  // validation, and the "Open in new tab" toggle (which writes both
  // `target` and `rel`). No tag-specific attribute fields here.
  a: [],
  button: [
    { name: 'type', label: 'Type', kind: 'select', options: BUTTON_TYPE_OPTIONS },
  ],
  form: [
    { name: 'method', label: 'Method', kind: 'select', options: METHOD_OPTIONS },
    { name: 'action', label: 'Action', kind: 'text', placeholder: '/submit' },
  ],
  dialog: [{ name: 'open', label: 'Open', kind: 'boolean' }],
  // A cell's span. Scamp derives `grid-column: span n` from this, so
  // the semantic attribute is the only place it is written down.
  // see docs/plans/tables-plan.md
  th: TABLE_CELL_ATTRIBUTES,
  td: TABLE_CELL_ATTRIBUTES,
  label: [{ name: 'htmlFor', label: 'For', kind: 'text', placeholder: 'input-id' }],
  blockquote: [{ name: 'cite', label: 'Cite', kind: 'text' }],
  time: [
    {
      name: 'datetime',
      label: 'Datetime',
      kind: 'text',
      placeholder: '2026-01-01T12:00',
    },
  ],
  video: [
    { name: 'src', label: 'Src', kind: 'text' },
    { name: 'controls', label: 'Controls', kind: 'boolean' },
    { name: 'autoplay', label: 'Autoplay', kind: 'boolean' },
    { name: 'loop', label: 'Loop', kind: 'boolean' },
    { name: 'muted', label: 'Muted', kind: 'boolean' },
  ],
  iframe: [
    { name: 'src', label: 'Src', kind: 'text' },
    { name: 'title', label: 'Title', kind: 'text' },
  ],
  input: [
    { name: 'type', label: 'Type', kind: 'select', options: INPUT_TYPE_OPTIONS },
    { name: 'placeholder', label: 'Placeholder', kind: 'text' },
  ],
  textarea: [
    { name: 'rows', label: 'Rows', kind: 'text', placeholder: '3' },
    { name: 'placeholder', label: 'Placeholder', kind: 'text' },
  ],
};

/** True when the tag has a dedicated non-dropdown editor (select, svg). */
export const hasSpecialEditor = (tag: string): boolean =>
  tag === 'select' || tag === 'svg';
