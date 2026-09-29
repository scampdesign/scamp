// generateCode/tsx.ts — split out of generateCode.ts (4.5).
import { WRITTEN_CONTRACT } from '@shared/projectConfig';

import { PASSTHROUGH_PROP, rootClassNameAttribute } from "../classNamePassthrough";
import { ROOT_ELEMENT_ID, type SampleRow, type SampleValue, type ScampElement } from "../element";
import { isStyled, runClassName, runsOf, textFromRuns } from "../textRuns";
import {
  collectViewProps,
  isRowPath,
  propsTypeSource,
  viewEventNames,
  type ViewProp,
} from "../viewProps";
import { sizeDeclarationLines } from "./declarations";
import { classNameFor, escapeJsx, jsxText, tagFor } from "./internal";

const componentNameFromPage = (pageName: string): string => {
  const parts = pageName.split(/[-_]/).filter((part) => part.length > 0);
  if (parts.length === 0) return 'Page';
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
};


const indent = (level: number): string => '  '.repeat(level);


/**
 * HTML tags rendered as void / self-closing in our output. Covers the
 * HTML5 void-element set plus the cases we care about in the generator
 * (img / input are the common ones). Textarea and select are NOT void
 * even when empty.
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


/**
 * Format one bag entry as a JSX attribute. Boolean-style entries stored
 * as the empty string (`""`) emit bare (`controls`); everything else is
 * double-quoted with HTML-escaped value. Attribute name is emitted
 * verbatim so user-written React-style casing (`htmlFor`,
 * `tabIndex`, …) round-trips unchanged.
 */
const formatAttribute = (name: string, value: string): string => {
  if (value === '') return name;
  // A value the parser kept as a verbatim JSX expression (`{expr}`) goes
  // back out unquoted, as it was written.
  if (value.startsWith('{') && value.endsWith('}')) return `${name}=${value}`;
  return `${name}="${escapeJsx(value)}"`;
};

/**
 * A typed `src` / `alt` value. Unlike a bag entry, `""` is a real empty
 * value here — `alt=""` is the correct markup for a decorative image,
 * and emitting a bare `alt` would mean `alt={true}` in JSX, which React
 * renders as the string "true". A verbatim `{expr}` the parser kept
 * still goes out unquoted.
 */
const formatTypedValue = (name: string, value: string): string =>
  value.startsWith('{') && value.endsWith('}')
    ? `${name}=${value}`
    : `${name}="${escapeJsx(value)}"`;

/**
 * The bound and event attributes of an element, in binding order:
 * `attr={prop}`, `attr={!prop}`, `attr={row.field}`, `onX={handler}`, and
 * inside a repeat `onX={() => handler?.(row.key)}`.
 * see docs/notes/view-bindings.md
 */
const bindingAttributes = (
  el: ScampElement,
  repeatRow: { as: string; key: string } | null
): string[] => {
  const out: string[] = [];
  for (const [attr, expr] of Object.entries(el.bind ?? {})) {
    out.push(`${attr}={${expr}}`);
  }
  for (const [event, handler] of Object.entries(el.on ?? {})) {
    out.push(
      repeatRow !== null && !isRowPath(handler)
        ? `${event}={() => ${handler}?.(${repeatRow.as}.${repeatRow.key})}`
        : `${event}={${handler}}`
    );
  }
  return out;
};

/** The key field of a repeat: the declared one, else `id`. */
const repeatKeyFor = (el: ScampElement): string => el.repeat?.key ?? 'id';


/**
 * Render the `<option>` children of a `<select>` element. Each option
 * is emitted on its own line, indented one level past the select.
 * Boolean `selected` follows the same empty-string convention as other
 * boolean attributes.
 */
const renderSelectOptions = (
  options: ReadonlyArray<{ value: string; label: string; selected?: boolean }>,
  level: number
): string =>
  options
    .map((opt) => {
      const attrs: string[] = [`value="${escapeJsx(opt.value)}"`];
      if (opt.selected) attrs.push('selected');
      return `${indent(level)}<option ${attrs.join(' ')}>${escapeJsx(opt.label)}</option>`;
    })
    .join('\n');


