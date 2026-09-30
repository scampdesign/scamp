/**
 * Static HTML export — the model-side sibling of `generateCode`.
 *
 * `generateCode` emits TSX for the running Next project; this emits plain
 * HTML for a self-contained folder the user can open or upload. Both walk
 * the same element model and share `classNameFor` / `tagFor` / `escapeHtml`,
 * so the class names in the markup can't drift from the ones in the CSS.
 *
 * The defining difference is component instances. TSX emits a reference
 * (`<SidebarRow label="home" />`) and lets React resolve it; HTML has no
 * such indirection, so every instance is expanded in place into ordinary
 * elements, with its classes prefixed by the instance id. That prefix is
 * what keeps two instances of one component — and a component root vs. a
 * page root, which are both `.root` — from colliding once the stylesheets
 * are flattened into one document.
 *
 * see docs/plans/html-export-plan.md
 */

import { svgSourceToHtml } from './svgJsx';
import { type ScampElement } from './element';
import { sizeDeclarationLines } from './generateCode/declarations';
import { classNameFor, escapeHtml, tagFor } from './generateCode/internal';

/**
 * Mirrors `ComponentTree` in the canvas store. Redeclared here because
 * `lib/` must not import from `store/` — same approach as
 * `componentUsage.ts`.
 */
export type ComponentTree = {
  elements: Record<string, ScampElement>;
  rootId: string;
};

/**
 * Joins an instance id to the classes of the component it expands.
 * Double underscore because a single one is already common inside
 * generated class names (`hero_card_a1b2`).
 */
export const INSTANCE_CLASS_SEPARATOR = '__';

/** The class prefix applied to everything inside one expanded instance. */
export const instanceClassPrefix = (
  outerPrefix: string,
  instanceClass: string
): string => `${outerPrefix}${instanceClass}${INSTANCE_CLASS_SEPARATOR}`;

export type HtmlExportOptions = {
  /** Every component in the project, keyed by PascalCase name. */
  componentTrees: Record<string, ComponentTree>;
  /** Map a route href (`/about`) to its exported path. Identity if absent. */
  rewriteHref?: (href: string) => string;
  /** Map an asset URL (`/assets/x.webp`) to a page-relative path. */
  rewriteAssetUrl?: (url: string) => string;
};

/**
 * One rendering frame. Slot content is the reason this exists rather than
 * a handful of parameters: content the page places into a component's slot
 * belongs to the PAGE — its own element map, its own class prefix, its own
 * props — so a slot carries the scope it came from and rendering switches
 * back to it.
 */
type Scope = {
  elements: Record<string, ScampElement>;
  /** Prepended to every class name emitted in this scope. `''` on a page. */
  classPrefix: string;
  /** Resolved prop values for the enclosing instance. Empty on a page. */
  propValues: Record<string, string>;
  /** Slot name → the content filling it, in the scope that owns it. */
  slots: ReadonlyMap<string, { scope: Scope; ids: ReadonlyArray<string> }>;
  /** Components resolve `{prop}` / `{slot}` refs; pages have neither. */
  isComponent: boolean;
};

const indent = (level: number): string => '  '.repeat(level);

/** Editor bookkeeping — not page content, so it's stripped on export. */
const isEditorAttribute = (name: string): boolean =>
  name.startsWith('data-scamp-');

/**
 * HTML5 void elements. Matches the set in `generateCode/tsx.ts`; `select`
 * and `textarea` are deliberately absent — they're empty-able but not void.
 */
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/** Attributes whose value is a URL into the project's assets. */
const ASSET_ATTRIBUTES = new Set(['src', 'poster', 'data']);

const formatAttribute = (name: string, value: string): string =>
  value === '' ? name : `${name}="${escapeHtml(value)}"`;

const renderSelectOptions = (
  options: ReadonlyArray<{ value: string; label: string; selected?: boolean }>,
  level: number
): string =>
  options
    .map((opt) => {
      const attrs = [`value="${escapeHtml(opt.value)}"`];
      if (opt.selected) attrs.push('selected');
      return `${indent(level)}<option ${attrs.join(' ')}>${escapeHtml(opt.label)}</option>`;
    })
    .join('\n');

/**
 * Group an instance's children by the slot they fill. A child with no
 * explicit `slotName` fills the default slot, which components declare as
 * `children` — the same rule `generateTsx` applies when it decides between
 * JSX children and a `slotName={…}` prop.
 */
