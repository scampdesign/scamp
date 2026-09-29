// generateCode/css.ts — split out of generateCode.ts (4.5).
import { isStyled, runClassName, runStyleDeclarations, runsOf } from '../textRuns';
import { ELEMENT_STATES, type BreakpointOverride, type ElementStateName, type KeyframesBlock, type ScampElement, type StateOverride } from "../element";
import { breakpointOverrideLines, elementDeclarationLines, sizeDeclarationLines } from "./declarations";
import { classNameFor, computeElementsNeedingPositioningContext } from "./internal";
import { DESKTOP_BREAKPOINT_ID, type Breakpoint } from "@shared/types";

/** True when the override object has any field set — used to decide
 *  whether an @media block needs a rule for this element. Type guard
 *  so callers get a narrowed non-undefined value. */
const overrideHasAny = (
  override: BreakpointOverride | undefined
): override is BreakpointOverride =>
  override !== undefined && Object.keys(override).length > 0;


/** The size-only slice of a breakpoint override — the only properties a
 *  component instance is allowed to carry on a page. Returns undefined
 *  when the override sets nothing about size. */
const SIZE_OVERRIDE_KEYS = [
  'widthMode',
  'widthValue',
  'widthCustom',
  'heightMode',
  'heightValue',
  'heightCustom',
] as const satisfies ReadonlyArray<keyof BreakpointOverride>;

