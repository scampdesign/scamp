// parseCode/css.ts — split out of parseCode.ts (4.4).
import postcss from 'postcss';
import { ELEMENT_STATES, type ElementStateName, type KeyframesBlock, type PropertyGroup, type RawSelectorBlock, type TableStyle, type VariantPick } from "../element";
import { matchesPreset } from "../keyframesMatch";
import { canonicalizeGroupList, isPropertyGroup } from "../propertyGroups";
import { matchTableRule } from "../tableStyle";
import { DESKTOP_BREAKPOINT_ID, type Breakpoint } from "@shared/types";

export type RawDeclaration = { prop: string; value: string };


type ClassDeclarations = Map<string, RawDeclaration[]>;


/**
 * Match a `<group> off` comment-body string (already trimmed and
 * lower-cased) and return the corresponding `PropertyGroup` when
 * the word before `off` is a known group name. Whitespace around
 * the word is tolerated, but the comment text must contain only
 * the label — anything else (e.g. trailing decls) refuses.
 */
const matchGroupLabel = (text: string): PropertyGroup | null => {
  const match = text.trim().toLowerCase().match(/^([a-z]+)\s+off$/);
  if (!match) return null;
  const candidate = match[1];
  if (!candidate || !isPropertyGroup(candidate)) return null;
  return candidate;
};


/**
 * Parse a comment body that LOOKS like a CSS declaration —
 * `<prop>: <value>` (trailing `;` optional) — into a typed
 * `RawDeclaration`. Used inside a toggled-off group block to
 * recover the commented-out typed state. Returns null when the
 * comment isn't shaped like a declaration (e.g. just notes or
 * the group label itself).
 */
const parseCommentAsDeclaration = (text: string): RawDeclaration | null => {
  const trimmed = text.trim();
  // Strip a single trailing `;` if present (the generator emits
  // them; agents may or may not).
  const stripped = trimmed.endsWith(';')
    ? trimmed.slice(0, -1).trimEnd()
    : trimmed;
  const colonIdx = stripped.indexOf(':');
  if (colonIdx < 1) return null;
  const prop = stripped.slice(0, colonIdx).trim();
  const value = stripped.slice(colonIdx + 1).trim();
  if (prop.length === 0 || value.length === 0) return null;
  // CSS property names: letters / digits / dashes, starting with
  // a letter or dash. Rejects free-form prose so we don't try to
  // route arbitrary text comments through cssPropertyMap.
  if (!/^[a-zA-Z-][a-zA-Z0-9-]*$/.test(prop)) return null;
  return { prop, value };
};


/**
 * Walk a rule's nodes manually, collecting both active
 * declarations (`decl`) and commented-out toggled-off-group
 * blocks (`comment` nodes interleaved with the active decls).
 *
 * A `<group> off` label comment (e.g. `shadow off`) opens
 * capture mode for the named group; subsequent `comment` nodes
 * inside the same rule whose bodies parse as `prop: value` get
 * added to `decls` as if active — so the typed values inside
 * the comment block are preserved for round-trip. Toggling the
 * group back ON via the panel promotes them to active
 * declarations.
 *
 * The `toggledOff` array accumulates the group names seen in
 * labels (sorted + deduped by the caller). Element-scoped: a
 * label in any of the element's blocks (base, breakpoint, state)
 * adds the group to the element's `toggledOffGroups`.
 */
const collectRuleNodes = (
  rule: postcss.Rule
): { decls: RawDeclaration[]; toggledOff: PropertyGroup[] } => {
  const decls: RawDeclaration[] = [];
  const toggledOff: PropertyGroup[] = [];
  let captureGroup: PropertyGroup | null = null;
  for (const child of rule.nodes ?? []) {
    if (child.type === 'comment') {
      const text = (child as postcss.Comment).text;
      const label = matchGroupLabel(text);
      if (label) {
        captureGroup = label;
        if (!toggledOff.includes(label)) toggledOff.push(label);
        continue;
      }
      if (captureGroup) {
        const decl = parseCommentAsDeclaration(text);
        if (decl) decls.push(decl);
      }
      continue;
    }
    if (child.type === 'decl') {
      // Any real declaration ends the capture mode — a commented
      // block is a contiguous run terminated by the next active
      // line.
      captureGroup = null;
      decls.push({ prop: child.prop, value: child.value });
    }
  }
  return { decls, toggledOff };
};


