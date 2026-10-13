import { isMappedProperty } from './cssPropertyMap';
import { BIND_MARK } from './parseCode/bindings';
import { ROOT_ELEMENT_ID, type ScampElement } from './element';
import { classNameFor } from './generateCode/internal';
import { formatSpaceShorthand, isZeroSpaceTuple, spaceTupleEquals } from './spaceValue';
import { columnOwnsWidth, isGridTable } from './tableGrid';
import { BOOLEAN_ATTRIBUTES, isRowPath } from './viewProps';

/**
 * What a view lost on the way into the canvas. A file can parse
 * perfectly and still arrive degraded — a binding Scamp kept as opaque
 * text, a declaration that fell out of the panel, a token that resolves
 * to nothing — and the element tree looks correct in every one of those
 * cases. `scamp_get_element_tree` reports structure, so an agent that
 * follows the documented "confirm it parsed" step learns nothing.
 * see docs/notes/view-lint.md
 */
export type ViewFindingKind =
  | 'marker-leaked'
  | 'binding-not-parsed'
  | 'not-panel-editable'
  | 'side-not-typed'
  | 'undeclared-token'
  | 'raw-text-fragment'
  | 'repeat-rows-differ'
  | 'missing-sample'
  | 'table-structure'
  | 'table-cell-width'
  | 'table-repeated-style'
  | 'table-rowspan';

/**
 * A `problem` breaks the page, its export, or what can be reached. A
 * `note` renders correctly — the panel just has no control that holds
 * the value, so it's edited in the CSS panel. Notes are not to be
 * "fixed": rewriting the value changes the layout.
 * see docs/plans/checks-cleanup-plan.md
 */
export type FindingSeverity = 'problem' | 'note';

const NOTE_KINDS: ReadonlySet<ViewFindingKind> = new Set(['not-panel-editable', 'side-not-typed']);

export const severityOf = (kind: ViewFindingKind): FindingSeverity => (NOTE_KINDS.has(kind) ? 'note' : 'problem');

export type ViewFinding = {
  kind: ViewFindingKind;
  severity: FindingSeverity;
  /** The element it sits on; null for a whole-view finding. */
  elementId: string | null;
  /** The element's CSS class, which is how an agent addresses it in the file. */
  className: string | null;
  /** What is wrong, in one sentence. */
  message: string;
  /** What to write instead. Absent when there's nothing actionable to say. */
  hint?: string;
};

export type LintInput = {
  elements: Record<string, ScampElement>;
  rootId: string;
  /** Every custom property `theme.css` declares, `--name` included. */
  themeTokens: ReadonlyArray<string>;
  /**
   * Each component's root tag, by name. An instance is checked as the tag
   * it renders: a <tr> component inside a <tbody> is a row.
   */
  componentRootTags?: Readonly<Record<string, string | undefined>>;
};

/**
 * Longhands whose shorthand Scamp types. Writing the side renders
 * correctly and drops out of the panel, which reads as Scamp losing the
 * value rather than as a choice the author made.
 */
const TYPED_SHORTHAND_FOR: Record<string, string> = {
  'padding-top': 'padding',
  'padding-right': 'padding',
  'padding-bottom': 'padding',
  'padding-left': 'padding',
  'margin-top': 'margin',
  'margin-right': 'margin',
  'margin-bottom': 'margin',
  'margin-left': 'margin',
  'border-top': 'border',
  'border-right': 'border',
  'border-bottom': 'border',
  'border-left': 'border',
  'border-top-width': 'border-width',
  'border-right-width': 'border-width',
  'border-bottom-width': 'border-width',
  'border-left-width': 'border-width',
  'border-top-color': 'border-color',
  'border-right-color': 'border-color',
  'border-bottom-color': 'border-color',
  'border-left-color': 'border-color',
  'border-top-style': 'border-style',
  'border-right-style': 'border-style',
  'border-bottom-style': 'border-style',
  'border-left-style': 'border-style',
  'border-top-left-radius': 'border-radius',
  'border-top-right-radius': 'border-radius',
  'border-bottom-right-radius': 'border-radius',
  'border-bottom-left-radius': 'border-radius',
};

