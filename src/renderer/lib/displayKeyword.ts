import type { DisplayMode, DisplayOuter } from './element';

/**
 * CSS `display` as the model holds it: how the box lays out its children
 * (`display`, with `'none'` meaning block) and how it sits in its parent
 * (`displayOuter`, absent meaning block). One keyword in the file, two
 * fields in the model, so every "is this a flex or grid container?" check
 * reads `display` alone — `inline-flex` is a flex container.
 * see docs/plans/checks-cleanup-plan.md
 */

const OUTERS: ReadonlySet<string> = new Set(['inline', 'inline-block', 'contents', 'list-item']);

/** The keyword to write. Flex and grid take only `inline`. */
export const displayKeyword = (display: DisplayMode, outer: DisplayOuter | undefined): string => {
  if (display === 'flex') return outer === 'inline' ? 'inline-flex' : 'flex';
  if (display === 'grid') return outer === 'inline' ? 'inline-grid' : 'grid';
  return outer ?? 'block';
};

/**
 * A keyword the model can hold, or null to keep it verbatim. `displayOuter`
 * is always present — `undefined` for block — so a breakpoint override of
 * `block` clears an inline base instead of inheriting it.
 */
export const parseDisplayKeyword = (
  raw: string
): { display: DisplayMode; displayOuter: DisplayOuter | undefined } | null => {
  const value = raw.trim();
  if (value === 'block') return { display: 'none', displayOuter: undefined };
  if (value === 'flex') return { display: 'flex', displayOuter: undefined };
  if (value === 'grid') return { display: 'grid', displayOuter: undefined };
  if (value === 'inline-flex') return { display: 'flex', displayOuter: 'inline' };
  if (value === 'inline-grid') return { display: 'grid', displayOuter: 'inline' };
  if (OUTERS.has(value)) return { display: 'none', displayOuter: value as DisplayOuter };
  return null;
};