const sizeOverrideOnly = (
  override: BreakpointOverride | undefined
): BreakpointOverride | undefined => {
  if (override === undefined) return undefined;
  const out: BreakpointOverride = {};
  for (const key of SIZE_OVERRIDE_KEYS) {
    if (override[key] !== undefined) {
      Object.assign(out, { [key]: override[key] });
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
};


const collectElementsDfs = (
  elements: Record<string, ScampElement>,
  rootId: string
): ScampElement[] => {
  const result: ScampElement[] = [];
  const visit = (id: string): void => {
    const el = elements[id];
    if (!el) return;
    result.push(el);
    for (const childId of el.childIds) visit(childId);
  };
  visit(rootId);
  return result;
};


/**
 * Emit a single state's pseudo-class block for an element. Returns
 * `null` when the override is empty / produces no declarations so the
 * caller can drop it from the chunk.
 *
 * State overrides reuse `breakpointOverrideLines` because the two
 * shapes are structurally compatible — `StateOverride` is a subset of
 * `BreakpointOverride`'s fields, and the lines emitter only acts on
 * keys actually present in the object.
 */
const stateBlockFor = (
  el: ScampElement,
  parent: ScampElement | null,
  state: ElementStateName,
  override: StateOverride
): string | null => {
  if (Object.keys(override).length === 0) return null;
  const lines = breakpointOverrideLines(override as BreakpointOverride, el, parent);
  if (lines.length === 0) return null;
  const body = lines.map((line) => line.length === 0 ? "" : `  ${line}`).join('\n');
  return `.${classNameFor(el)}:${state} {\n${body}\n}`;
};


/**
 * Build the chunk of CSS for a single element: its base class block
 * followed by any recognised state blocks (`:hover` → `:active` →
 * `:focus`) and finally any pseudo-class blocks the parser preserved
 * verbatim. The chunks are concatenated by `generateCss` to give
 * per-element grouping in the output file.
 */
const elementCssChunks = (
  el: ScampElement,
  parent: ScampElement | null,
  mustEstablishPositioningContext: boolean = false
): string[] => {
  // A component instance owns exactly one thing: its size on this page.
  // Everything else about how it looks lives in the component
  // definition's own `[Name].module.css`. An instance left at the
  // default size emits nothing at all, so pages that only place
  // components stay free of empty `.… {}` rules.
  //
  // The selector is DOUBLED (`.inst_x.inst_x`). The page rule and the
  // component's own `.root` rule are single-class selectors in two
  // different CSS modules, so with equal specificity the winner is
  // bundle order — and the component module, imported by the page,
  // lands last. Doubling lifts the page rule to (0,2,0) so a size set
  // on the instance reliably beats the component's own width/height.
  if (el.type === 'component-instance') {
    const sizeLines = sizeDeclarationLines(el, parent);
    if (sizeLines.length === 0) return [];
    const cls = classNameFor(el);
    const body = sizeLines.map((line) => `  ${line}`).join('\n');
    return [`.${cls}.${cls} {\n${body}\n}`];
  }

  const chunks: string[] = [];

  const baseLines = elementDeclarationLines(
    el,
    parent,
    mustEstablishPositioningContext
  );
  const baseBody = baseLines.map((line) => line.length === 0 ? "" : `  ${line}`).join('\n');
  chunks.push(`.${classNameFor(el)} {\n${baseBody}\n}`);

  const overrides = el.stateOverrides;
  if (overrides) {
    for (const state of ELEMENT_STATES) {
      const override = overrides[state];
      if (!override) continue;
      const block = stateBlockFor(el, parent, state, override);
      if (block !== null) chunks.push(block);
    }
  }

  // Raw pseudo-class blocks — preserved verbatim from parseCode for
  // selectors Scamp doesn't model (`:focus-visible`, `:nth-child(...)`,
  // compound selectors, etc.). Emitted in their original parse order
  // so round-trips stay text-stable.
  const raw = el.customSelectorBlocks;
  if (raw && raw.length > 0) {
    for (const block of raw) {
      chunks.push(`${block.selector} {\n${block.body}\n}`);
    }
  }

  return chunks;
};


export const generateCss = (
  elements: Record<string, ScampElement>,
  rootId: string,
  breakpoints: ReadonlyArray<Breakpoint>,
  customMediaBlocks: ReadonlyArray<string>,
  pageKeyframesBlocks: ReadonlyArray<KeyframesBlock>
): string => {
  const ordered = collectElementsDfs(elements, rootId);
  const positioningContextIds = computeElementsNeedingPositioningContext(
    elements,
    rootId
  );

  // Per-element chunks — each chunk is base + state blocks + raw
  // pseudo-class blocks, in DFS order.
  const elementBlocks = ordered.flatMap((el) => {
    const parent = el.parentId ? elements[el.parentId] ?? null : null;
    const chunks = elementCssChunks(el, parent, positioningContextIds.has(el.id));
    // A styled run's rule sits right after its element's, so the file
    // reads in the order the page does.
    // see docs/plans/inline-spans-plan.md
    if (el.type !== 'text') return chunks;
    const cls = classNameFor(el);
    for (const [index, run] of runsOf(el).entries()) {
      if (!isStyled(run)) continue;
      const lines = runStyleDeclarations(run.style ?? {});
      if (lines.length === 0) continue;
      chunks.push(
        `.${runClassName(cls, index)} {\n${lines.map((l) => `  ${l}`).join('\n')}\n}`
      );
    }
    return chunks;
  });

  // @keyframes blocks — emitted after per-element chunks but before
  // @media blocks. Order preserved from the source (parser collects
  // them in source order; the picker appends new ones at the tail).
  const keyframesBlocks = pageKeyframesBlocks.map(
    (block) => `@keyframes ${block.name} {\n${block.body}\n}`
  );

  // @media blocks — widest first (excluding desktop, which is the
  // base). Source order with max-width queries means narrower
  // breakpoints appearing later win the cascade when both match.
  const mediaBlocks: string[] = [];
  for (const bp of breakpoints) {
    if (bp.id === DESKTOP_BREAKPOINT_ID) continue;
    const rules: string[] = [];
    for (const el of ordered) {
      const isInstance = el.type === 'component-instance';
      // An instance owns only its size, so a per-breakpoint rule for one
      // carries only the size keys — and needs the same doubled selector
      // as its base block to outrank the component's own `.root`.
      const override = isInstance
        ? sizeOverrideOnly(el.breakpointOverrides?.[bp.id])
        : el.breakpointOverrides?.[bp.id];
      if (!overrideHasAny(override)) continue;
      const parent = el.parentId ? elements[el.parentId] ?? null : null;
      const lines = breakpointOverrideLines(override, el, parent);
      if (lines.length === 0) continue;
      const body = lines.map((line) => line.length === 0 ? "" : `    ${line}`).join('\n');
      const cls = classNameFor(el);
      rules.push(`  .${cls}${isInstance ? `.${cls}` : ''} {\n${body}\n  }`);
    }
    if (rules.length === 0) continue;
    mediaBlocks.push(
      `@media (max-width: ${bp.width}px) {\n${rules.join('\n\n')}\n}`
    );
  }

  // Custom @media blocks — agent/user-written queries we don't
  // understand. Appended verbatim so they survive the round-trip.
  const customBlocks = customMediaBlocks.filter((b) => b.trim().length > 0);

  const allBlocks = [
    ...elementBlocks,
    ...keyframesBlocks,
    ...mediaBlocks,
    ...customBlocks,
  ];
  return `${allBlocks.join('\n\n')}\n`;
};

