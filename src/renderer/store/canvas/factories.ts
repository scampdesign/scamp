// store/canvas/factories.ts — pure element factories, split from canvasSlice.ts (5.1).
import { ROOT_ELEMENT_ID, SVG_SRC_ATTR, type ScampElement } from '@lib/element';
import { DEFAULT_RECT_STYLES, DEFAULT_ROOT_STYLES } from '@lib/defaults';
import { DEFAULT_BODY_FONT_FAMILY } from '@shared/agentMd';
import type { ThemeToken } from '@shared/types';
import type {
  NewRectInput,
  NewTextInput,
  NewImageInput,
  NewSvgInput,
  NewInputInput,
  NewComponentInstanceInput,
} from '../canvasSlice';

export const makeRootElement = (): ScampElement => ({
  ...DEFAULT_ROOT_STYLES,
  id: ROOT_ELEMENT_ID,
  type: 'rectangle',
  parentId: null,
  childIds: [],
  widthMode: 'fixed',
  heightMode: 'fixed',
  x: 0,
  y: 0,
  customProperties: {},
});

/**
 * Default fill color for any rectangle created via the canvas tool. We
 * deliberately override `DEFAULT_RECT_STYLES.backgroundColor` (transparent)
 * here because a transparent rect on the white page frame is invisible —
 * the user just sees their click do nothing. Light grey is visible and
 * still neutral enough that the user can recolor it from the panel.
 */
export const NEW_RECT_BACKGROUND = '#e5e5e5';

export const makeRectangle = (input: NewRectInput, id: string): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id,
  type: 'rectangle',
  parentId: input.parentId,
  childIds: [],
  x: input.x,
  y: input.y,
  widthValue: input.width,
  heightValue: input.height,
  backgroundColor: NEW_RECT_BACKGROUND,
  customProperties: {},
});

export const TEXT_DEFAULT_WIDTH = 120;
export const TEXT_DEFAULT_HEIGHT = 24;

export const makeText = (
  input: NewTextInput,
  id: string,
  fontFamily: string
): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id,
  type: 'text',
  parentId: input.parentId,
  childIds: [],
  x: input.x,
  y: input.y,
  // Text elements default to "hug" sizing on both axes so the box
  // grows / shrinks with the text content. Changing the font size
  // from the panel reflows the box automatically — no clipped
  // descenders or trapped whitespace. The numeric fallbacks stay
  // around so switching to a fixed mode from the panel has a
  // sensible starting value rather than 0.
  widthMode: 'fit-content',
  widthValue: TEXT_DEFAULT_WIDTH,
  heightMode: 'fit-content',
  heightValue: TEXT_DEFAULT_HEIGHT,
  customProperties: {},
  text: input.text ?? 'Text',
  fontFamily,
  fontSize: '14px',
  fontWeight: 400,
  color: '#222222',
  textAlign: 'left',
});

/**
 * Pick the default `font-family` for a freshly-created text element.
 * Prefers the project's `--font-sans` token (so new text inherits the
 * project's chosen default font), falling back to the literal system
 * font stack when the token isn't declared. Setting an explicit value
 * — rather than relying on body-level inheritance — makes the
 * Typography section reflect "Sans" as the current font, gives the
 * user a clear surface to override per-element, and keeps the
 * generated CSS self-documenting.
 */
export const defaultTextFontFamily = (themeTokens: ReadonlyArray<ThemeToken>): string => {
  const fontSans = themeTokens.find((t) => t.name === '--font-sans');
  if (fontSans) return 'var(--font-sans)';
  return DEFAULT_BODY_FONT_FAMILY;
};

export const makeImage = (input: NewImageInput, id: string): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id,
  type: 'image',
  parentId: input.parentId,
  childIds: [],
  x: input.x,
  y: input.y,
  widthValue: input.width,
  heightValue: input.height,
  customProperties: {},
  src: input.src,
  alt: input.alt ?? '',
});

/**
 * Inline `<svg>` element from a sanitized/normalized source. Image-family
 * type with the `svg` tag override; `svgSource` is the (already-prepared)
 * inner markup. see docs/plans/svg-improvements-plan.md
 */
