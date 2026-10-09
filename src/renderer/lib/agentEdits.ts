// @lib/agentEdits.ts — the Scamp Agent's edits, as pure functions.
//
// Every edit goes through the same code Scamp uses for a file: styles are
// written into the element's class rule in the generated stylesheet and
// parsed back, exactly as if a person had typed them in the CSS tab. So an
// agent edit can't produce a model that wouldn't survive a save and reload,
// and a value the panel can't type is caught and reported, not guessed at.
// see docs/plans/builtin-agent-plan.md

import postcss from 'postcss';

import { DESKTOP_BREAKPOINT_ID, type Breakpoint, type ThemeToken } from '@shared/types';
import { validateComponentName } from '@shared/componentName';
import { patchClassBlock } from '@shared/patchClass';

import { ROOT_ELEMENT_ID, type ScampElement } from './element';
import {
  generateElementId,
  groupSiblings,
  removeSubtree,
  reorderElementPure,
  slugifyName,
} from './element/tree';
import { TAG_OPTIONS } from './elementTags';
import { classNameFor, generateCode } from './generateCode';
import { parseCode } from './parseCode';
import { lintView } from './viewLint';

export type AgentEditContext = {
  elements: Record<string, ScampElement>;
  rootId: string;
  breakpoints: ReadonlyArray<Breakpoint>;
  /** A component's root is sized differently from a page's. */
  isComponent: boolean;
};

export type AgentEditResult =
  | {
      ok: true;
      elements: Record<string, ScampElement>;
      /** One line for the panel and the model: what changed. */
      summary: string;
      touched: string[];
      /** Anything the model should know about the result. */
      notes: string[];
    }
  | { ok: false; error: string };

const fail = (error: string): AgentEditResult => ({ ok: false, error });

/** Find an element by its Scamp id or by its class name. */
export const resolveElement = (
  ctx: AgentEditContext,
  ref: unknown
): ScampElement | null => {
  if (typeof ref !== 'string' || ref.length === 0) return null;
  const byId = ctx.elements[ref];
  if (byId !== undefined) return byId;
  if (ref === 'root') return ctx.elements[ctx.rootId] ?? null;
  return Object.values(ctx.elements).find((el) => classNameFor(el) === ref) ?? null;
};

const notFound = (ref: unknown): string =>
  `No element "${String(ref)}". Use an id or class name from scamp_get_element_tree.`;

type Declaration = { prop: string; value: string; important: boolean };

