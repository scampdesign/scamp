// parseCode/apply.ts — split out of parseCode.ts (4.4).
import { cssToScampProperty, isMappedProperty } from "../cssPropertyMap";
import { DEFAULT_COMPONENT_ROOT_STYLES, DEFAULT_RECT_STYLES, DEFAULT_ROOT_STYLES } from "../defaults";
import { ROOT_ELEMENT_ID, type BreakpointOverride, type ElementType, type ScampElement, type StateOverride } from "../element";
import { parseAnimationShorthand, parsePx, parseSpaceValueOrNull } from "../parsers";
import { getTagDefaultPadding } from "../tagDefaults";
import { type RawDeclaration } from "./css";
import { type RawElement } from "./tsx";

/**
 * Apply a list of declarations as a breakpoint override. Unlike
 * `applyDeclarations` (which overlays onto a full element baseline
 * and returns a full element), this returns a Partial carrying just
 * the fields the declarations touch — the right shape for
 * `element.breakpointOverrides[bpId]`.
 */
export const applyDeclarationsAsOverride = (
  decls: RawDeclaration[]
): BreakpointOverride => {
  let override: BreakpointOverride = {};
  const customProperties: Record<string, string> = {};

  for (const { prop, value } of decls) {
    // `position` is now a typed field — fall through to the
    // cssPropertyMap mapper below.
    if (prop === 'left') {
      override = { ...override, x: parsePx(value) };
      continue;
    }
    if (prop === 'top') {
      override = { ...override, y: parsePx(value) };
      continue;
    }
    if (prop === 'margin-top') {
      const sv = parseSpaceValueOrNull(value);
      if (sv === null) {
        customProperties[prop] = value;
        continue;
      }
      const m = override.margin ?? [0, 0, 0, 0];
      override = { ...override, margin: [sv, m[1], m[2], m[3]] };
      continue;
    }
    if (prop === 'margin-right') {
      const sv = parseSpaceValueOrNull(value);
      if (sv === null) {
        customProperties[prop] = value;
        continue;
      }
      const m = override.margin ?? [0, 0, 0, 0];
      override = { ...override, margin: [m[0], sv, m[2], m[3]] };
      continue;
    }
    if (prop === 'margin-bottom') {
      const sv = parseSpaceValueOrNull(value);
      if (sv === null) {
        customProperties[prop] = value;
        continue;
      }
      const m = override.margin ?? [0, 0, 0, 0];
      override = { ...override, margin: [m[0], m[1], sv, m[3]] };
      continue;
    }
    if (prop === 'margin-left') {
      const sv = parseSpaceValueOrNull(value);
      if (sv === null) {
        customProperties[prop] = value;
        continue;
      }
      const m = override.margin ?? [0, 0, 0, 0];
      override = { ...override, margin: [m[0], m[1], m[2], sv] };
      continue;
    }
    if (isMappedProperty(prop)) {
      const mapper = cssToScampProperty[prop];
      if (mapper === undefined) continue;
      const delta = mapper(value);
      // Refusable mappers return `null` to mean "I can't reduce this
      // value to a typed field — preserve the raw declaration via
      // customProperties". Anything else (`{}` or a real delta) is
      // applied to the typed override.
      if (delta === null) {
        customProperties[prop] = value;
        continue;
      }
      override = { ...override, ...delta };
      continue;
    }
    customProperties[prop] = value;
  }

  if (Object.keys(customProperties).length > 0) {
    override = { ...override, customProperties };
  }
  return override;
};


/**
 * Like `applyDeclarationsAsOverride` but also parses the `animation`
 * shorthand into the typed `StateOverride.animation` field. Used for
 * pseudo-class state blocks (`:hover`, `:active`, `:focus`) where
 * per-state animations are supported.
 *
 * Multi-animation source (commas at the top level) round-trips via
 * `customProperties.animation` exactly like the base path — the
 * picker doesn't model the multi case but the value is preserved.
 */
export const applyDeclarationsAsStateOverride = (
  decls: RawDeclaration[]
): StateOverride => {
  const base = applyDeclarationsAsOverride(decls);
  const animDecl = decls.find((d) => d.prop === 'animation');
  if (!animDecl) return base;
  const parsed = parseAnimationShorthand(animDecl.value);
  if (parsed === null) {
    // Multi-animation or unparseable — leave it in customProperties
    // where the breakpoint helper put it. No typed field set.
    return base;
  }
  // Move animation from customProperties (where the breakpoint helper
  // stored it as an unmapped property) into the typed field, so the
  // generator emits one declaration not two.
  const cleanedCustom = { ...(base.customProperties ?? {}) };
  delete cleanedCustom.animation;
  const out: StateOverride = { ...base, animation: parsed };
  if (Object.keys(cleanedCustom).length > 0) {
    out.customProperties = cleanedCustom;
  } else {
    delete out.customProperties;
  }
  return out;
};