export type ParsedCss = {
  /** Base (non-@media) declarations keyed by class name. */
  byClass: ClassDeclarations;
  /**
   * Property groups toggled off for each class, union'd across
   * any blocks (base / breakpoint / state) where a label
   * appeared. Element-scoped: the consumer overlays this onto
   * `element.toggledOffGroups`.
   */
  toggledOffByClass: Map<string, PropertyGroup[]>;
  /**
   * `@media (max-width: Npx)` declarations whose N matches a known
   * breakpoint's width. Outer key is breakpoint id; inner key is
   * class name. Populated when the parser can route an @media block
   * to a known breakpoint.
   */
  byBreakpoint: Map<string, ClassDeclarations>;
  /**
   * Per-state declarations for the recognised pseudo-classes
   * (`:hover`, `:active`, `:focus`). Outer key is state name; inner
   * key is class name. Compound or unrecognised pseudo-class
   * selectors are stored in `rawByClass` instead.
   */
  byState: Map<ElementStateName, ClassDeclarations>;
  /**
   * Pseudo-class blocks the parser couldn't route to a recognised
   * state (`.foo:focus-visible`, `.foo:nth-child(odd)`,
   * `.foo:hover .child`, etc.). Keyed by the bare class name so the
   * blocks travel with the matching element. Order within the array
   * matches the source order so re-emit stays text-stable.
   */
  rawByClass: Map<string, RawSelectorBlock[]>;
  /**
   * Raw CSS text of @media blocks the parser couldn't route — either
   * the query shape isn't `(max-width: Npx)` or the width doesn't
   * match any known breakpoint. Preserved verbatim for round-trip.
   */
  customMediaBlocks: string[];
  /**
   * `@keyframes` blocks collected from the page, in source order.
   * Multiple elements can reference the same keyframe name; the
   * blocks travel together at the page level rather than per-element.
   */
  keyframesBlocks: KeyframesBlock[];
  /**
   * A table's row and cell styling, read back from the `:where()` rules
   * `@lib/tableStyle` derives. Keyed by the table's class name.
   */
  tableStyleByClass: Map<string, TableStyle>;
  /**
   * Variant-axis rules (`.root[data-variant="outline"] .label`), in source
   * order. Whether one is typed depends on the component's props type, so
   * `parseCode` decides; one it can't place goes back to the anchor
   * class's raw blocks verbatim. see docs/plans/component-variants-plan.md
   */
  axisRules: AxisRule[];
};

/** One `[data-<axis>="<value>"]` rule (several, for a combination), as read and as written. */
export type AxisRule = {
  /** The class carrying the attributes: the component's root. */
  anchorClass: string;
  /** Each attribute, in source order. */
  parts: VariantPick[];
  /** The element the declarations style: the anchor, or a descendant. */
  targetClass: string;
  state: ElementStateName | null;
  /**
   * Hover, press, and focus interactions into this rule's value, read
   * from its second selectors. CONTRACT.md §1.3.2
   */
  aliases: Array<{ axis: string; from: string | null; trigger: 'hover' | 'press' | 'focus'; to: string }>;
  decls: RawDeclaration[];
  /** Verbatim, for when the axis isn't one the props type declares. */
  raw: RawSelectorBlock;
};

