import { DEFAULT_RECT_STYLES } from './defaults';
import type { ScampElement } from './element';
import { isColumnDirection } from './flexAxis';

/**
 * Keeping a box the size it was given inside a flex parent.
 *
 * A flex item's default `flex-shrink: 1` lets the layout squash it below
 * its own `width` as soon as the line overflows. So drawing a 180px box
 * into a 600px row that already holds 260 + 260 of children produced a
 * correct `width: 180px` in the CSS and a 148px box on screen — the
 * stylesheet and the render disagreeing, both behaving exactly as CSS
 * says they should.
 *
 * Scamp's promise is that a fixed size means that size, so a fixed box in
 * a flex parent opts out of shrinking. The guard is the typed `flexShrink`
 * field: it is written to the file (never derived — see the "Rule 2
 * reversal" in docs/archive/2026-09-04-flex-sizing-contract-plan.md), it round-trips
 * through `parseCode` like any other declaration, and the Size panel's
 * "Don't shrink" toggle is the same field.
 *
 * see docs/notes/draw-into-flex-parent.md
 */

/**
 * Add the guard when the parent is a flex container.
 *
 * Grid parents are left alone: a grid item is sized by its track and an
 * explicit width is already honoured, so the declaration would be noise.
 *
 * A non-default `flexShrink` is never overwritten — if it is there, either
 * the user or the file it was parsed from meant it.
 */
/**
 * A flex or grid parent (or a component instance, whose slot lays out
 * like one) places its children; the point the user drew at is not a
 * position. Zero it, or the numbers come back later as `left` / `top`
 * offsets — the first absolute child gives a flex child a positioning
 * context, and the generator writes the stored x/y with it, so a box
 * drawn at (406, 416) jumped by that much the moment a text was placed
 * inside it. see docs/notes/parse-position-absolute-in-flex.md
 */
export const dropDrawnOffset = (
  element: ScampElement,
  parent: Pick<ScampElement, 'display' | 'type'> | undefined
): ScampElement => {
  const placedByParent =
    parent !== undefined &&
    (parent.display === 'flex' || parent.display === 'grid' || parent.type === 'component-instance');
  if (!placedByParent || (element.x === 0 && element.y === 0)) return element;
  return { ...element, x: 0, y: 0 };
};

export const preserveDrawnSize = (
  element: ScampElement,
  parent: ScampElement | undefined
): ScampElement => {
  if (parent?.display !== 'flex') return element;
  if (element.flexShrink !== DEFAULT_RECT_STYLES.flexShrink) return element;
  return { ...element, flexShrink: 0 };
};

/**
 * The Size panel's half of the rule: a px size typed into the parent's
 * MAIN axis sets the guard, and leaving px (Fill / Hug / Auto) clears it.
 * The cross axis is untouched — `flex-shrink` has no effect there.
 *
 * Returns the fields to merge into the size patch, or `{}` when nothing
 * about the guard should change. Only a guard Scamp itself set (`0`) is
 * ever cleared; a hand-written `flex-shrink: 0.5` is the user's.
 */
export const shrinkGuardPatch = (
  element: Pick<ScampElement, 'flexShrink'>,
  parent: Pick<ScampElement, 'display' | 'flexDirection'> | undefined,
  axis: 'width' | 'height',
  nextMode: ScampElement['widthMode']
): Partial<ScampElement> => {
  if (parent?.display !== 'flex') return {};
  const mainAxis: 'width' | 'height' = isColumnDirection(parent.flexDirection)
    ? 'height'
    : 'width';
  if (axis !== mainAxis) return {};
  if (nextMode === 'fixed') {
    return element.flexShrink === DEFAULT_RECT_STYLES.flexShrink ? { flexShrink: 0 } : {};
  }
  return element.flexShrink === 0 ? { flexShrink: DEFAULT_RECT_STYLES.flexShrink } : {};
};
