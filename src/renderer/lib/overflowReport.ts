// @lib/overflowReport.ts — what a measured overflow means, in the agent's terms.
//
// The measurement runs on a view's HTML export, which names elements by
// class only: `card_a1b2` on the view, `header_c3d4__nav_e5f6` inside an
// instance. This maps those back to the element and the view or component
// that owns it, and says each finding as a line the agent can act on.
// see docs/notes/agent-overflow-check.md
//
// Pure.

import type { OverflowFinding, OverflowReport } from '@shared/overflowMeasure';

import type { ScampElement } from './element';
import { INSTANCE_CLASS_SEPARATOR } from './generateHtml';
import { classNameFor } from './generateCode';

type Tree = { elements: Record<string, ScampElement> };

/** Where an exported class lives: the element, and the view or component to edit it in. */
export type ExportedClassOwner = {
  owner: string;
  ownerKind: 'view' | 'component';
  element: ScampElement;
  /** The instance on the view it's inside, when the owner is a component. */
  instance: string | null;
};

const byClass = (elements: Record<string, ScampElement>, cls: string): ScampElement | null =>
  Object.values(elements).find((el) => classNameFor(el) === cls) ?? null;

/** Follow `inst__inner__child` from the view through each instance's component. */
export const locateExportedClass = (
  cls: string,
  view: { name: string; kind: 'view' | 'component'; elements: Record<string, ScampElement> },
  components: Readonly<Record<string, Tree>>
): ExportedClassOwner | null => {
  const parts = cls.split(INSTANCE_CLASS_SEPARATOR);
  let owner = view.name;
  let ownerKind: 'view' | 'component' = view.kind;
  let elements = view.elements;
  let instance: string | null = null;
  for (const [i, part] of parts.entries()) {
    const el = byClass(elements, part);
    if (el === null) return null;
    if (i === parts.length - 1) return { owner, ownerKind, element: el, instance };
    if (el.type !== 'component-instance' || el.componentName === undefined) return null;
    const tree = components[el.componentName];
    if (tree === undefined) return null;
    instance ??= part;
    owner = el.componentName;
    ownerKind = 'component';
    elements = tree.elements;
  }
  return null;
};

/** An element as the agent refers to it, with its owning component when it's in one. */
const name = (cls: string, locate: (cls: string) => ExportedClassOwner | null): string => {
  const found = locate(cls);
  if (found === null) return cls;
  const own = `${classNameFor(found.element)} (id ${found.element.id})`;
  return found.ownerKind === 'component' && found.instance !== null
    ? `${own} in the component ${found.owner} (instance ${found.instance})`
    : own;
};

const sides = (f: OverflowFinding): string =>
  (['top', 'right', 'bottom', 'left'] as const)
    .filter((side) => f[side] > 0)
    .map((side) => `${f[side]}px past the ${side}`)
    .join(', ');

const describeFinding = (f: OverflowFinding, locate: (cls: string) => ExportedClassOwner | null): string => {
  const who = name(f.cls, locate);
  const rows = f.count > 1 ? ` (${f.count} elements, the largest given)` : '';
  const box = `${f.width}×${f.height}px, position: ${f.position}`;
  switch (f.kind) {
    case 'off-page':
      return `- ${who}${rows}: ${sides(f)} of the page — off-screen or widening it. ${box}.`;
    case 'outside-parent':
      return `- ${who}${rows}: ${sides(f)} of its parent ${f.parentCls === null ? '' : name(f.parentCls, locate)}, which lets it show (overflow: ${f.overflow}). ${box}.`;
    case 'clipped':
      return `- ${who}${rows}: ${sides(f)} of its parent ${f.parentCls === null ? '' : name(f.parentCls, locate)}, which cuts it off (overflow: ${f.overflow}). ${box}.`;
    case 'scrolls':
      return `- ${who}${rows}: ${sides(f)} of its parent ${f.parentCls === null ? '' : name(f.parentCls, locate)}, which scrolls to it (overflow: ${f.overflow}) — often intended. ${box}.`;
    case 'text-spills':
      return `- ${who}${rows}: its text runs ${f.right}px past its box (white-space: ${f.whiteSpace}). ${box}.`;
  }
};

/** The report, as the agent reads it. */
export const describeOverflow = (
  viewName: string,
  report: OverflowReport,
  locate: (cls: string) => ExportedClassOwner | null
): string => {
  const wider = report.pageWidth - report.viewportWidth;
  const head = [
    `Rendered ${viewName} at ${report.viewportWidth}px wide, as its HTML export lays out. The page is ${report.pageWidth}×${report.pageHeight}px${
      wider > 1 ? ` — ${wider}px wider than the window, so it scrolls sideways` : ''
    }.`,
  ];
  if (report.findings.length === 0) return [...head, 'Nothing overflows.'].join('\n');
  return [
    ...head,
    `${report.findings.length + report.more} overflow finding${report.findings.length + report.more === 1 ? '' : 's'}, largest first. An element inside a component is fixed in that component, which fixes every instance:`,
    ...report.findings.map((f) => describeFinding(f, locate)),
    ...(report.more > 0 ? [`…and ${report.more} smaller ones.`] : []),
  ].join('\n');
};