export const makeRoot = (isComponent: boolean = false): ScampElement => ({
  ...(isComponent ? DEFAULT_COMPONENT_ROOT_STYLES : DEFAULT_ROOT_STYLES),
  id: ROOT_ELEMENT_ID,
  type: 'rectangle',
  parentId: null,
  childIds: [],
  x: 0,
  y: 0,
  customProperties: {},
  inlineFragments: [],
});


/** The HTML tag we'd default to for an element of this type. Used to
 *  decide whether the parsed `tag` is the default (and can be omitted)
 *  or a deliberate semantic override (and should be stored). */
const defaultTagForType = (type: ElementType): string => {
  if (type === 'image') return 'img';
  if (type === 'input') return 'input';
  return type === 'text' ? 'p' : 'div';
};


export const makeBaseline = (
  raw: RawElement,
  isComponent: boolean = false
): ScampElement => {
  const isRoot = raw.id === ROOT_ELEMENT_ID;
  // Root has its own default shape (100% stretch / auto height / white
  // page background); every other element starts from rect defaults. A
  // COMPONENT root drops the page-root `100vh` floor — see
  // DEFAULT_COMPONENT_ROOT_STYLES / docs/notes/component-min-height-floor.md.
  const defaults = isRoot
    ? isComponent
      ? DEFAULT_COMPONENT_ROOT_STYLES
      : DEFAULT_ROOT_STYLES
    : DEFAULT_RECT_STYLES;
  // Apply UA-padding-aware tag defaults so a file with no `padding`
  // declaration on a `<ul>` parses to the UA-equivalent
  // `[0, 0, 0, 40]` — matching what the browser renders. Without
  // this, the canvas would model `<ul>` as zero-padding (parser
  // default) and the next regen would have to add a `padding: 0`
  // line every save, dirtying the file just to keep state coherent.
  const tagPadding = isRoot ? defaults.padding : getTagDefaultPadding(raw.tag);
  return {
    ...defaults,
    padding: [...tagPadding] as [number, number, number, number],
    id: raw.id,
    type: raw.type,
    parentId: raw.parentId,
    childIds: [...raw.childIds],
    x: 0,
    y: 0,
    customProperties: {},
    inlineFragments: [...raw.inlineFragments],
    // NOT trimmed. The TSX parser trims what it reads, because only it
    // knows the whitespace came from the generator's own indentation.
    // Trimming here as well destroyed every real edge space, including
    // the ones an import needs: `works <span>alongside</span> AI.`
    // became `worksalongsideAI.`
    // see docs/plans/inline-spans-plan.md
    ...(raw.type === 'text' && raw.text !== null ? { text: raw.text } : {}),
    // Only store an explicit tag when it's NOT the type's default. Keeps
    // the round-trip text-stable: a `<div>` rectangle parses with no
    // `tag` field and the generator emits a `<div>` again. Component
    // instances skip this entirely — their identity is `componentName`,
    // not a Scamp `tag` override.
    ...(raw.type !== 'component-instance' && raw.tag !== defaultTagForType(raw.type)
      ? { tag: raw.tag }
      : {}),
    ...(raw.name !== null ? { name: raw.name } : {}),
    ...(raw.src !== null ? { src: raw.src } : {}),
    ...(raw.alt !== null ? { alt: raw.alt } : {}),
    // Only store the attribute bag when non-empty so round-trips stay
    // text-stable: an element with no extra attrs parses with no
    // `attributes` field.
    ...(Object.keys(raw.attributes).length > 0 ? { attributes: raw.attributes } : {}),
    ...(raw.svgSource !== null ? { svgSource: raw.svgSource } : {}),
    ...(raw.bind !== null ? { bind: raw.bind } : {}),
    ...(raw.on !== null ? { on: raw.on } : {}),
    ...(raw.repeat !== null ? { repeat: raw.repeat } : {}),
    ...(raw.showIf !== null ? { showIf: raw.showIf } : {}),
    ...(raw.selectOptions !== null ? { selectOptions: raw.selectOptions } : {}),
    // Component-instance carry-through. Identity lives in
    // `componentName` + `instanceId`; overrides land in
    // `propOverrides`. `missingComponent` only emitted when true so
    // round-trips stay text-stable for well-resolved instances.
    ...(raw.type === 'component-instance'
      ? {
          componentName: raw.componentName ?? raw.tag,
          instanceId: raw.instanceId ?? raw.id,
          propOverrides: raw.propOverrides ?? {},
          ...(raw.missingComponent ? { missingComponent: true } : {}),
        }
      : {}),
  };
};


