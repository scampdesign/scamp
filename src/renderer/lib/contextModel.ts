import type { ScampElement } from './element';
import { classNameFor, elementDeclarationLines, tagFor } from './generateCode';

/**
 * The facts about the canvas that every agent-facing description is built
 * from — the live context file, the copy-context one-liner, and (next) the
 * MCP server.
 *
 * Deriving them once matters more than it looks: two places independently
 * deciding what "the element's styles" means would drift, and the drift
 * would be silent because nothing compares the two outputs.
 * see docs/archive/2026-08-06-copy-context-button-plan.md
 */

/** The page or component currently open on the canvas. */
export type ContextTarget = {
  kind: 'page' | 'component' | 'view';
  name: string;
  /** Project-RELATIVE. Absolute paths would leak the user's home directory
   *  into text agents quote back verbatim. */
  tsxPath: string;
  cssPath: string;
};

/** A direct child, described structurally so each renderer can phrase it. */
export type ContextChild = {
  className: string;
  tag: string;
  kind: 'text' | 'instance' | 'container' | 'leaf';
  /** Flattened and truncated; present only for `kind: 'text'`. */
  text?: string;
  /** Present only for `kind: 'instance'`. */
  componentName?: string;
  childCount: number;
};

export type ContextElement = {
  id: string;
  className: string;
  tag: string;
  /** The user's own label, when they've set one. */
  name?: string;
  parentClassName?: string;
  /** Ancestors, outermost first. Empty for the root. */
  chain: string[];
  /** `prop: value;` lines, EXCLUDING custom properties. */
  declarations: string[];
  /** The same declarations as a map — `{display: 'flex', gap: '16px'}`.
   *  Derived, never a second source of truth. */
  styles: Record<string, string>;
  customProperties: Array<[string, string]>;
  children: ContextChild[];
};

export type ContextModel = {
  target: ContextTarget | null;
  /** Null when nothing is selected, or the selection no longer exists. */
  element: ContextElement | null;
  /** Selected elements beyond the primary. */
  extraSelected: number;
  /** Elements on the canvas, excluding the page/component root. */
  elementCount: number;
  canvasWidth: number;
  breakpointLabel: string;
};

export type ContextInput = {
  target: ContextTarget | null;
  elements: Record<string, ScampElement>;
  /** Selection in panel order — index 0 is the primary. */
  selectedIds: ReadonlyArray<string>;
  canvasWidth: number;
  breakpointLabel: string;
};

/** Longest text preview shown for a child, before an ellipsis. */
export const TEXT_PREVIEW_MAX = 40;

export const previewText = (raw: string): string => {
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > TEXT_PREVIEW_MAX
    ? `${flat.slice(0, TEXT_PREVIEW_MAX - 1)}…`
    : flat;
};

/**
 * `prop: value;` → `[prop, value]`, skipping anything malformed.
 *
 * Lives here rather than in a renderer because two of them need it and a
 * third (MCP) reports the map directly — the same reason the model exists.
 */
export const parseDeclarations = (
  lines: ReadonlyArray<string>
): Map<string, string> => {
  const out = new Map<string, string>();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const prop = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).replace(/;$/, '').trim();
    if (prop.length > 0 && value.length > 0) out.set(prop, value);
  }
  return out;
};

/** Ancestors, outermost first. */
const parentChain = (
  elements: Record<string, ScampElement>,
  el: ScampElement
): string[] => {
  const chain: string[] = [];
  let cursor = el.parentId ? elements[el.parentId] : undefined;
  // Bounded by the map size so a corrupt parent cycle can't hang a caller.
  let guard = Object.keys(elements).length + 1;
  while (cursor && guard > 0) {
    chain.unshift(`.${classNameFor(cursor)}`);
    cursor = cursor.parentId ? elements[cursor.parentId] : undefined;
    guard -= 1;
  }
  return chain;
};

const describeChild = (child: ScampElement): ContextChild => {
  const common = {
    className: classNameFor(child),
    tag: tagFor(child),
    childCount: child.childIds.length,
  };
  if (child.type === 'text' && typeof child.text === 'string' && child.text.length > 0) {
    return { ...common, kind: 'text', text: previewText(child.text) };
  }
  if (child.type === 'component-instance') {
    return {
      ...common,
      kind: 'instance',
      componentName: child.componentName ?? 'unknown component',
    };
  }
  return { ...common, kind: child.childIds.length > 0 ? 'container' : 'leaf' };
};

const describeElement = (
  elements: Record<string, ScampElement>,
  el: ScampElement
): ContextElement => {
  const parent = el.parentId ? elements[el.parentId] : undefined;
  // The generator's own emitter, so descriptions can't drift from the CSS
  // actually on disk. It appends customProperties, so filter those back out
  // — they're reported separately, since they aren't canvas-controllable.
  const custom = Object.entries(el.customProperties ?? {});
  const customProps = new Set(custom.map(([prop]) => prop));
  const declarations = elementDeclarationLines(el, parent ?? null).filter(
    (line) => {
      if (line.length === 0) return false;
      const prop = line.slice(0, line.indexOf(':')).trim();
      return !customProps.has(prop);
    }
  );
  return {
    id: el.id,
    className: classNameFor(el),
    tag: tagFor(el),
    ...(el.name !== undefined && el.name.length > 0 ? { name: el.name } : {}),
    ...(parent ? { parentClassName: classNameFor(parent) } : {}),
    chain: parentChain(elements, el),
    declarations,
    styles: Object.fromEntries(parseDeclarations(declarations)),
    customProperties: custom,
    children: el.childIds
      .map((id) => elements[id])
      .filter((c): c is ScampElement => c !== undefined)
      .map(describeChild),
  };
};

export const buildContextModel = (input: ContextInput): ContextModel => {
  const { target, elements, selectedIds, canvasWidth, breakpointLabel } = input;
  const primaryId = selectedIds[0];
  const selected = primaryId !== undefined ? elements[primaryId] : undefined;
  // Excludes the root: "elements on the canvas" means what the user drew,
  // not the page frame they drew it on.
  const elementCount = Object.values(elements).filter(
    (el) => el.parentId !== null
  ).length;
  return {
    target,
    element: selected === undefined ? null : describeElement(elements, selected),
    extraSelected: Math.max(0, selectedIds.length - 1),
    elementCount,
    canvasWidth,
    breakpointLabel,
  };
};