const groupSlotContent = (
  instance: ScampElement,
  scope: Scope
): Map<string, { scope: Scope; ids: string[] }> => {
  const slots = new Map<string, { scope: Scope; ids: string[] }>();
  for (const childId of instance.childIds) {
    const child = scope.elements[childId];
    if (!child) continue;
    const name =
      typeof child.slotName === 'string' && child.slotName.length > 0
        ? child.slotName
        : 'children';
    const entry = slots.get(name) ?? { scope, ids: [] };
    entry.ids.push(childId);
    slots.set(name, entry);
  }
  return slots;
};

/**
 * Expand a component instance into the elements it stands for.
 *
 * `activeComponents` is the chain of components currently being expanded.
 * A component that reaches itself through that chain would recurse until
 * the stack gave out, so it stops with a comment instead. The canvas
 * forbids building such a cycle (`wouldCreateComponentCycle`), but an
 * agent editing files directly is not bound by that.
 */
const renderInstance = (
  el: ScampElement,
  scope: Scope,
  level: number,
  options: HtmlExportOptions,
  activeComponents: ReadonlySet<string>
): string => {
  const name = el.componentName ?? '';
  const tree = options.componentTrees[name];
  if (el.missingComponent === true || !tree) {
    return `${indent(level)}<!-- Scamp: missing component ${escapeHtml(name || 'Unknown')} -->`;
  }
  if (activeComponents.has(name)) {
    return `${indent(level)}<!-- Scamp: component cycle at ${escapeHtml(name)} -->`;
  }
  const root = tree.elements[tree.rootId];
  if (!root) {
    return `${indent(level)}<!-- Scamp: empty component ${escapeHtml(name)} -->`;
  }

  const instanceClass = `${scope.classPrefix}${classNameFor(el)}`;
  const childScope: Scope = {
    elements: tree.elements,
    classPrefix: instanceClassPrefix(scope.classPrefix, classNameFor(el)),
    propValues: el.propOverrides ?? {},
    slots: groupSlotContent(el, scope),
    isComponent: true,
  };

  // The page sizes an instance through the component's `className` prop, so
  // in the app the component root renders with both its own `.root` and the
  // page's `.inst_x`. Mirroring that here — same two classes, same order —
  // keeps the cascade identical and lets the page's rule ship unchanged.
  // Emitted only when the instance actually has a size, matching the
  // condition `generateTsx` and `elementCssChunks` both use.
  const extraClass =
    sizeDeclarationLines(el).length > 0 ? instanceClass : null;

  return renderElement(
    root,
    childScope,
    level,
    options,
    extraClass,
    activeComponents,
    name
  );
};

/**
 * Render one element and its descendants.
 *
 * `extraClass` is the page-owned class an expanded component root also
 * carries; null everywhere else.
 */