const STATE_GROUP = ELEMENT_STATES.join('|');
const AXIS_ATTR = '\\[data-[a-z][a-z0-9]*="[^"]*"\\]';
const AXIS_RULE_RE = new RegExp(
  `^\\.([A-Za-z_][\\w-]*)((?:${AXIS_ATTR})+)(?::(${STATE_GROUP}))?(?:\\s+\\.([A-Za-z_][\\w-]*)(?::(${STATE_GROUP}))?)?$`
);
const AXIS_ATTR_PARTS_RE = /\[data-([a-z][a-z0-9]*)="([^"]*)"\]/g;

/**
 * Read an axis rule's selector: the root's attribute, then optionally a
 * descendant class, with a state on whichever comes last. A state on the
 * root followed by a descendant is outside the grammar.
 */
export const matchAxisSelector = (
  selector: string
): Omit<AxisRule, 'decls' | 'raw'> | null => {
  const m = AXIS_RULE_RE.exec(selector);
  if (m === null) return null;
  const [, anchorClass = '', attrs = '', anchorState, targetClass, targetState] = m;
  if (targetClass !== undefined && anchorState !== undefined) return null;
  const state = (targetClass !== undefined ? targetState : anchorState) ?? null;
  return {
    anchorClass,
    parts: [...attrs.matchAll(AXIS_ATTR_PARTS_RE)].map((a) => ({ axis: a[1] ?? '', value: a[2] ?? '' })),
    aliases: [],
    targetClass: targetClass ?? anchorClass,
    state: state === null ? null : (state as ElementStateName),
  };
};


const PSEUDO_TRIGGER: Readonly<Record<string, 'hover' | 'press' | 'focus'>> = {
  ':hover': 'hover',
  ':active': 'press',
  ':focus-visible': 'focus',
};
/** An alias may name an axis with no value: any value. */
const ALIAS_ATTR = '\\[data-[a-z][a-z0-9]*(?:="[^"]*")?\\]';
const ALIAS_ATTR_PARTS_RE = /\[data-([a-z][a-z0-9]*)(?:="([^"]*)")?\]/g;
const ALIAS_RE = new RegExp(`^\\.([A-Za-z_][\\w-]*)((?:${ALIAS_ATTR})*)(:hover|:active|:focus-visible)(.*)$`);

/**
 * A variant rule with second selectors for its interactions: the first
 * is the rule; each other is the same rule with one of its values swapped
 * for the value it changes from (or dropped, for any value) and a
 * trigger's pseudo-class on the root. Null when the first isn't a variant
 * rule or another isn't such a selector. CONTRACT.md §1.3.2
 */
export const matchAxisSelectorList = (
  selector: string
): Omit<AxisRule, 'decls' | 'raw'> | null => {
  const [first = '', ...others] = selector.split(',').map((part) => part.trim());
  const main = matchAxisSelector(first);
  if (main === null) return null;
  const attrs = main.parts.map((p) => `[data-${p.axis}="${p.value}"]`).join('');
  const rest = first.slice(`.${main.anchorClass}${attrs}`.length);
  const aliases: AxisRule['aliases'] = [];
  for (const other of others) {
    const m = ALIAS_RE.exec(other);
    if (m === null || m[1] !== main.anchorClass || m[4] !== rest) return null;
    // A value of null is the axis with no value: any value.
    const theirs = [...(m[2] ?? '').matchAll(ALIAS_ATTR_PARTS_RE)].map((a) => ({ axis: a[1] ?? '', value: a[2] ?? null }));
    // Exactly one of the rule's values swapped (for another, or any); the
    // rest as they are, in the same order.
    const changed = main.parts.filter((p) => !theirs.some((t) => t.axis === p.axis && t.value === p.value));
    const target = changed[0];
    if (changed.length !== 1 || target === undefined || theirs.length !== main.parts.length) return null;
    if (theirs.some((t, i) => t.axis !== main.parts[i]?.axis)) return null;
    const swapped = theirs.find((t) => t.axis === target.axis);
    if (swapped === undefined || swapped.value === target.value) return null;
    const trigger = PSEUDO_TRIGGER[m[3] ?? ''];
    if (trigger === undefined) return null;
    aliases.push({ axis: target.axis, from: swapped.value, trigger, to: target.value });
  }
  return { ...main, aliases };
};

