import {
  buildContextModel,
  parseDeclarations,
  type ContextChild,
  type ContextElement,
  type ContextInput,
  type ContextModel,
} from './contextModel';

/**
 * A one-line description of the selection, sized to paste in FRONT of a
 * terminal question rather than to stand alone:
 *
 *   Context: app/page.tsx → .rect_a1b2 (div, flex row, gap 16px, 400×300px).
 *   2 children: … Full styles in app/page.module.css.
 *
 * Same facts as the markdown context file, different shape — both render
 * `contextModel`, so they can't describe the same element differently.
 * see docs/archive/2026-08-06-copy-context-button-plan.md
 */

/** Children listed inline before collapsing to `+N more`. */
const CHILD_LIMIT = 3;
/** Longest single declaration value kept — a data-URI background would
 *  otherwise swamp the whole string. */
const VALUE_MAX = 40;

const truncate = (value: string): string =>
  value.length > VALUE_MAX ? `${value.slice(0, VALUE_MAX - 1)}…` : value;

/**
 * Turn declarations into the compact prose the brief asks for — `flex row`
 * rather than `display: flex; flex-direction: row;`, `400×300px` rather than
 * two size declarations.
 *
 * The known vocabulary is emitted first, in a fixed order so the string
 * reads the same way every time. Whatever's left follows as plain
 * `prop value` pairs, so nothing is silently dropped.
 */
const describeStyles = (el: ContextElement): string[] => {
  const decls = parseDeclarations(el.declarations);
  const used = new Set<string>();
  const take = (prop: string): string | undefined => {
    const value = decls.get(prop);
    if (value !== undefined) used.add(prop);
    return value;
  };
  const phrases: string[] = [];

  const display = take('display');
  const direction = take('flex-direction');
  if (display === 'flex') {
    // `row` is the CSS default, so the generator omits the declaration —
    // but the direction is the single most useful thing to tell an agent
    // about a flex container, and defaulting it here states a fact rather
    // than inventing one.
    phrases.push(`flex ${direction ?? 'row'}`);
  } else if (display !== undefined) {
    phrases.push(display);
  } else if (direction !== undefined) {
    phrases.push(direction);
  }

  const gap = take('gap');
  if (gap !== undefined) phrases.push(`gap ${gap}`);

  const padding = take('padding');
  if (padding !== undefined) phrases.push(`padding ${padding}`);

  // `400×300px` reads better than two separate declarations, but only when
  // both axes are set AND share a unit — otherwise report them as written.
  const width = take('width');
  const height = take('height');
  if (width !== undefined && height !== undefined) {
    const unit = /^(\d+(?:\.\d+)?)(px|%|rem|em)$/.exec(width);
    const heightUnit = /^(\d+(?:\.\d+)?)(px|%|rem|em)$/.exec(height);
    if (unit && heightUnit && unit[2] === heightUnit[2]) {
      phrases.push(`${unit[1]}×${heightUnit[1]}${unit[2]}`);
    } else {
      phrases.push(`width ${width}`, `height ${height}`);
    }
  } else if (width !== undefined) {
    phrases.push(`width ${width}`);
  } else if (height !== undefined) {
    phrases.push(`height ${height}`);
  }

  const background = take('background');
  if (background !== undefined) phrases.push(`background ${background}`);

  for (const [prop, value] of decls) {
    if (used.has(prop)) continue;
    phrases.push(`${prop} ${value}`);
  }

  return phrases.map(truncate);
};

const childPhrase = (child: ContextChild): string => {
  if (child.kind === 'text') {
    return `.${child.className} (${child.tag} "${child.text ?? ''}")`;
  }
  if (child.kind === 'instance') {
    return `.${child.className} (${child.componentName ?? 'unknown component'})`;
  }
  return `.${child.className} (${child.tag})`;
};

const childrenPhrase = (children: ReadonlyArray<ContextChild>): string => {
  if (children.length === 0) return '';
  const shown = children.slice(0, CHILD_LIMIT).map(childPhrase);
  const hidden = children.length - shown.length;
  const list = hidden > 0 ? [...shown, `+${hidden} more`] : shown;
  return ` ${children.length} ${
    children.length === 1 ? 'child' : 'children'
  }: ${list.join(', ')}.`;
};

const renderModel = (model: ContextModel): string => {
  const { target, element } = model;
  const tsx = target?.tsxPath ?? 'no page open';

  if (element === null) {
    const css = target ? ` and ${target.cssPath}` : '';
    return (
      `Context: ${tsx} — ${model.elementCount} element` +
      `${model.elementCount === 1 ? '' : 's'} on canvas, ` +
      `${model.breakpointLabel} breakpoint (${model.canvasWidth}px). ` +
      `Full page code in ${tsx}${css}.`
    );
  }

  const styles = describeStyles(element);
  const descriptors = [element.tag, ...styles].join(', ');
  const extra =
    model.extraSelected > 0
      ? ` +${model.extraSelected} more element${
          model.extraSelected === 1 ? '' : 's'
        } selected.`
      : '';
  const cssTail = target ? ` Full styles in ${target.cssPath}.` : '';

  return (
    `Context: ${tsx} → .${element.className} (${descriptors}).` +
    `${childrenPhrase(element.children)}${extra}${cssTail}`
  );
};

export const buildContextInline = (input: ContextInput): string =>
  renderModel(buildContextModel(input));