/** Declarations from a CSS fragment like `display: flex; gap: 12px`. */
export const parseDeclarationList = (css: string): Declaration[] | string => {
  let root: postcss.Root;
  try {
    root = postcss.parse(`.x{${css}}`);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  const rule = root.first;
  if (rule === undefined || rule.type !== 'rule' || root.nodes.length !== 1) {
    return 'Expected declarations only, like "display: flex; gap: 12px" — no selectors or braces.';
  }
  const out: Declaration[] = [];
  for (const node of rule.nodes) {
    if (node.type !== 'decl') {
      return 'Expected declarations only, like "display: flex; gap: 12px" — no nested rules.';
    }
    out.push({ prop: node.prop.trim().toLowerCase(), value: node.value.trim(), important: node.important === true });
  }
  return out;
};

const formatDeclaration = (d: Declaration): string =>
  `${d.prop}: ${d.value}${d.important ? ' !important' : ''};`;

/** The class rule's declarations as the stylesheet has them. */
const ruleDeclarations = (
  css: string,
  className: string,
  maxWidth: number | null
): Declaration[] => {
  const root = postcss.parse(css);
  const out: Declaration[] = [];
  const read = (rule: postcss.Rule): void => {
    for (const node of rule.nodes) {
      if (node.type === 'decl') {
        out.push({ prop: node.prop.trim().toLowerCase(), value: node.value.trim(), important: node.important === true });
      }
    }
  };
  for (const node of root.nodes) {
    if (maxWidth === null && node.type === 'rule' && node.selector.trim() === `.${className}`) read(node);
    if (
      maxWidth !== null &&
      node.type === 'atrule' &&
      node.name === 'media' &&
      node.params.replace(/\s+/g, '') === `(max-width:${maxWidth}px)`
    ) {
      for (const inner of node.nodes ?? []) {
        if (inner.type === 'rule' && inner.selector.trim() === `.${className}`) read(inner);
      }
    }
  }
  return out;
};

/** A breakpoint by id or label; null for desktop, the base styles. */
const resolveBreakpoint = (
  ctx: AgentEditContext,
  ref: unknown
): Breakpoint | null | 'unknown' => {
  if (ref === undefined || ref === null || ref === '' || ref === DESKTOP_BREAKPOINT_ID) return null;
  if (typeof ref !== 'string') return 'unknown';
  const wanted = ref.trim().toLowerCase();
  if (wanted === 'desktop') return null;
  return (
    ctx.breakpoints.find((b) => b.id.toLowerCase() === wanted || b.label.toLowerCase() === wanted) ??
    'unknown'
  );
};

/** The stylesheet round trip every style edit takes. */
const roundTrip = (
  ctx: AgentEditContext,
  elements: Record<string, ScampElement>,
  edit: (code: { tsx: string; css: string }) => string
): Record<string, ScampElement> => {
  const code = generateCode({
    elements,
    rootId: ctx.rootId,
    pageName: 'AgentEdit',
    breakpoints: [...ctx.breakpoints],
    isComponent: ctx.isComponent,
  });
  return parseCode(code.tsx, edit(code), {
    breakpoints: [...ctx.breakpoints],
    isComponent: ctx.isComponent,
  }).elements;
};

/** Keep the tree from the store; take only what the parser decided about styles. */
const withIdentity = (parsed: ScampElement, original: ScampElement): ScampElement => ({
  ...parsed,
  id: original.id,
  parentId: original.parentId,
  childIds: original.childIds,
});

/**
 * Set and remove declarations on an element's class rule — at a
 * breakpoint, when one is named.
 */
export const setStyles = (
  ctx: AgentEditContext,
  args: { element: unknown; set?: unknown; remove?: unknown; breakpoint?: unknown }
): AgentEditResult => {
  const el = resolveElement(ctx, args.element);
  if (el === null) return fail(notFound(args.element));
  if (el.type === 'component-instance') {
    return fail('A component instance takes its styles from the component. Edit the component instead.');
  }
  const setCss = typeof args.set === 'string' ? args.set : '';
  const remove = Array.isArray(args.remove)
    ? args.remove.filter((p): p is string => typeof p === 'string').map((p) => p.trim().toLowerCase())
    : [];
  const additions = parseDeclarationList(setCss);
  if (typeof additions === 'string') return fail(`Couldn't read that CSS: ${additions}`);
  if (additions.length === 0 && remove.length === 0) return fail('Nothing to change: pass "set", "remove", or both.');

  const breakpoint = resolveBreakpoint(ctx, args.breakpoint);
  if (breakpoint === 'unknown') {
    const known = ctx.breakpoints.map((b) => b.label).join(', ');
    return fail(`No breakpoint "${String(args.breakpoint)}". This project has: ${known}.`);
  }
  const maxWidth = breakpoint === null ? null : breakpoint.width;
  const className = classNameFor(el);

  let parsedElements: Record<string, ScampElement>;
  try {
    parsedElements = roundTrip(ctx, ctx.elements, (code) => {
      const current = ruleDeclarations(code.css, className, maxWidth);
      const replaced = new Set(additions.map((d) => d.prop));
      const kept = current.filter((d) => !remove.includes(d.prop) && !replaced.has(d.prop));
      const body = [...kept, ...additions].map(formatDeclaration).join('\n');
      return patchClassBlock(code.css, className, body, maxWidth === null ? undefined : { maxWidth });
    });
  } catch (err) {
    return fail(`Scamp couldn't apply that CSS: ${err instanceof Error ? err.message : String(err)}`);
  }
  const parsed = parsedElements[el.id];
  if (parsed === undefined) return fail(`Scamp lost ${className} while applying that CSS.`);
  const next = withIdentity(parsed, el);

  // What rendered but didn't become a typed, panel-editable value.
  const custom =
    breakpoint === null
      ? next.customProperties
      : (next.breakpointOverrides?.[breakpoint.id]?.customProperties ?? {});
  const untyped = additions.filter((d) => d.prop in custom).map((d) => d.prop);
  const notes =
    untyped.length > 0
      ? [
          `These render but the properties panel can't edit them: ${untyped.join(', ')}. ` +
            'That is fine for properties with no panel control; otherwise check the value or use the shorthand.',
        ]
      : [];

  const changes = [
    ...additions.map(formatDeclaration),
    ...remove.map((p) => `removed ${p}`),
  ].join(' ');
  const where = breakpoint === null ? '' : ` at ${breakpoint.label}`;
  return {
    ok: true,
    elements: { ...ctx.elements, [el.id]: next },
    summary: `Updated ${className}${where} — ${changes}`,
    touched: [el.id],
    notes,
  };
};

const freshElementId = (elements: Record<string, ScampElement>): string => {
  for (let i = 0; i < 1000; i += 1) {
    const id = generateElementId();
    if (elements[id] === undefined) return id;
  }
  throw new Error('Could not find a free element id.');
};

const isLayoutParent = (el: ScampElement): boolean => el.display === 'flex' || el.display === 'grid';

/**
 * A new element inside `parent`, styled with `css`. Built by parsing a
 * one-element file, so it starts from what Scamp reads for an element
 * with only those declarations — not from the draw tool's defaults.
 */
export const addElement = (
  ctx: AgentEditContext,
  args: { parent: unknown; tag?: unknown; text?: unknown; css?: unknown; name?: unknown; index?: unknown }
): AgentEditResult => {
  const parent = resolveElement(ctx, args.parent);
  if (parent === null) return fail(notFound(args.parent));
  if (parent.type !== 'rectangle') {
    return fail(`${classNameFor(parent)} can't hold children. Add the element to its container instead.`);
  }
  const text = typeof args.text === 'string' ? args.text : null;
  const isText = text !== null;
  const type = isText ? 'text' : 'rectangle';
  const tag = typeof args.tag === 'string' && args.tag.length > 0 ? args.tag.toLowerCase() : isText ? 'p' : 'div';
  if (!TAG_OPTIONS[type].some((o) => o.value === tag)) {
    const allowed = TAG_OPTIONS[type].map((o) => o.value).join(', ');
    return fail(`<${tag}> isn't available for a ${isText ? 'text element' : 'container'}. Use one of: ${allowed}.`);
  }
  const css = typeof args.css === 'string' ? args.css : '';
  const declarations = parseDeclarationList(css);
  if (typeof declarations === 'string') return fail(`Couldn't read that CSS: ${declarations}`);

  const id = freshElementId(ctx.elements);
  const slug = typeof args.name === 'string' ? slugifyName(args.name) : '';
  const className = `${slug.length > 0 ? slug : isText ? 'text' : 'rect'}_${id}`;
  // Placeholder words: the real text is set on the model below, so it
  // never has to be escaped into JSX here.
  const tsx = `<div data-scamp-id="root" className={styles.root}><${tag} data-scamp-id="${id}" className={styles.${className}}>${isText ? 'x' : ''}</${tag}></div>`;
  const body = declarations.map(formatDeclaration).join('\n');
  const draft = parseCode(tsx, `.${className} {\n${body}\n}`, {
    breakpoints: [...ctx.breakpoints],
    isComponent: false,
  }).elements[id];
  if (draft === undefined) return fail('Scamp couldn’t build that element.');

  const siblings = parent.childIds;
  const index =
    typeof args.index === 'number' && Number.isInteger(args.index)
      ? Math.max(0, Math.min(args.index, siblings.length))
      : siblings.length;
  const childIds = [...siblings.slice(0, index), id, ...siblings.slice(index)];
  const placed: ScampElement = {
    ...draft,
    id,
    parentId: parent.id,
    childIds: [],
    ...(isText ? { text } : {}),
  };
  const inserted = { ...ctx.elements, [id]: placed, [parent.id]: { ...parent, childIds } };

  // Parsed once more in its real place: whether the parent lays out its
  // children decides how a position is read.
  let settled: Record<string, ScampElement>;
  try {
    settled = roundTrip({ ...ctx, elements: inserted }, inserted, (code) => code.css);
  } catch (err) {
    return fail(`Scamp couldn't place that element: ${err instanceof Error ? err.message : String(err)}`);
  }
  const final = settled[id];
  if (final === undefined) return fail('Scamp lost the new element while placing it.');

  const notes = isLayoutParent(parent)
    ? []
    : [
        `${classNameFor(parent)} isn't a flex or grid container, so the new element is placed absolutely at its top-left. ` +
          'Give the parent a layout (display: flex) to flow its children.',
      ];
  return {
    ok: true,
    elements: { ...inserted, [id]: withIdentity(final, placed) },
    summary: `Added <${tag}> ${className} to ${classNameFor(parent)}`,
    touched: [id, parent.id],
    notes,
  };
};

/** Replace a text element's words. */
export const setText = (ctx: AgentEditContext, args: { element: unknown; text: unknown }): AgentEditResult => {
  const el = resolveElement(ctx, args.element);
  if (el === null) return fail(notFound(args.element));
  if (typeof args.text !== 'string') return fail('"text" must be a string.');
  if (el.type !== 'text') {
    return fail(`${classNameFor(el)} is a container, not text. Set the text of the text element inside it.`);
  }
  // New words invalidate styled runs: their offsets describe text that no
  // longer exists. The same rule as typing on the canvas.
  const { runs: _dropped, ...rest } = el;
  return {
    ok: true,
    elements: { ...ctx.elements, [el.id]: { ...rest, text: args.text } },
    summary: `Changed the text of ${classNameFor(el)}`,
    touched: [el.id],
    notes: el.runs !== undefined ? ['Its styled runs (bold or colored words) were dropped with the old text.'] : [],
  };
};

/** Change the HTML tag, within what the element's type allows. */
export const setTag = (ctx: AgentEditContext, args: { element: unknown; tag: unknown }): AgentEditResult => {
  const el = resolveElement(ctx, args.element);
  if (el === null) return fail(notFound(args.element));
  if (el.id === ctx.rootId) return fail('The root’s tag is fixed.');
  if (typeof args.tag !== 'string' || args.tag.length === 0) return fail('"tag" must be a tag name.');
  const tag = args.tag.toLowerCase();
  const options = TAG_OPTIONS[el.type];
  if (options === undefined || !options.some((o) => o.value === tag)) {
    const allowed = (options ?? []).map((o) => o.value).join(', ');
    return fail(`<${tag}> isn't available for ${classNameFor(el)}. Use one of: ${allowed}.`);
  }
  return {
    ok: true,
    elements: { ...ctx.elements, [el.id]: { ...el, tag } },
    summary: `Changed ${classNameFor(el)} to <${tag}>`,
    touched: [el.id],
    notes: [],
  };
};

/** Attributes Scamp writes itself, or that would not compile. */
const RESERVED_ATTRIBUTE = /^(classname|class|style|key|ref|data-scamp-.*|dangerouslysetinnerhtml|on[a-z].*)$/i;

/** Set or remove attributes. A null value removes one. */
export const setAttributes = (
  ctx: AgentEditContext,
  args: { element: unknown; attributes: unknown }
): AgentEditResult => {
  const el = resolveElement(ctx, args.element);
  if (el === null) return fail(notFound(args.element));
  const attrs = args.attributes;
  if (attrs === null || typeof attrs !== 'object' || Array.isArray(attrs)) {
    return fail('"attributes" must be an object of name → value (null removes one).');
  }
  const next: Record<string, string> = { ...(el.attributes ?? {}) };
  const changed: string[] = [];
  for (const [name, value] of Object.entries(attrs)) {
    if (RESERVED_ATTRIBUTE.test(name)) {
      return fail(`"${name}" is managed by Scamp or can't be set as text. Event handlers belong in code, not the design.`);
    }
    if (value === null) {
      delete next[name];
      changed.push(`removed ${name}`);
    } else if (typeof value === 'string') {
      next[name] = value;
      changed.push(`${name}="${value}"`);
    } else {
      return fail(`The value of "${name}" must be a string, or null to remove it.`);
    }
  }
  return {
    ok: true,
    elements: { ...ctx.elements, [el.id]: { ...el, attributes: next } },
    summary: `Updated ${classNameFor(el)} — ${changed.join(', ')}`,
    touched: [el.id],
    notes: [],
  };
};

/** Move an element to another parent, or to another position in its own. */
export const moveElement = (
  ctx: AgentEditContext,
  args: { element: unknown; parent: unknown; index?: unknown }
): AgentEditResult => {
  const el = resolveElement(ctx, args.element);
  if (el === null) return fail(notFound(args.element));
  const parent = resolveElement(ctx, args.parent);
  if (parent === null) return fail(notFound(args.parent));
  if (parent.type !== 'rectangle') return fail(`${classNameFor(parent)} can't hold children.`);
  const index =
    typeof args.index === 'number' && Number.isInteger(args.index) ? Math.max(0, args.index) : parent.childIds.length;
  const next = reorderElementPure(ctx.elements, el.id, parent.id, index);
  if (next === null) {
    return fail(`Can't move ${classNameFor(el)} there — it would move the root, or put an element inside itself.`);
  }
  return {
    ok: true,
    elements: next,
    summary: `Moved ${classNameFor(el)} into ${classNameFor(parent)}`,
    touched: [el.id, parent.id, ...(el.parentId !== null ? [el.parentId] : [])],
    notes: [],
  };
};

/** Wrap sibling elements in a new container, optionally styled. */
export const wrapElements = (
  ctx: AgentEditContext,
  args: { elements: unknown; tag?: unknown; css?: unknown; name?: unknown }
): AgentEditResult => {
  if (!Array.isArray(args.elements) || args.elements.length === 0) {
    return fail('"elements" must list the sibling elements to wrap.');
  }
  const resolved = args.elements.map((ref) => resolveElement(ctx, ref));
  const missing = args.elements.find((_ref, i) => resolved[i] === null);
  if (missing !== undefined) return fail(notFound(missing));
  const ids = resolved.flatMap((el) => (el === null ? [] : [el.id]));
  if (ids.includes(ROOT_ELEMENT_ID)) return fail('The root can’t be wrapped.');

  const groupId = freshElementId(ctx.elements);
  const grouped = groupSiblings(ctx.elements, ids, groupId);
  if (grouped === null) return fail('Those elements must all be siblings — children of the same parent.');

  let elements = grouped.elements;
  const group = elements[groupId];
  if (group === undefined) return fail('Scamp lost the new container.');
  const slug = typeof args.name === 'string' ? slugifyName(args.name) : '';
  elements = { ...elements, [groupId]: { ...group, ...(slug.length > 0 ? { name: slug } : {}) } };

  const notes: string[] = [];
  if (typeof args.tag === 'string' && args.tag.length > 0) {
    const tagged = setTag({ ...ctx, elements }, { element: groupId, tag: args.tag });
    if (!tagged.ok) return tagged;
    elements = tagged.elements;
  }
  if (typeof args.css === 'string' && args.css.trim().length > 0) {
    const styled = setStyles({ ...ctx, elements }, { element: groupId, set: args.css });
    if (!styled.ok) return styled;
    elements = styled.elements;
    notes.push(...styled.notes);
  }
  const wrapper = elements[groupId];
  return {
    ok: true,
    elements,
    summary: `Wrapped ${ids.length} element${ids.length === 1 ? '' : 's'} in ${wrapper ? classNameFor(wrapper) : groupId}`,
    touched: [groupId, ...ids],
    notes,
  };
};

/** Remove an element and everything inside it. The harness confirms first. */
export const deleteElement = (ctx: AgentEditContext, args: { element: unknown }): AgentEditResult => {
  const el = resolveElement(ctx, args.element);
  if (el === null) return fail(notFound(args.element));
  const removed = removeSubtree(ctx.elements, el.id);
  if (removed === null) return fail('The root can’t be deleted.');
  const inside = removed.removed.size - 1;
  return {
    ok: true,
    elements: removed.elements,
    summary: `Deleted ${classNameFor(el)}${inside > 0 ? ` and ${inside} element${inside === 1 ? '' : 's'} inside it` : ''}`,
    touched: [el.id, ...(el.parentId !== null ? [el.parentId] : [])],
    notes: [],
  };
};

const TOKEN_NAME = /^--[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * Add or change base theme tokens. Pure: the caller reads `theme.css`,
 * merges with this, and writes it back. A value can't carry a `;`, a brace
 * or a newline — it lands inside a declaration, and those would end it.
 */
export const mergeThemeTokens = (
  current: ReadonlyArray<ThemeToken>,
  updates: unknown
): { tokens: ThemeToken[]; added: string[]; changed: string[] } | string => {
  if (updates === null || typeof updates !== 'object' || Array.isArray(updates)) {
    return '"tokens" must be an object of name → value, e.g. { "--color-text": "#1a1a1a" }.';
  }
  const entries = Object.entries(updates);
  if (entries.length === 0) return 'No tokens given.';
  const tokens = current.map((t) => ({ ...t }));
  const added: string[] = [];
  const changed: string[] = [];
  for (const [name, raw] of entries) {
    if (!TOKEN_NAME.test(name)) return `"${name}" isn't a token name. Use --kebab-case, like --color-text.`;
    if (typeof raw !== 'string' || raw.trim().length === 0) return `The value of ${name} must be a non-empty string.`;
    const value = raw.trim();
    if (/[;{}\n]/.test(value)) return `The value of ${name} can't contain ; { } or a line break.`;
    const existing = tokens.find((t) => t.name === name);
    if (existing === undefined) {
      tokens.push({ name, value });
      added.push(name);
    } else if (existing.value !== value) {
      existing.value = value;
      changed.push(name);
    }
  }
  return { tokens, added, changed };
};

/**
 * Check a component extraction before any file is written: what to
 * extract, under what name, and which look-alikes become instances of it.
 */
export const planExtraction = (
  ctx: AgentEditContext,
  args: { element: unknown; name: unknown; alsoReplace?: unknown },
  existingComponents: ReadonlyArray<string>
): { id: string; name: string; replaceIds: string[] } | string => {
  const el = resolveElement(ctx, args.element);
  if (el === null) return notFound(args.element);
  if (el.id === ctx.rootId) return 'The root can’t become a component.';
  if (el.type !== 'rectangle') return `${classNameFor(el)} isn't a container. Extract the container around it.`;
  if (typeof args.name !== 'string') return '"name" must be a PascalCase component name, like Card.';
  const validated = validateComponentName(args.name, existingComponents);
  if (!validated.ok) return validated.error;
  // A case-insensitive disk holds Card and card in one folder.
  const lower = validated.value.toLowerCase();
  if (existingComponents.some((c) => c.toLowerCase() === lower)) {
    return `A component named like ${validated.value} already exists.`;
  }
  const refs = Array.isArray(args.alsoReplace) ? args.alsoReplace : [];
  const replaceIds: string[] = [];
  for (const ref of refs) {
    const other = resolveElement(ctx, ref);
    if (other === null) return notFound(ref);
    if (other.id === el.id || other.id === ctx.rootId || other.type !== 'rectangle') {
      return `${String(ref)} can't be replaced with an instance.`;
    }
    replaceIds.push(other.id);
  }
  return { id: el.id, name: validated.value, replaceIds };
};

/**
 * Which container becomes an instance of which existing component. Refuses
 * the root, text, and a component the container sits inside — an instance
 * of itself would never finish rendering.
 */
export const planInstanceSwap = (
  ctx: AgentEditContext,
  args: { element: unknown; component: unknown },
  components: ReadonlyArray<string>,
  editing: string | null
): { id: string; name: string } | string => {
  const el = resolveElement(ctx, args.element);
  if (el === null) return notFound(args.element);
  if (el.id === ctx.rootId) return 'The root can’t become an instance.';
  if (el.type !== 'rectangle') return `${classNameFor(el)} isn't a container.`;
  const wanted = typeof args.component === 'string' ? args.component.trim() : '';
  const name = components.find((c) => c === wanted) ?? components.find((c) => c.toLowerCase() === wanted.toLowerCase());
  if (name === undefined) {
    return `No component named "${wanted}". scamp_list_components lists them${components.length > 0 ? `: ${components.join(', ')}` : ''}.`;
  }
  if (name === editing) return `${name} can’t contain an instance of itself.`;
  return { id: el.id, name };
};

/**
 * What the model is told after an edit: the summary, what it touched, any
 * notes, and Scamp's own check findings on those elements — the same
 * findings the Checks section shows, so the agent can fix what it caused.
 * Shared by the app's responder and the headless eval runner, so the model
 * reads identical feedback in both.
 */
export const editFeedback = (
  result: Extract<AgentEditResult, { ok: true }>,
  rootId: string,
  themeTokenNames: ReadonlyArray<string>
): { summary: string; text: string } => {
  const touched = new Set(result.touched);
  const findings = lintView({ elements: result.elements, rootId, themeTokens: themeTokenNames })
    .filter((f) => f.elementId !== null && touched.has(f.elementId))
    .map((f) => `Check: ${f.className ?? ''} — ${f.message}${f.hint !== undefined ? ` ${f.hint}` : ''}`);
  const ids = result.touched
    .map((id) => result.elements[id])
    .flatMap((el) => (el === undefined ? [] : [`${classNameFor(el)} (id ${el.id})`]));
  return {
    summary: result.summary,
    text: [result.summary, `Touched: ${ids.join(', ')}`, ...result.notes, ...findings].join('\n'),
  };
};

const PROP_NAME = /^[a-z][A-Za-z0-9]*$/;
const RESERVED_PROP_NAMES: ReadonlySet<string> = new Set(['className', 'children', 'key', 'ref', 'style']);

/**
 * Show an element only when a boolean prop is true — the `{flag && …}` a
 * React app writes. The sample on the root decides what the canvas shows.
 * see docs/notes/view-bindings.md
 */
export const setShow = (
  ctx: AgentEditContext,
  args: { element: unknown; flag: unknown; shown?: unknown }
): AgentEditResult => {
  const el = resolveElement(ctx, args.element);
  if (el === null) return fail(notFound(args.element));
  if (el.id === ctx.rootId) return fail('The root always shows. Put the condition on the element inside it.');
  if (typeof args.flag !== 'string') return fail('"flag" must be a string.');
  const root = ctx.elements[ctx.rootId];
  if (root === undefined) return fail('The view has no root.');
  const flag = args.flag.trim();
  if (flag.length === 0) {
    const { showIf: _removed, ...rest } = el;
    return {
      ok: true,
      elements: { ...ctx.elements, [el.id]: rest },
      summary: `${classNameFor(el)} always shows`,
      touched: [el.id],
      notes: [],
    };
  }
  const name = flag.startsWith('!') ? flag.slice(1) : flag;
  if (!PROP_NAME.test(name) || RESERVED_PROP_NAMES.has(name)) {
    return fail(`"${name}" isn't a prop name Scamp can use: camelCase letters and digits, starting with a lowercase letter.`);
  }
  const existing = root.samples?.[name];
  if (Array.isArray(existing)) return fail(`"${name}" is a list. Pick another name for the flag.`);
  const shown = typeof args.shown === 'boolean' ? args.shown : true;
  // The sample is the flag's value; "!flag" shows when it's false.
  const sample = flag.startsWith('!') ? !shown : shown;
  return {
    ok: true,
    elements: {
      ...ctx.elements,
      [el.id]: { ...el, showIf: flag },
      [root.id]: { ...root, samples: { ...(root.samples ?? {}), [name]: sample } },
    },
    summary: `${classNameFor(el)} shows when ${flag}`,
    touched: [el.id],
    notes: shown ? [] : ['It is hidden on the canvas now: its sample is off.'],
  };
};

/** Rewrite a row path's head and field: `item.text2` → `claim.patientName`. */
const renamePath = (path: string, from: string, to: string, fields: Readonly<Record<string, string>>): string => {
  const [head, field, ...rest] = path.split('.');
  if (head !== from || field === undefined) return path;
  return [to, fields[field] ?? field, ...rest].join('.');
};

/**
 * Rename a repeated list — the list prop, its row variable, and row
 * fields — everywhere the view uses them and in its sample rows.
 */
export const renameList = (
  ctx: AgentEditContext,
  args: { list: unknown; to?: unknown; row?: unknown; fields?: unknown }
): AgentEditResult => {
  if (typeof args.list !== 'string') return fail('"list" must be a string.');
  const root = ctx.elements[ctx.rootId];
  const repeated = Object.values(ctx.elements).filter((el) => el.repeat?.over === args.list);
  if (root === undefined || repeated.length === 0) {
    return fail(`No list "${args.list}" here. scamp_get_element_tree shows each repeat's list.`);
  }
  const to = typeof args.to === 'string' && args.to.length > 0 ? args.to : args.list;
  const fields: Record<string, string> =
    args.fields !== null && typeof args.fields === 'object' && !Array.isArray(args.fields)
      ? Object.fromEntries(Object.entries(args.fields as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
      : {};
  for (const name of [to, ...Object.values(fields), ...(typeof args.row === 'string' ? [args.row] : [])]) {
    if (!PROP_NAME.test(name) || RESERVED_PROP_NAMES.has(name)) return fail(`"${name}" isn't a name Scamp can use: camelCase, starting with a lowercase letter.`);
  }
  if (to !== args.list && root.samples?.[to] !== undefined) return fail(`The view already has a prop "${to}".`);
  const rows = root.samples?.[args.list];
  const nextRows = Array.isArray(rows)
    ? rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [fields[k] ?? k, v])))
    : rows;
  const fieldNames = new Set(Array.isArray(rows) ? rows.flatMap((r) => Object.keys(r)) : []);
  const unknownField = Object.keys(fields).find((f) => !fieldNames.has(f));
  if (unknownField !== undefined) return fail(`The rows of "${args.list}" have no field "${unknownField}".`);

  const elements = { ...ctx.elements };
  const touched: string[] = [];
  for (const el of repeated) {
    const as = el.repeat?.as ?? '';
    const row = typeof args.row === 'string' && args.row.length > 0 ? args.row : as;
    const key = el.repeat?.key;
    elements[el.id] = {
      ...el,
      repeat: { over: to, as: row, ...(key !== undefined ? { key: fields[key] ?? key } : {}) },
    };
    touched.push(el.id);
    // Every row path under it, its own included.
    const walk = (id: string): void => {
      const cur = elements[id];
      if (cur === undefined) return;
      const prop = cur.prop !== undefined ? renamePath(cur.prop, as, row, fields) : undefined;
      const bind = cur.bind !== undefined ? Object.fromEntries(Object.entries(cur.bind).map(([k, v]) => [k, renamePath(v, as, row, fields)])) : undefined;
      if (prop !== cur.prop || JSON.stringify(bind) !== JSON.stringify(cur.bind)) {
        elements[id] = { ...cur, ...(prop !== undefined ? { prop } : {}), ...(bind !== undefined ? { bind } : {}) };
        touched.push(id);
      }
      for (const c of cur.childIds) walk(c);
    };
    walk(el.id);
  }
  const samples = { ...(root.samples ?? {}) };
  delete samples[args.list];
  if (nextRows !== undefined) samples[to] = nextRows;
  elements[root.id] = { ...(elements[root.id] ?? root), samples };
  const renamed = [
    ...(to !== args.list ? [`list ${args.list} → ${to}`] : []),
    ...(typeof args.row === 'string' ? [`row → ${args.row}`] : []),
    ...Object.entries(fields).map(([a, b]) => `${a} → ${b}`),
  ];
  return {
    ok: true,
    elements,
    summary: `Renamed ${renamed.join(', ') || 'nothing'}`,
    touched,
    notes: [],
  };
};