const renderElement = (
  el: ScampElement,
  scope: Scope,
  level: number,
  options: HtmlExportOptions,
  extraClass: string | null,
  activeComponents: ReadonlySet<string>,
  enteringComponent?: string
): string => {
  const active =
    enteringComponent === undefined
      ? activeComponents
      : new Set([...activeComponents, enteringComponent]);

  if (el.type === 'component-instance') {
    return renderInstance(el, scope, level, options, active);
  }

  const tag = tagFor(el);
  const classes = [`${scope.classPrefix}${classNameFor(el)}`];
  if (extraClass !== null) classes.push(extraClass);

  const attrs = [`class="${escapeHtml(classes.join(' '))}"`];
  if (el.type === 'image' && tag === 'img') {
    attrs.push(`src="${escapeHtml(rewriteAsset(el.src ?? '', options))}"`);
    attrs.push(`alt="${escapeHtml(el.alt ?? '')}"`);
  }
  if (el.attributes) {
    for (const [name, value] of Object.entries(el.attributes)) {
      if (isEditorAttribute(name)) continue;
      attrs.push(formatAttribute(name, rewriteAttributeValue(name, value, options)));
    }
  }

  const open = `<${tag} ${attrs.join(' ')}`;

  if (VOID_TAGS.has(tag)) {
    return `${indent(level)}${open} />`;
  }

  if (tag === 'svg') {
    // `svgSource` is stored as JSX, because it is emitted into a .tsx
    // file. This is an HTML document, where `style={{…}}` is an
    // attribute whose value is `{{` and `stopColor` lowercases to
    // nothing — so it is converted back.
    // see docs/notes/import-parity-log.md
    const source = svgSourceToHtml(el.svgSource ?? '');
    return source.length === 0
      ? `${indent(level)}${open}></${tag}>`
      : `${indent(level)}${open}>${source}</${tag}>`;
  }

  if (tag === 'select') {
    const options_ = el.selectOptions ?? [];
    return options_.length === 0
      ? `${indent(level)}${open}></${tag}>`
      : `${indent(level)}${open}>\n${renderSelectOptions(options_, level + 1)}\n${indent(level)}</${tag}>`;
  }

  // A slot rectangle renders the page content placed into it, in the scope
  // that content belongs to. An unfilled slot renders as an empty element,
  // which is what React does with an undefined `{children}`.
  const slotName =
    scope.isComponent && el.slot !== undefined && el.slot.length > 0
      ? el.slot
      : null;
  if (slotName !== null) {
    const filled = scope.slots.get(slotName);
    if (!filled || filled.ids.length === 0) {
      return `${indent(level)}${open}></${tag}>`;
    }
    const inner = filled.ids
      .map((id) => {
        const child = filled.scope.elements[id];
        return child
          ? renderElement(child, filled.scope, level + 1, options, null, active)
          : '';
      })
      .filter((line) => line.length > 0)
      .join('\n');
    return `${indent(level)}${open}>\n${inner}\n${indent(level)}</${tag}>`;
  }

  const text = resolveText(el, scope);
  const hasText = text !== null && text.length > 0;
  const hasChildren = el.childIds.length > 0;
  const fragmentLines = renderFragments(el, level);
  const hasFragments = fragmentLines.size > 0;

  if (!hasText && !hasChildren && !hasFragments) {
    return `${indent(level)}${open}></${tag}>`;
  }

  if (hasText && !hasChildren && !hasFragments) {
    return `${indent(level)}${open}>${escapeHtml(text ?? '')}</${tag}>`;
  }

  const segments: string[] = [];
  if (hasText) segments.push(`${indent(level + 1)}${escapeHtml(text ?? '')}`);
  const before = fragmentLines.get(-1);
  if (before !== undefined) segments.push(before);
  el.childIds.forEach((childId, i) => {
    const child = scope.elements[childId];
    if (child) {
      const line = renderElement(child, scope, level + 1, options, null, active);
      if (line.length > 0) segments.push(line);
    }
    const after = fragmentLines.get(i);
    if (after !== undefined) segments.push(after);
  });

  return `${indent(level)}${open}>\n${segments.join('\n')}\n${indent(level)}</${tag}>`;
};

/**
 * The text a text element shows. Inside a component, a `prop`-bound element
 * shows the instance's override, falling back to the value stored on the
 * element — which is exactly the default `generateTsx` writes into the
 * function signature. On a page, the stored text is all there is.
 */
const resolveText = (el: ScampElement, scope: Scope): string | null => {
  if (el.type !== 'text') return null;
  if (scope.isComponent && el.prop !== undefined && el.prop.length > 0) {
    return scope.propValues[el.prop] ?? el.text ?? '';
  }
  return el.text ?? '';
};

/**
 * Convert one captured text fragment to what JSX would actually render.
 *
 * The parser stores the raw source between element children, so a text
 * fragment can contain JSX comments and the indentation around them. JSX
 * renders neither: a comment produces nothing, and whitespace spanning a
 * newline is stripped. Emitting the source verbatim put the section-divider
 * comments from an agent-written page on the exported page as visible text.
 *
 * Returns null when the fragment renders to nothing.
 */
export const jsxTextToHtml = (raw: string): string | null => {
  // Comments first — what's left is the text JSX would keep.
  const withoutComments = raw.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
  if (withoutComments.trim().length === 0) return null;
  // JSX drops whitespace that spans a newline and collapses the rest.
  const collapsed = withoutComments
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return collapsed.length === 0 ? null : collapsed;
};

/**
 * Non-Scamp content captured between element children, keyed by the child
 * index it follows.
 *
 * Text fragments go through JSX's own whitespace and comment rules before
 * being escaped. JSX fragments are raw source: a markup subtree is valid
 * HTML and passes through, but a brace expression (`{count}`) is React that
 * a browser would render as literal braces, so it's dropped rather than
 * shown as garbage.
 */