/**
 * Inspect a top-level rule selector and decide what bucket it belongs
 * in:
 *   - `base` — plain `.<className>` rule, declarations apply to the
 *     element's top-level fields.
 *   - `state` — `.<className>:hover`, `:active`, or `:focus` exactly.
 *     Routed into the per-state override bucket.
 *   - `raw` — anything else that starts with `.<className>`
 *     (compound, descendant, unrecognised pseudo-class) — preserved
 *     verbatim on the element so the generator can re-emit it.
 *   - `null` — selector isn't class-prefixed; not Scamp's concern.
 */
type SelectorClassification =
  | { kind: 'base'; className: string }
  | { kind: 'state'; className: string; state: ElementStateName }
  | { kind: 'raw'; className: string };


const SUPPORTED_STATES: ReadonlyMap<string, ElementStateName> = new Map(
  ELEMENT_STATES.map((s) => [`:${s}`, s])
);


const classifyClassSelector = (
  selector: string
): SelectorClassification | null => {
  if (!selector.startsWith('.')) return null;
  // Capture the leading class name (CSS identifier, allowing `_`,
  // `-`, digits after the first char). Anything after is `rest`.
  const match = selector.match(/^\.([A-Za-z_][\w-]*)([\s\S]*)$/);
  if (!match) return null;
  const className = match[1] ?? '';
  const rest = (match[2] ?? '').trim();
  if (rest.length === 0) return { kind: 'base', className };
  // `.x.x` — the doubled selector a component instance's size rule uses to
  // outrank the component's own `.root`. Same element, same declarations,
  // just more specificity. see docs/notes/components-data-model.md
  if (rest === `.${className}`) return { kind: 'base', className };
  const stateMatch = SUPPORTED_STATES.get(rest);
  if (stateMatch !== undefined) {
    return { kind: 'state', className, state: stateMatch };
  }
  return { kind: 'raw', className };
};


/** Extract a numeric max-width from a media query condition like
 *  `(max-width: 768px)`. Returns null for anything else so we don't
 *  silently mis-route min-width, orientation, or complex queries. */
const parseMaxWidthParam = (params: string): number | null => {
  const match = params
    .trim()
    .match(/^\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
};


/**
 * Parse a CSS module file into class-keyed declarations plus any
 * `@media` declarations the parser can route to a known breakpoint.
 * Unrecognised @media blocks are preserved verbatim so the generator
 * can re-emit them untouched on round-trip.
 */
/**
 * Split a stylesheet into its top-level blocks (`selector { … }`,
 * `@media { … }`, etc.) by brace depth. Whitespace/comments between blocks
 * attach to the following block. Used only on the recovery path below.
 */
const splitTopLevelBlocks = (css: string): string[] => {
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        blocks.push(css.slice(start, i + 1));
        start = i + 1;
      }
    }
  }
  const tail = css.slice(start).trim();
  if (tail.length > 0) blocks.push(tail);
  return blocks;
};

/**
 * Parse CSS, recovering from syntax errors instead of failing the whole
 * file. A single malformed block (e.g. an agent edit — or, historically, a
 * raw block scamp itself emitted without separating semicolons) must never
 * wipe styling for the entire page: on a strict-parse failure we re-parse
 * each top-level block independently and keep the ones that succeed, so a
 * bad block loses only its own declarations. The well-formed fast path is
 * unchanged. See docs/plans/2026-06-19-style-loss-on-css-edit.md.
 */