const TOKEN_REF = /var\(\s*(--[A-Za-z0-9_-]+)/g;

/** Every `var(--token)` a string mentions, in order, without duplicates. */
const tokenRefs = (value: string): string[] => {
  const out: string[] = [];
  for (const match of value.matchAll(TOKEN_REF)) {
    const name = match[1];
    if (name !== undefined && !out.includes(name)) out.push(name);
  }
  return out;
};

/**
 * The string-valued style fields worth scanning for token references.
 * Numeric and enum fields can't hold one; `customProperties` is scanned
 * separately because its keys matter too.
 */
const scannableValues = (el: ScampElement): string[] => {
  const out: string[] = [];
  const push = (v: unknown): void => {
    if (typeof v === 'string' && v.length > 0) out.push(v);
  };
  push(el.backgroundColor);
  push(el.color);
  push(el.borderColor);
  push(el.fontSize);
  push(el.fontFamily);
  push(el.lineHeight);
  push(el.letterSpacing);
  for (const value of Object.values(el.customProperties ?? {})) push(value);
  // Spacing fields carry either a number or a `{ kind: 'token', ref }`.
  for (const field of [el.gap, el.rowGap, el.columnGap]) {
    if (field !== null && typeof field === 'object' && 'ref' in field) {
      push((field as { ref: unknown }).ref);
    }
  }
  for (const box of [el.padding, el.margin, el.borderRadius, el.borderWidth]) {
    if (!Array.isArray(box)) continue;
    for (const side of box) {
      if (side !== null && typeof side === 'object' && 'ref' in side) {
        push((side as { ref: unknown }).ref);
      }
    }
  }
  return out;
};

/** The set of fields on a sample row, sorted so two rows compare. */
const fieldsOf = (row: Record<string, unknown>): string => Object.keys(row).sort().join(',');

const SECTION_TAGS: ReadonlySet<string> = new Set(['thead', 'tbody', 'tfoot']);
const CELL_TAGS: ReadonlySet<string> = new Set(['th', 'td']);

/** What may sit directly inside each table tag, as a browser builds it. */
const TABLE_CHILDREN: Readonly<Record<string, ReadonlySet<string>>> = {
  table: new Set(['thead', 'tbody', 'tfoot', 'tr', 'caption', 'colgroup']),
  thead: new Set(['tr']),
  tbody: new Set(['tr']),
  tfoot: new Set(['tr']),
  tr: CELL_TAGS,
};

/** A table's rows, through its sections, and their cells. */
const tableParts = (
  table: ScampElement,
  elements: Record<string, ScampElement>
): { rows: ScampElement[]; cells: ScampElement[] } => {
  const rows: ScampElement[] = [];
  for (const childId of table.childIds) {
    const child = elements[childId];
    if (!child) continue;
    if (child.tag === 'tr') rows.push(child);
    if (child.tag !== undefined && SECTION_TAGS.has(child.tag)) {
      for (const rowId of child.childIds) {
        const row = elements[rowId];
        if (row?.tag === 'tr') rows.push(row);
      }
    }
  }
  const cells = rows.flatMap((row) =>
    row.childIds
      .map((id) => elements[id])
      .filter((c): c is ScampElement => c !== undefined && CELL_TAGS.has(c.tag ?? ''))
  );
  return { rows, cells };
};

/** Is this element a row of some table? Its divider belongs to the table. */
const isTableRow = (el: ScampElement): boolean => el.tag === 'tr';

/**
 * Read a parsed view and report what degraded. Pure: it reads the tree
 * the parser produced, never the file, so it says exactly what the
 * canvas will show rather than what the source looks like.
 */
export const lintView = (input: LintInput): ViewFinding[] => {
  const { elements, rootId, themeTokens } = input;
  const declared = new Set(themeTokens);
  const findings: Array<Omit<ViewFinding, 'severity'>> = [];
  /** The tag an element puts on the page; an instance's is its component's root. */
  const tagOf = (el: ScampElement | undefined): string | undefined =>
    el?.type === 'component-instance' && el.componentName !== undefined
      ? (input.componentRootTags?.[el.componentName] ?? el.tag)
      : el?.tag;
  const root = elements[rootId];
  const samples = root?.samples ?? {};

  // Document order, so findings read down the file rather than in
  // whatever order the element map happens to hold.
  const ordered: string[] = [];
  const walk = (id: string): void => {
    const el = elements[id];
    if (!el) return;
    ordered.push(id);
    for (const childId of el.childIds) walk(childId);
  };
  walk(rootId);

  for (const id of ordered) {
    const el = elements[id];
    if (!el) continue;
    const className = id === ROOT_ELEMENT_ID ? 'root' : classNameFor(el);
    const at = { elementId: id, className };

    // An internal marker that reached the model is always a parser
    // bug, never something the author wrote — `src` and `alt` used to
    // bypass the binding decode and arrive holding one, which rendered
    // as a dead URL. Cheap to check, and it catches the next typed
    // field that skips the decode. see docs/notes/view-bindings.md
    const marked: string[] = [];
    for (const [field, value] of [
      ['src', el.src],
      ['alt', el.alt],
      ['text', el.text],
      ...Object.entries(el.attributes ?? {}),
    ] as Array<[string, unknown]>) {
      if (typeof value === 'string' && value.includes(BIND_MARK)) marked.push(field);
    }
    if (marked.length > 0) {
      findings.push({
        ...at,
        kind: 'marker-leaked',
        message: `${marked.map((f) => `\`${f}\``).join(', ')} still hold Scamp's internal binding marker — the binding was lost on parse.`,
        hint: 'This is a bug in Scamp, not in the file. Report it rather than working around it.',
      });
    }

    // A `{expr}` Scamp kept verbatim. It round-trips and renders, but
    // it is not one of the five binding kinds, so the Data tab can't
    // show it and the props type doesn't declare it.
    for (const [attr, value] of Object.entries(el.attributes ?? {})) {
      if (!value.startsWith('{') || !value.endsWith('}')) continue;
      findings.push({
        ...at,
        kind: 'binding-not-parsed',
        message: `\`${attr}=${value}\` is kept verbatim, not read as a binding.`,
        hint: 'Bindings are a prop name or a member path only. Compute the value in the route and pass it as a prop.',
      });
    }

    // A bound prop with no sample renders empty on the canvas.
    for (const [attr, expr] of Object.entries(el.bind ?? {})) {
      if (isRowPath(expr)) continue;
      // A boolean attribute's sample is its PRESENCE, and the bag
      // stores present as `''`. Both present and absent are real
      // samples, so there is no such thing as a missing one.
      if (BOOLEAN_ATTRIBUTES.has(attr)) continue;
      const name = expr.startsWith('!') ? expr.slice(1) : expr;
      if (name in samples) continue;
      const sample =
        el.type === 'component-instance'
          ? el.propOverrides?.[attr]
          : attr === 'src'
            ? el.src
            : attr === 'alt'
              ? el.alt
              : el.attributes?.[attr];
      if (sample !== undefined && sample !== '') continue;
      findings.push({
        ...at,
        kind: 'missing-sample',
        message: `\`${attr}={${expr}}\` has no sample, so it renders empty on the canvas.`,
        hint: `Give \`${name}\` a default in the destructure — the default IS the sample the canvas draws.`,
      });
    }

    // Declarations that render but leave the panel controls blank.
    for (const [prop, value] of Object.entries(el.customProperties ?? {})) {
      const shorthand = TYPED_SHORTHAND_FOR[prop];
      // A row's bottom border is a table divider, and the table's own
      // finding says where it belongs. "Write all four sides" would be
      // the wrong advice here.
      if (prop === 'border-bottom' && isTableRow(el)) continue;
      if (shorthand !== undefined) {
        findings.push({
          ...at,
          kind: 'side-not-typed',
          message: `\`${prop}\` isn't panel-editable — Scamp types \`${shorthand}\`, not the side.`,
          hint: `Write \`${shorthand}\` with all sides if the user should be able to change it from the panel.`,
        });
        continue;
      }
      if (isMappedProperty(prop)) {
        findings.push({
          ...at,
          kind: 'not-panel-editable',
          message: `\`${prop}: ${value}\` has a panel control, but this value isn't one it can read.`,
          hint: 'The value fell through to a raw string. Check the unit — a typed control takes px, %, or var(--token), and a filter takes its spec unit (contrast(110%), not contrast(1.1)).',
        });
      }
    }

    // A token that resolves to nothing renders as an invalid value.
    for (const value of scannableValues(el)) {
      for (const ref of tokenRefs(value)) {
        if (declared.has(ref)) continue;
        findings.push({
          ...at,
          kind: 'undeclared-token',
          message: `\`var(${ref})\` isn't declared in theme.css, so it resolves to nothing.`,
          hint: `Add \`${ref}\` to theme.css first, then reference it.`,
        });
      }
    }

    // Words directly inside a container aren't an editable text element.
    if (el.type !== 'text') {
      const loose = el.inlineFragments.filter(
        (f) => f.kind === 'text' && f.value.trim().length > 0
      );
      if (loose.length > 0) {
        findings.push({
          ...at,
          kind: 'raw-text-fragment',
          message: `${loose.length} run${loose.length === 1 ? '' : 's'} of text sit directly in this container, so they aren't selectable or editable.`,
          hint: 'Wrap each in its own text element with a data-scamp-id and a matching class.',
        });
      }
    }

    // A table only works as the shape a browser builds: sections and
    // rows inside the table, cells inside a row. Anything else is moved
    // or dropped by the HTML parser in the exported page, while the
    // canvas — built without that parser — shows it where it was.
    // see docs/plans/tables-plan.md
    const parent = el.parentId === null ? undefined : elements[el.parentId];
    const parentTag = tagOf(parent);
    const ownTag = tagOf(el);
    const allowed = parentTag === undefined ? undefined : TABLE_CHILDREN[parentTag];
    if (allowed !== undefined && !allowed.has(ownTag ?? '')) {
      findings.push({
        ...at,
        kind: 'table-structure',
        message: `A <${ownTag ?? 'div'}> directly inside <${parentTag ?? ''}> isn't a valid table part, so the exported page moves it.`,
        hint:
          parentTag === 'tr'
            ? 'Put it inside a <td> or <th>.'
            : parentTag === 'table'
              ? 'Put rows in a <thead>, <tbody>, or <tfoot>, and anything else inside a cell or a <caption>.'
              : 'Only <tr> rows go here; put anything else inside a cell.',
      });
    }

    if (columnOwnsWidth(el, elements) && el.widthMode !== 'auto') {
      findings.push({
        ...at,
        kind: 'table-cell-width',
        message: 'This cell sets its own width, but its column already does — the two disagree the moment either changes.',
        hint: 'Remove `width` from the cell and size the column in `grid-template-columns` on the table.',
      });
    }

    if (CELL_TAGS.has(el.tag ?? '')) {
      const rowSpan = Number(el.attributes?.['rowSpan'] ?? '1');
      if (Number.isInteger(rowSpan) && rowSpan > 1) {
        findings.push({
          ...at,
          kind: 'table-rowspan',
          message: `\`rowSpan="${rowSpan}"\` can't span rows here: each <tr> is one row of the table's grid.`,
          hint: 'Restructure so no cell spans rows, or merge the rows it would have spanned into one.',
        });
      }
    }

    // Styling every row or every cell carries the same copy of is the
    // duplication a table exists to remove, and it can be written once.
    if (el.tag === 'table') {
      const { rows, cells } = tableParts(el, elements);
      const divider = rows[0]?.customProperties?.['border-bottom'];
      if (
        rows.length > 1 &&
        divider !== undefined &&
        rows.every((row) => row.customProperties?.['border-bottom'] === divider)
      ) {
        findings.push({
          ...at,
          kind: 'table-repeated-style',
          message: `All ${rows.length} rows carry their own \`border-bottom: ${divider}\`.`,
          hint: `Set it once on the table — \`:where(.${className}) :where(tr) { border-bottom: ${divider}; }\` — and remove it from the rows. Scamp reads that rule as the table's row divider, editable under Rows and cells.`,
        });
      }
      const padding = cells[0]?.padding;
      if (
        isGridTable(el) &&
        cells.length > 1 &&
        padding !== undefined &&
        !isZeroSpaceTuple(padding) &&
        cells.every((cell) => spaceTupleEquals(cell.padding, padding))
      ) {
        const value = formatSpaceShorthand(padding);
        findings.push({
          ...at,
          kind: 'table-repeated-style',
          message: `All ${cells.length} cells carry their own \`padding: ${value}\`.`,
          hint: `Set it once on the table — \`.${className} :where(th, td) { padding: ${value}; }\` — and remove it from the cells. Scamp reads that rule as the table's cell padding; a cell's own padding still wins.`,
        });
      }
    }

    // Rows that don't agree on their fields type as the first row, so
    // the later ones render blanks where a field is missing.
    if (el.repeat !== undefined) {
      const rows = samples[el.repeat.over];
      if (Array.isArray(rows) && rows.length > 1) {
        const shapes = new Set(rows.map((row) => fieldsOf(row as Record<string, unknown>)));
        if (shapes.size > 1) {
          findings.push({
            ...at,
            kind: 'repeat-rows-differ',
            message: `The sample rows for \`${el.repeat.over}\` don't all carry the same fields.`,
            hint: 'The row type comes from the first row; a field missing from a later row renders blank.',
          });
        }
      }
    }
  }

  return findings.map((f) => ({ ...f, severity: severityOf(f.kind) }));
};