const renderFragments = (el: ScampElement, level: number): Map<number, string> => {
  const byIndex = new Map<number, string[]>();
  for (const fragment of el.inlineFragments) {
    let rendered: string | null;
    if (fragment.kind === 'text') {
      const text = jsxTextToHtml(fragment.value);
      rendered = text === null ? null : escapeHtml(text);
    } else {
      const source = fragment.source.trim();
      rendered = source.startsWith('{') ? null : fragment.source;
    }
    if (rendered === null || rendered.length === 0) continue;
    const list = byIndex.get(fragment.afterChildIndex) ?? [];
    list.push(`${indent(level + 1)}${rendered}`);
    byIndex.set(fragment.afterChildIndex, list);
  }
  const out = new Map<number, string>();
  for (const [idx, lines] of byIndex) out.set(idx, lines.join('\n'));
  return out;
};

const rewriteAsset = (url: string, options: HtmlExportOptions): string =>
  options.rewriteAssetUrl ? options.rewriteAssetUrl(url) : url;

const rewriteAttributeValue = (
  name: string,
  value: string,
  options: HtmlExportOptions
): string => {
  if (name === 'href') {
    return options.rewriteHref ? options.rewriteHref(value) : value;
  }
  if (ASSET_ATTRIBUTES.has(name)) return rewriteAsset(value, options);
  return value;
};

/**
 * Render a page's element tree as HTML. `level` starts at 2 so the markup
 * sits correctly inside the `<body>` produced by `renderDocument`.
 */
export const generateHtml = (
  elements: Record<string, ScampElement>,
  rootId: string,
  options: HtmlExportOptions
): string => {
  const root = elements[rootId];
  if (!root) return '';
  const scope: Scope = {
    elements,
    classPrefix: '',
    propValues: {},
    slots: new Map(),
    isComponent: false,
  };
  return renderElement(root, scope, 2, options, null, new Set<string>());
};

/** One expanded instance: which component, and under which class prefix. */
export type ExpandedInstance = {
  prefix: string;
  componentName: string;
};

/**
 * The instances `generateHtml` would expand for this page, in document
 * order — each one needing a prefixed copy of its component's CSS.
 *
 * Deliberately next to the renderer and sharing `instanceClassPrefix` with
 * it: if the two disagreed about a prefix, the markup would reference class
 * names the stylesheet never defines, and the page would silently lose its
 * styling. `test/generateHtml.test.ts` asserts they agree.
 */
export const collectExpandedInstances = (
  elements: Record<string, ScampElement>,
  rootId: string,
  componentTrees: Record<string, ComponentTree>
): ExpandedInstance[] => {
  const out: ExpandedInstance[] = [];
  const walk = (
    map: Record<string, ScampElement>,
    id: string,
    prefix: string,
    active: ReadonlySet<string>
  ): void => {
    const el = map[id];
    if (!el) return;
    if (el.type === 'component-instance') {
      const name = el.componentName ?? '';
      const tree = componentTrees[name];
      if (tree && el.missingComponent !== true && !active.has(name)) {
        const childPrefix = instanceClassPrefix(prefix, classNameFor(el));
        out.push({ prefix: childPrefix, componentName: name });
        walk(
          tree.elements,
          tree.rootId,
          childPrefix,
          new Set([...active, name])
        );
      }
      // An instance's own children are the page's slot content, which keeps
      // the outer prefix — its rules are already in the page stylesheet.
    }
    for (const childId of el.childIds) walk(map, childId, prefix, active);
  };
  walk(elements, rootId, '', new Set<string>());
  return out;
};

export type DocumentOptions = {
  /** `<title>`; the project name, matching `layout.tsx`'s metadata. */
  title: string;
  /** Page-relative hrefs for the stylesheets, in link order. */
  stylesheets: ReadonlyArray<string>;
  lang?: string;
};

/**
 * Wrap page markup in the document shell.
 *
 * The `<body>` inline style reproduces the project's own `app/layout.tsx`
 * (`margin: 0; min-height: 100vh`) rather than inventing a reset, so an
 * exported page and Preview lay out identically.
 */
export const renderDocument = (
  body: string,
  { title, stylesheets, lang = 'en' }: DocumentOptions
): string => {
  const links = stylesheets
    .map((href) => `    <link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join('\n');
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
${links}
  </head>
  <body style="margin: 0; min-height: 100vh">
${body}
  </body>
</html>
`;
};