/**
 * Render a single element + its descendants as a JSX subtree.
 * Self-closes when the element has no children and (for text elements)
 * no text content.
 */
/**
 * Render one element with its show and repeat wrappers. The wrapped
 * element sits one level deeper per wrapper; the openers and closers
 * sit at the element's own level, on their own lines. Show wraps repeat.
 */
const renderJsx = (
  el: ScampElement,
  elements: Record<string, ScampElement>,
  level: number,
  isComponent: boolean,
  repeatRow: { as: string; key: string } | null = null
): string => {
  const wrappers = (el.showIf !== undefined ? 1 : 0) + (el.repeat !== undefined ? 1 : 0);
  const row =
    el.repeat !== undefined ? { as: el.repeat.as, key: repeatKeyFor(el) } : repeatRow;
  let out = renderElement(el, elements, level + wrappers, isComponent, row);
  let lvl = level + wrappers;
  if (el.repeat !== undefined) {
    lvl -= 1;
    out = `${indent(lvl)}{${el.repeat.over}.map((${el.repeat.as}) => (\n${out}\n${indent(lvl)}))}`;
  }
  if (el.showIf !== undefined) {
    lvl -= 1;
    out = `${indent(lvl)}{${el.showIf} && (\n${out}\n${indent(lvl)})}`;
  }
  return out;
};