/**
 * Apply a list of declarations to an element. Returns a new element with
 * mapped properties applied and unmapped ones stored verbatim in
 * customProperties.
 *
 * Position properties (`position`, `left`, `top`) are handled inline since
 * they affect element fields that aren't in cssToScampProperty.
 */
export const applyDeclarations = (
  baseline: ScampElement,
  decls: RawDeclaration[],
  /**
   * True when this element's parent is a flex/grid container.
   *
   * Decides whether an explicit `position: absolute` carries information.
   * Scamp auto-emits `absolute` for a child of a NON-layout parent, so there
   * it can stay the `auto` sentinel and round-trip text-stably. Inside a
   * flex/grid parent `auto` means "in flow", so `absolute` must be pinned —
   * otherwise it is dropped on parse and deleted from the user's file on the
   * next save. see docs/notes/parse-position-absolute-in-flex.md
   */
  parentIsLayoutContainer: boolean = false
): ScampElement => {
  let element: ScampElement = baseline;
  const customProperties: Record<string, string> = {};

  for (const { prop, value } of decls) {
    // `position` is a typed field handled by the cssPropertyMap below
    // — drop straight through. The legacy "skip position entirely"
    // behavior dropped agent-written `position: fixed` etc., which
    // is the bug we're fixing.
    if (prop === 'left') {
      element = { ...element, x: parsePx(value) };
      continue;
    }
    if (prop === 'top') {
      element = { ...element, y: parsePx(value) };
      continue;
    }
    // Per-side margin longhands write into a single tuple slot. Handled
    // inline because mapper deltas can't express tuple updates.
    // `parseSpaceValueOrNull` accepts px and `var(--token)`; anything
    // else (rem, %, auto) falls through to customProperties so it
    // round-trips verbatim.
    if (prop === 'margin-top') {
      const sv = parseSpaceValueOrNull(value);
      if (sv === null) {
        customProperties[prop] = value;
        continue;
      }
      const m = element.margin;
      element = { ...element, margin: [sv, m[1], m[2], m[3]] };
      continue;
    }
    if (prop === 'margin-right') {
      const sv = parseSpaceValueOrNull(value);
      if (sv === null) {
        customProperties[prop] = value;
        continue;
      }
      const m = element.margin;
      element = { ...element, margin: [m[0], sv, m[2], m[3]] };
      continue;
    }
    if (prop === 'margin-bottom') {
      const sv = parseSpaceValueOrNull(value);
      if (sv === null) {
        customProperties[prop] = value;
        continue;
      }
      const m = element.margin;
      element = { ...element, margin: [m[0], m[1], sv, m[3]] };
      continue;
    }
    if (prop === 'margin-left') {
      const sv = parseSpaceValueOrNull(value);
      if (sv === null) {
        customProperties[prop] = value;
        continue;
      }
      const m = element.margin;
      element = { ...element, margin: [m[0], m[1], m[2], sv] };
      continue;
    }
    // Animation is parsed into a typed field on the element. The
    // shorthand parser returns null on multi-animation source
    // (commas at the top level) — those round-trip verbatim via
    // customProperties so the agent's intent is preserved.
    if (prop === 'animation') {
      const parsed = parseAnimationShorthand(value);
      if (parsed === null) {
        customProperties[prop] = value;
        continue;
      }
      element = { ...element, animation: parsed };
      continue;
    }
    if (isMappedProperty(prop)) {
      // `position` has a special "auto" sentinel meaning "let
      // Scamp's tree-shape rules pick the value". When the file
      // contains exactly the value Scamp would have auto-emitted, we
      // skip pinning so the typed field stays `'auto'` and round-
      // trips text-stable.
      if (prop === 'position') {
        const v = value.trim();
        if (v === 'absolute' && !parentIsLayoutContainer) continue;
        if (v === 'relative' && element.id === ROOT_ELEMENT_ID) continue;
      }
      const mapper = cssToScampProperty[prop];
      if (mapper === undefined) continue;
      const delta = mapper(value);
      if (delta === null) {
        customProperties[prop] = value;
        continue;
      }
      element = { ...element, ...delta };
      continue;
    }
    customProperties[prop] = value;
  }

  return { ...element, customProperties };
};