export const makeSvg = (input: NewSvgInput, id: string): ScampElement => {
  // SVG attributes emitted on the regenerated `<svg>` wrapper. `viewBox`
  // makes the shapes scale to the element box; the asset path (imported,
  // file-backed SVGs) round-trips for the reload watcher.
  const attributes: Record<string, string> = {};
  if (input.viewBox !== undefined) attributes['viewBox'] = input.viewBox;
  if (input.src !== undefined) attributes[SVG_SRC_ATTR] = input.src;
  return {
    ...DEFAULT_RECT_STYLES,
    id,
    type: 'image',
    tag: 'svg',
    parentId: input.parentId,
    childIds: [],
    x: input.x,
    y: input.y,
    widthValue: input.width,
    heightValue: input.height,
    customProperties: {},
    svgSource: input.svgSource,
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    ...(input.fill !== undefined ? { fill: input.fill } : {}),
    ...(input.stroke !== undefined ? { stroke: input.stroke } : {}),
    ...(input.strokeWidth !== undefined ? { strokeWidth: input.strokeWidth } : {}),
  };
};

/**
 * Default visual treatment for an input drawn on the canvas — a
 * subtle outlined box so the user can see what they drew. Users are
 * free to re-style from the panel.
 */
export const NEW_INPUT_BACKGROUND = '#ffffff';
export const NEW_INPUT_BORDER_COLOR = '#cbd5e1';

export const makeInput = (input: NewInputInput, id: string): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id,
  type: 'input',
  parentId: input.parentId,
  childIds: [],
  x: input.x,
  y: input.y,
  widthValue: input.width,
  heightValue: input.height,
  backgroundColor: NEW_INPUT_BACKGROUND,
  borderWidth: [1, 1, 1, 1],
  borderStyle: 'solid',
  borderColor: NEW_INPUT_BORDER_COLOR,
  borderRadius: [4, 4, 4, 4],
  customProperties: {},
  attributes: { type: 'text' },
});

export const makeComponentInstance = (
  input: NewComponentInstanceInput,
  id: string
): ScampElement => ({
  ...DEFAULT_RECT_STYLES,
  id,
  type: 'component-instance',
  parentId: input.parentId,
  childIds: [],
  // The instance has no intrinsic size on the page tree — the
  // rendered component's own root sets the box. Use `auto` on
  // both axes so the generator emits no width/height, matching
  // what `parseCode` produces for instances without a class block.
  widthMode: 'auto',
  heightMode: 'auto',
  x: input.x,
  y: input.y,
  customProperties: {},
  componentName: input.componentName,
  // Use the canvas id as the hex tail of the `inst_*` identifier
  // so `data-scamp-instance-id` is human-readable and easy to
  // correlate with the canvas selection.
  instanceId: `inst_${id}`,
  propOverrides: {},
});

/**
 * The tag a new element should take from where it was drawn, so the
 * output semantic is right without the user opening the Element
 * section.
 *
 * Inside a `<ul>` or `<ol>` that is `<li>`. Inside a table it walks the
 * family down: a child of the table is a `<tbody>`, a child of a
 * section is a `<tr>`, and a child of a row is a `<td>`.
 *
 * A child of `<table>` deliberately becomes a SECTION rather than a
 * row. A `<tr>` written directly inside a `<table>` is reparented by
 * the HTML parser into a `<tbody>` it inserts itself, which carries no
 * Scamp class — and the derived subgrid rule then reaches the row
 * through a tag selector, but nothing the user set on it does. Landing
 * on the shape the parser would have built avoids the whole question.
 * see docs/plans/tables-plan.md
 */
const CHILD_TAG_FOR_CONTAINER: Readonly<Record<string, string>> = {
  ul: 'li',
  ol: 'li',
  table: 'tbody',
  thead: 'tr',
  tbody: 'tr',
  tfoot: 'tr',
  tr: 'td',
};

/**
 * Where a text element wants a different answer from a container.
 * Words directly inside a table are its caption; a `<tbody>` holding
 * text is not a thing. A section has no text child at all, so nothing
 * is defaulted there and the element stays a `<p>` for the user to
 * place.
 */
const CHILD_TAG_FOR_TEXT: Readonly<Record<string, string | undefined>> = {
  table: 'caption',
  thead: undefined,
  tbody: undefined,
  tfoot: undefined,
};

export const tagForListChildContext = (
  parent: ScampElement | undefined,
  type: 'rectangle' | 'text' = 'rectangle'
): string | undefined => {
  if (!parent || parent.tag === undefined) return undefined;
  if (type === 'text' && parent.tag in CHILD_TAG_FOR_TEXT) {
    return CHILD_TAG_FOR_TEXT[parent.tag];
  }
  return CHILD_TAG_FOR_CONTAINER[parent.tag];
};