const renderElement = (
  el: ScampElement,
  elements: Record<string, ScampElement>,
  level: number,
  isComponent: boolean,
  repeatRow: { as: string; key: string } | null
): string => {
  // Component instances render as their own PascalCase JSX tag,
  // self-closing, carrying `data-scamp-instance-id` + one
  // attribute per prop override. They never have classNames, page
  // children, or text — the visible content lives inside the
  // component definition's own files. The matching `import` is
  // emitted at the top of the page TSX by `collectComponentImports`.
  if (el.type === 'component-instance') {
    const tagName = el.componentName ?? 'Unknown';
    const attrs: string[] = [
      `data-scamp-instance-id="${escapeJsx(el.instanceId ?? '')}"`,
    ];
    // The page's size class, forwarded to the component's root via its
    // `className` prop. Only emitted when the instance actually has a
    // size — `elementCssChunks` skips the rule in that case too, so the
    // two stay in step and a default-sized instance keeps a bare tag.
    if (sizeDeclarationLines(el).length > 0) {
      attrs.push(`className={styles.${classNameFor(el)}}`);
    }
    // A repeated instance carries the row key; bound props emit as
    // expressions in place of their literal override.
    if (el.repeat !== undefined && repeatRow !== null) {
      attrs.push(`key={${repeatRow.as}.${repeatRow.key}}`);
    }
    const bound = el.bind ?? {};
    const overrides = el.propOverrides ?? {};
    for (const [propName, value] of Object.entries(overrides)) {
      if (propName in bound) continue;
      attrs.push(`${propName}="${escapeJsx(value)}"`);
    }
    attrs.push(...bindingAttributes(el, repeatRow));
    // Group slot content: the default (`children`) slot emits as JSX
    // children of the tag; named slots emit as `slotName={<…>}` props
    // (a `<>…</>` fragment when more than one element fills the slot).
    // see docs/plans/component-slots-plan.md
    const defaultChildren: ScampElement[] = [];
    const namedSlots = new Map<string, ScampElement[]>();
    for (const childId of el.childIds) {
      const child = elements[childId];
      if (!child) continue;
      const name =
        child.slotName && child.slotName.length > 0 && child.slotName !== 'children'
          ? child.slotName
          : null;
      if (name === null) {
        defaultChildren.push(child);
      } else {
        const arr = namedSlots.get(name) ?? [];
        arr.push(child);
        namedSlots.set(name, arr);
      }
    }
    for (const [name, children] of namedSlots) {
      const inner = children
        .map((c) => renderJsx(c, elements, level + 1, isComponent, repeatRow))
        .join('\n');
      const value =
        children.length === 1
          ? inner.trim()
          : `<>\n${inner}\n${indent(level + 1)}</>`;
      attrs.push(`${name}={${value}}`);
    }

    const openTag = `<${tagName} ${attrs.join(' ')}`;
    if (defaultChildren.length === 0) {
      return `${indent(level)}${openTag} />`;
    }
    const childLines = defaultChildren
      .map((child) => renderJsx(child, elements, level + 1, isComponent, repeatRow))
      .filter((line) => line.length > 0)
      .join('\n');
    return `${indent(level)}${openTag}>\n${childLines}\n${indent(level)}</${tagName}>`;
  }

  const className = classNameFor(el);
  const tag = tagFor(el);

  // Baseline attributes every element carries. Typed `src` / `alt`
  // only apply to actual `<img>` — other image-family tags (video,
  // iframe, svg) carry their own attribute sets via the generic bag
  // because `alt` is invalid on them and `src` has tag-specific
  // semantics.
  // A component's root forwards the caller's `className` so a page can
  // size the instance; every other element takes its class directly.
  const isComponentRoot = isComponent && el.id === ROOT_ELEMENT_ID;
  const baseAttrs = [
    `data-scamp-id="${className}"`,
    isComponentRoot
      ? rootClassNameAttribute(className)
      : `className={styles.${className}}`,
  ];
  // A bound attribute's literal is its sample and is skipped here; the
  // binding emits after the literals, the same as for the generic bag.
  // Emitting both produced `src="…" src={photo}` — a duplicate JSX
  // attribute. see docs/notes/view-bindings.md
  const bound = el.bind ?? {};
  if (el.type === 'image' && tag === 'img') {
    if (!('src' in bound)) baseAttrs.push(formatTypedValue('src', el.src ?? ''));
    if (!('alt' in bound)) baseAttrs.push(formatTypedValue('alt', el.alt ?? ''));
  }
  // Generic attribute bag. Iteration order matches insertion order so
  // round-trips stay text-stable.
  if (el.attributes) {
    for (const [name, value] of Object.entries(el.attributes)) {
      if (name in bound) continue;
      baseAttrs.push(formatAttribute(name, value));
    }
  }
  // A repeated element carries the row key.
  if (el.repeat !== undefined && repeatRow !== null) {
    baseAttrs.push(`key={${repeatRow.as}.${repeatRow.key}}`);
  }
  baseAttrs.push(...bindingAttributes(el, repeatRow));

  const open = `<${tag} ${baseAttrs.join(' ')}`;

  // Self-closing void tags (img, input, br, …). No children, no text,
  // no inner source possible.
  if (VOID_TAGS.has(tag)) {
    return `${indent(level)}${open} />`;
  }

  // SVG gets the verbatim inner source. No padding newlines around it
  // — whatever the user stored is what lands on disk, so the parser
  // can slice the same bytes back into `svgSource` on round-trip.
  if (tag === 'svg') {
    const source = el.svgSource ?? '';
    if (source.length === 0) {
      return `${indent(level)}${open} />`;
    }
    return `${indent(level)}${open}>${source}</${tag}>`;
  }

  // Select: emit options as inline children regardless of childIds.
  if (tag === 'select') {
    const options = el.selectOptions ?? [];
    if (options.length === 0) {
      return `${indent(level)}${open} />`;
    }
    const optionLines = renderSelectOptions(options, level + 1);
    return `${indent(level)}${open}>\n${optionLines}\n${indent(level)}</${tag}>`;
  }

  // Component slot: a slot-marked rectangle emits `{slotName}` — the page
  // instance's children fill it. Its own def-children aren't emitted
  // ("Make slot" is forbidden on a rectangle that has children). see
  // docs/plans/component-slots-plan.md
  const slotRef =
    isComponent && el.slot !== undefined && el.slot.length > 0
      ? el.slot
      : null;
  if (slotRef !== null) {
    return `${indent(level)}${open}>{${slotRef}}</${tag}>`;
  }

  // Components emit `{propName}` for text elements whose `prop` is
  // set — the literal value moves to the function-signature default.
  // Pages render the literal directly because the prop concept
  // doesn't exist there.
  const propRef =
    el.type === 'text' && isComponent && el.prop !== undefined && el.prop.length > 0
      ? el.prop
      : null;
  const hasText =
    propRef !== null ||
    (el.type === 'text' && typeof el.text === 'string' && el.text.length > 0);
  const hasChildren = el.childIds.length > 0;
  const fragments = el.inlineFragments;
  const hasFragments = fragments.length > 0;

  if (!hasChildren && !hasText && !hasFragments) {
    return `${indent(level)}${open} />`;
  }

  if (hasText && !hasChildren && !hasFragments) {
    const runs = runsOf(el);
    // Styled runs become spans carrying a run class, on one line. A
    // plain run stays bare, so a sentence with one coloured word is one
    // span rather than three. see docs/plans/inline-spans-plan.md
    if (propRef === null && (runs.length > 1 || runs.some(isStyled))) {
      const cls = classNameFor(el);
      const body = runs
        .map((run, index) =>
          isStyled(run)
            ? `<span className={styles.${runClassName(cls, index)}}>${escapeJsx(run.text)}</span>`
            : jsxText(run.text)
        )
        .join('');
      return `${indent(level)}${open}>${body}</${tag}>`;
    }
    const body = propRef !== null ? `{${propRef}}` : jsxText(textFromRuns(runs));
    return `${indent(level)}${open}>${body}</${tag}>`;
  }

  // Emit fragments before any element child, interleaved between
  // children, and after the last child — using each fragment's
  // `afterChildIndex`. Text fragments are escaped; JSX fragments are
  // emitted byte-for-byte from the captured source.
  const fragmentsAt = (idx: number): string =>
    fragments
      .filter((f) => f.afterChildIndex === idx)
      .map((f) => {
        const text = f.kind === 'text' ? escapeJsx(f.value) : f.source;
        return `${indent(level + 1)}${text}`;
      })
      .join('\n');

  const segments: string[] = [];
  if (hasText) {
    const body = propRef !== null ? `{${propRef}}` : jsxText(textFromRuns(runsOf(el)));
    segments.push(`${indent(level + 1)}${body}`);
  }
  const before = fragmentsAt(-1);
  if (before.length > 0) segments.push(before);
  el.childIds.forEach((childId, i) => {
    const child = elements[childId];
    if (child) {
      const line = renderJsx(child, elements, level + 1, isComponent, repeatRow);
      if (line.length > 0) segments.push(line);
    }
    const after = fragmentsAt(i);
    if (after.length > 0) segments.push(after);
  });

  const inner = segments.join('\n');
  return `${indent(level)}${open}>\n${inner}\n${indent(level)}</${tag}>`;
};


