// @lib/tableStyle.ts — a table's row and cell styling, set once.
//
// Dividers, striping, a sticky header and cell padding/alignment are
// things every row or every cell has. Stored on each one, they are the
// same duplication a table's columns exist to remove, so they live on
// the `<table>` and the generator derives one rule per setting.
// see docs/plans/tables-plan.md
import { parsePaddingShorthandOrNull } from './parsers/padding';
import { tokenizeBorder } from './parsers/internal';
import { formatSpaceShorthand } from './spaceValue';
/** Selectors for one table, by slot. Every compound is in `:where()`. */
const slotSelectors = (className) => {
    const t = `:where(.${className})`;
    return {
        // The one rule at (0,1,0) rather than zero: the table reset's
        // `th, td { padding: 0 }` and the canvas's `.element:where(th, td)`
        // would otherwise beat it. A cell's own rule ties and still wins,
        // because the generator writes it later in the file.
        cells: `.${className} :where(th, td)`,
        divider: `${t} :where(tr)`,
        // Two arms because the canvas has no `tbody` the user did not draw,
        // while the exported page always has one: the HTML parser inserts
        // it around a `tr` written straight inside a `table`. `of tr` keeps
        // a `thead` or `caption` sibling from shifting the count on the
        // canvas. see docs/plans/tables-plan.md
        stripe: `${t} > :where(tbody) > :where(tr:nth-child(even)),\n` +
            `${t} > :where(tr:nth-child(even of tr))`,
        sticky: `${t} > :where(thead)`,
    };
};
/** The subgrid selector `@lib/tableGrid` emits, for recognising it. */
const subgridSelector = (className) => `:where(.${className}) > :where(thead, tbody, tfoot),\n` +
    `:where(.${className}) :where(tr)`;
const slotDeclarations = (slot, style) => {
    switch (slot) {
        case 'cells': {
            const lines = [];
            if (style.cellPadding !== undefined) {
                lines.push(`padding: ${formatSpaceShorthand(style.cellPadding)};`);
            }
            if (style.cellAlign !== undefined) {
                lines.push(`text-align: ${style.cellAlign};`);
            }
            return lines;
        }
        case 'divider': {
            const d = style.rowDivider;
            if (d === undefined)
                return [];
            return [`border-bottom: ${d.width}px ${d.style} ${d.color};`];
        }
        case 'stripe':
            return style.stripe === undefined
                ? []
                : [`background-color: ${style.stripe};`];
        case 'sticky':
            // `z-index` so a positioned cell scrolling underneath stays under.
            return style.stickyHeader === true
                ? ['position: sticky;', 'top: 0;', 'z-index: 1;']
                : [];
    }
};
const SLOT_ORDER = [
    'cells',
    'divider',
    'stripe',
    'sticky',
];
/** The derived rules for one table, in a fixed order. */
export const tableStyleRules = (className, style) => {
    if (style === undefined)
        return [];
    const selectors = slotSelectors(className);
    const rules = [];
    for (const slot of SLOT_ORDER) {
        const lines = slotDeclarations(slot, style);
        if (lines.length === 0)
            continue;
        const body = lines.map((line) => `  ${line}`).join('\n');
        rules.push(`${selectors[slot]} {\n${body}\n}`);
    }
    return rules;
};
const normalizeSelector = (selector) => selector
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*>\s*/g, ' > ')
    .trim();
const normalizeDeclaration = (prop, value) => `${prop.trim().toLowerCase()}: ${value.replace(/\s+/g, ' ').trim()};`;
const TEXT_ALIGNS = new Set(['left', 'center', 'right']);
const DIVIDER_STYLES = new Set(['solid', 'dashed', 'dotted']);
const isDividerStyle = (s) => DIVIDER_STYLES.has(s);
const isTextAlign = (s) => TEXT_ALIGNS.has(s);
/** Best-effort read of one slot's declarations; checked by re-emitting. */
const readSlot = (slot, decls) => {
    const style = {};
    for (const { prop, value } of decls) {
        const p = prop.trim().toLowerCase();
        const v = value.trim();
        if (slot === 'cells' && p === 'padding') {
            const padding = parsePaddingShorthandOrNull(v);
            if (padding === null)
                return null;
            style.cellPadding = padding;
        }
        else if (slot === 'cells' && p === 'text-align' && isTextAlign(v)) {
            style.cellAlign = v;
        }
        else if (slot === 'divider' && p === 'border-bottom') {
            const [width, kind, ...color] = tokenizeBorder(v);
            const px = width?.match(/^(\d+(?:\.\d+)?)px$/);
            if (!px || kind === undefined || !isDividerStyle(kind) || color.length !== 1) {
                return null;
            }
            style.rowDivider = { width: Number(px[1]), style: kind, color: color[0] ?? '' };
        }
        else if (slot === 'stripe' && p === 'background-color') {
            style.stripe = v;
        }
        else if (slot === 'sticky' && p === 'position' && v === 'sticky') {
            style.stickyHeader = true;
        }
        else if (!(slot === 'sticky' && (p === 'top' || p === 'z-index'))) {
            return null;
        }
    }
    return style;
};
/**
 * Is this the selector of a rule a table derives? Selector only: the
 * incremental writer uses it to know the rule is Scamp's to remove.
 */
export const isTableRuleSelector = (selector) => matchTableRule(selector, []) !== null;
/**
 * Recognise a rule `tableStyleRules` or `tableSubgridRule` writes.
 *
 * Strict by design: a body counts as typed only when re-emitting what
 * was read gives back the same declarations. An agent that adds a
 * `color` to the stripe rule, or writes `solid 1px` instead of
 * `1px solid`, gets its rule kept verbatim rather than rewritten.
 *
 * Returns null for anything that is not one of these selectors.
 */
export const matchTableRule = (selector, decls) => {
    const normalized = normalizeSelector(selector);
    const match = normalized.match(/^(?::where\()?\.([A-Za-z_][\w-]*)/);
    if (!match)
        return null;
    const className = match[1] ?? '';
    if (normalized === normalizeSelector(subgridSelector(className))) {
        return { kind: 'subgrid', className };
    }
    const selectors = slotSelectors(className);
    const slot = SLOT_ORDER.find((s) => normalizeSelector(selectors[s]) === normalized);
    if (slot === undefined)
        return null;
    const style = readSlot(slot, decls);
    if (style === null)
        return { kind: 'raw', className };
    const reEmitted = slotDeclarations(slot, style);
    const original = decls.map((d) => normalizeDeclaration(d.prop, d.value));
    const same = reEmitted.length === original.length &&
        reEmitted.every((line, i) => line === original[i]);
    return same && reEmitted.length > 0
        ? { kind: 'style', className, style }
        : { kind: 'raw', className };
};
/**
 * Apply a panel edit to a table's styling. A key set to `undefined`
 * is removed, and a style left with no keys becomes `undefined`, so
 * clearing every setting leaves no trace on the element.
 */
export const mergeTableStyle = (current, patch) => {
    const next = { ...current, ...patch };
    for (const key of Object.keys(next)) {
        if (next[key] === undefined)
            delete next[key];
    }
    return Object.keys(next).length > 0 ? next : undefined;
};