const parseCssLenient = (css: string): postcss.Root => {
  try {
    return postcss.parse(css);
  } catch {
    const recovered = postcss.parse('');
    for (const block of splitTopLevelBlocks(css)) {
      try {
        const sub = postcss.parse(block);
        for (const node of sub.nodes) recovered.append(node.clone());
      } catch {
        // Drop only this unparseable block — keep every other rule.
      }
    }
    return recovered;
  }
};

/**
 * A rule as a verbatim block. Formats the body as one string; postcss's
 * `Declaration.toString()` omits the trailing `;`, so it's re-appended:
 * without it a block of two or more declarations re-emits as invalid CSS
 * and the next parse fails for the whole page.
 * See docs/plans/2026-06-19-style-loss-on-css-edit.md.
 */
const rawBlockOf = (node: postcss.Rule): RawSelectorBlock => ({
  selector: node.selector.trim(),
  body: node.nodes
    .map((child) => {
      const s = child.toString().trim();
      if (s.length === 0) return '';
      return child.type === 'decl' ? `  ${s};` : `  ${s}`;
    })
    .filter((s) => s.length > 0)
    .join('\n'),
});

export const parseCssDeclarations = (
  css: string,
  breakpoints: ReadonlyArray<Breakpoint>
): ParsedCss => {
  const byClass: ClassDeclarations = new Map();
  const byBreakpoint = new Map<string, ClassDeclarations>();
  const byState = new Map<ElementStateName, ClassDeclarations>();
  const rawByClass = new Map<string, RawSelectorBlock[]>();
  const customMediaBlocks: string[] = [];
  const keyframesBlocks: KeyframesBlock[] = [];
  const toggledOffByClass = new Map<string, PropertyGroup[]>();
  const tableStyleByClass = new Map<string, TableStyle>();
  const axisRules: AxisRule[] = [];

  /** Merge a freshly-parsed `toggledOff` list into the union map. */
  const mergeToggledOff = (
    className: string,
    groups: ReadonlyArray<PropertyGroup>
  ): void => {
    if (groups.length === 0) return;
    const existing = toggledOffByClass.get(className) ?? [];
    toggledOffByClass.set(className, canonicalizeGroupList([...existing, ...groups]) as PropertyGroup[]);
  };

  // Recover from malformed CSS rather than collapsing every element to
  // defaults — see parseCssLenient. A single bad block only loses itself.
  const root = parseCssLenient(css);

  // Walk top-level rules first — these are the base class blocks
  // and per-state pseudo-class blocks. Using direct iteration (not
  // walkRules) so we skip rules nested inside @media; those get
  // handled in the at-rule walk below.
  for (const node of root.nodes) {
    if (node.type !== 'rule') continue;
    const selector = node.selector.trim();

    // Preserve verbatim (see rawBlockOf).
    const keepRaw = (className: string): void => {
      const list = rawByClass.get(className) ?? [];
      list.push(rawBlockOf(node));
      rawByClass.set(className, list);
    };

    // A table's derived rules. The subgrid one is rebuilt from the
    // columns, so it is dropped; styling ones become typed settings.
    // see docs/archive/2026-10-05-tables-plan.md
    const tableRule = selector.includes(':where(')
      ? matchTableRule(selector, collectRuleNodes(node).decls)
      : null;
    if (tableRule !== null) {
      if (tableRule.kind === 'style') {
        tableStyleByClass.set(tableRule.className, {
          ...tableStyleByClass.get(tableRule.className),
          ...tableRule.style,
        });
      } else if (tableRule.kind === 'raw') {
        keepRaw(tableRule.className);
      }
      continue;
    }

    const axisMatch = matchAxisSelectorList(selector);
    if (axisMatch !== null) {
      axisRules.push({ ...axisMatch, decls: collectRuleNodes(node).decls, raw: rawBlockOf(node) });
      continue;
    }

    const classification = classifyClassSelector(selector);
    if (classification === null) continue;

    if (classification.kind === 'raw') {
      keepRaw(classification.className);
      continue;
    }

    const { decls, toggledOff } = collectRuleNodes(node);
    mergeToggledOff(classification.className, toggledOff);

    if (classification.kind === 'base') {
      byClass.set(classification.className, decls);
    } else {
      // state
      const bucket =
        byState.get(classification.state) ?? new Map<string, RawDeclaration[]>();
      bucket.set(classification.className, decls);
      byState.set(classification.state, bucket);
    }
  }

  // Walk top-level @media at-rules. Route known (max-width: Npx)
  // queries into the breakpoint bucket; stash everything else as
  // raw CSS for verbatim re-emit.
  const widthToId = new Map<number, string>();
  for (const bp of breakpoints) {
    if (bp.id === DESKTOP_BREAKPOINT_ID) continue;
    widthToId.set(bp.width, bp.id);
  }

  for (const node of root.nodes) {
    if (node.type !== 'atrule') continue;
    if (node.name === 'keyframes') {
      // Capture verbatim body (everything between the outer braces),
      // mark `isPreset` based on structural equivalence to the
      // canonical preset body if the name matches.
      const name = node.params.trim();
      const body = (node.nodes ?? [])
        .map((child) => child.toString())
        .join('\n');
      keyframesBlocks.push({
        name,
        body,
        isPreset: matchesPreset(name, body),
      });
      continue;
    }
    if (node.name !== 'media') {
      // Vendor-prefixed keyframes (`-webkit-keyframes`,
      // `-moz-keyframes`, etc.) and any other unrecognised at-rule
      // round-trip verbatim via customMediaBlocks (a slight misnomer
      // — it's the catch-all bucket for at-rules we don't model).
      customMediaBlocks.push(node.toString());
      continue;
    }
    const maxWidth = parseMaxWidthParam(node.params);
    const bpId = maxWidth !== null ? widthToId.get(maxWidth) : undefined;
    if (!bpId) {
      customMediaBlocks.push(node.toString());
      continue;
    }
    // State × breakpoint combinations are out of scope (see element-
    // states plan). If any rule inside the @media isn't a plain base
    // class rule (e.g. `.foo:hover` inside @media), preserve the
    // whole block verbatim instead of risking a partial / wrong
    // routing — round-trip stays text-stable.
    //
    // Same defence for `animation` declarations: per-breakpoint
    // animations aren't typed, so a `@media { .foo { animation: ... } }`
    // block routes verbatim to customMediaBlocks rather than risk an
    // animation field landing in `breakpointOverrides` (the type
    // doesn't allow it).
    let hasNonBaseRule = false;
    let hasAnimationDecl = false;
    node.walkRules((rule) => {
      const c = classifyClassSelector(rule.selector.trim());
      if (c === null) return;
      if (c.kind !== 'base') hasNonBaseRule = true;
      rule.walkDecls((decl) => {
        if (decl.prop === 'animation') hasAnimationDecl = true;
      });
    });
    if (hasNonBaseRule || hasAnimationDecl) {
      customMediaBlocks.push(node.toString());
      continue;
    }
    // Extract per-class declarations inside this @media. Same
    // toggled-off-group treatment as the base/state walk: a
    // label inside a breakpoint scope counts toward the
    // element-level `toggledOffGroups`, and commented decls
    // inside parse into the breakpoint's typed override.
    const bucket = byBreakpoint.get(bpId) ?? new Map<string, RawDeclaration[]>();
    node.walkRules((rule) => {
      const c = classifyClassSelector(rule.selector.trim());
      if (c === null || c.kind !== 'base') return;
      const { decls, toggledOff } = collectRuleNodes(rule);
      mergeToggledOff(c.className, toggledOff);
      bucket.set(c.className, decls);
    });
    byBreakpoint.set(bpId, bucket);
  }

  return {
    byClass,
    byBreakpoint,
    byState,
    rawByClass,
    customMediaBlocks,
    keyframesBlocks,
    toggledOffByClass,
    tableStyleByClass,
    axisRules,
  };
};