/**
 * Walk every element in the page and collect the PascalCase
 * component names used by any `component-instance` element.
 * Deduped + sorted alphabetically so the generated import block
 * is stable across saves regardless of element insertion order.
 *
 * Missing-component instances (the parser couldn't resolve them
 * to a real component on disk) are deliberately INCLUDED here:
 * the original page TSX referenced them by name, and Scamp's
 * canonical output should keep that name visible to the user /
 * agent so the broken reference is obvious in the file.
 */
const collectComponentImports = (
  elements: Record<string, ScampElement>
): string[] => {
  const names = new Set<string>();
  for (const el of Object.values(elements)) {
    if (el.type !== 'component-instance') continue;
    const name = el.componentName;
    if (name && name.length > 0) names.add(name);
  }
  return [...names].sort();
};



/**
 * Format one string for a TypeScript default-value position
 * (function destructure). We use double-quoted form and escape
 * the minimal characters that would break it. Multi-line text is
 * collapsed onto one line as the JS string-literal `\n` form so
 * the destructure stays on a single line and parses cleanly.
 */
const tsStringLiteral = (raw: string): string => {
  const escaped = raw
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return `"${escaped}"`;
};


/** One sample row as a TypeScript object literal; numbers unquoted. */
const formatRow = (row: SampleRow): string => {
  const fields = Object.entries(row).map(([field, value]) =>
    typeof value === 'number' ? `${field}: ${value}` : `${field}: ${tsStringLiteral(value)}`
  );
  return `{ ${fields.join(', ')} }`;
};

/** The destructure entry for one prop: `name = default`, or a bare name. */
const formatDestructureEntry = (prop: ViewProp, rowIndent: string): string => {
  const value: SampleValue | undefined = prop.defaultValue;
  if (value === undefined) return prop.name;
  if (typeof value === 'boolean') return `${prop.name} = ${value ? 'true' : 'false'}`;
  if (typeof value === 'string') return `${prop.name} = ${tsStringLiteral(value)}`;
  if (value.length === 0) return `${prop.name} = []`;
  const rows = value.map((row) => `${rowIndent}  ${formatRow(row)},`).join('\n');
  return `${prop.name} = [\n${rows}\n${rowIndent}]`;
};

/**
 * The `_scamp` export every component and view ends with — the contract
 * version the file was written for, and the props that are event
 * handlers (the framework's build reads it to decide which views need
 * JavaScript). see docs/notes/view-bindings.md
 */
const formatScampMeta = (
  events: ReadonlyArray<string>,
  contract: number
): string => {
  const list = events.map((name) => `'${name}'`).join(', ');
  return `export const _scamp = { contract: ${contract}, events: [${list}] } as const;`;
};

export const generateTsx = (
  elements: Record<string, ScampElement>,
  rootId: string,
  pageName: string,
  cssModuleImportName: string,
  isComponent: boolean
): string => {
  const root = elements[rootId];
  const componentName = componentNameFromPage(pageName);
  const stylesImport = `import styles from './${cssModuleImportName}.module.css';`;
  // Component imports follow the styles import, one per
  // referenced component. The path uses the `@/` alias so the
  // resolution works both inside Scamp's canvas iframe and in a
  // user's `next dev` run.
  const componentImports = collectComponentImports(elements).map(
    (name) => `import ${name} from '@/components/${name}/${name}';`
  );
  const importLines = [stylesImport, ...componentImports].join('\n');

  // Props emission (components and views only): the inferred props in
  // contract order — non-event props in document order, then events,
  // then slots — and `className` last. Every component accepts
  // `className` unconditionally, because whether it's needed depends on
  // how some other page sizes an instance, and a component's own file
  // must not change when a page does. see docs/notes/view-bindings.md
  const props = isComponent ? collectViewProps(elements, rootId) : [];
  const hasProps = isComponent;
  const propsTypeName = `${componentName}Props`;
  const propsTypeBlock = hasProps
    ? `${propsTypeSource(propsTypeName, props)}\n\n`
    : '';
  // The destructure goes multi-line as soon as a repeat's rows are in
  // it; otherwise it stays on one line, as components always have.
  const multiLine = props.some((p) => p.kind === 'repeat');
  const entries = [
    ...props.map((p) => formatDestructureEntry(p, multiLine ? '  ' : '')),
    ...(isComponent ? [PASSTHROUGH_PROP] : []),
  ];
  const signatureArgs = !hasProps
    ? ''
    : multiLine
      ? `{\n${entries.map((e) => `  ${e},`).join('\n')}\n}: ${propsTypeName}`
      : `{ ${entries.join(', ')} }: ${propsTypeName}`;

  // Components and views end with the `_scamp` export; pages don't.
  const metaBlock = isComponent
    ? `\n${formatScampMeta(viewEventNames(props), root?.contract ?? WRITTEN_CONTRACT)}\n`
    : '';

  if (!root) {
    return `${importLines}\n\n${propsTypeBlock}export default function ${componentName}(${signatureArgs}) {\n  return null;\n}\n${metaBlock}`;
  }
  const body = renderJsx(root, elements, 2, isComponent);
  return `${importLines}\n\n${propsTypeBlock}export default function ${componentName}(${signatureArgs}) {\n  return (\n${body}\n  );\n}\n${metaBlock}`;
};

