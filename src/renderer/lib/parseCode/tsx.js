// parseCode/tsx.ts — split out of parseCode.ts (4.4).
import { normalizeRootClassNamePassthroughWithMap } from "../classNamePassthrough";
import { ROOT_ELEMENT_ID, } from "../element";
import { requireAt } from "../safeAccess";
import { Parser } from "htmlparser2";
import { decodeBinding, REPEAT_TAG, repeatFromAttribs, SHOW_TAG, } from './bindings';
/**
 * Match `import Pascal from '@/components/Pascal/Pascal';` (or
 * with double quotes; trailing semicolon optional). Used by the
 * import pre-pass to learn which capitalised JSX tags in the
 * source resolve to Scamp components — without this map, the
 * lowercased tag stream from htmlparser2 can't tell `<Button/>`
 * apart from a real `<button>`.
 */
const COMPONENT_IMPORT_RE = /import\s+([A-Z][A-Za-z0-9_]*)\s+from\s+['"]@\/components\/([A-Z][A-Za-z0-9_]*)\/\2['"];?/g;
/**
 * Build a lowercase-tag → PascalCase-component-name map from
 * the page's `import` lines. The lowercase key is what
 * htmlparser2 surfaces in `onopentag`; the value is the
 * original-case name we use for `componentName`.
 *
 * Imports whose imported binding doesn't match the path-component
 * (e.g. `import Btn from '@/components/Button/Button'`) are
 * skipped — Scamp's generator only emits the canonical form, and
 * renaming the binding without renaming the folder would
 * desync component identity from the import.
 */
const scanComponentImports = (tsx) => {
    const out = new Map();
    for (const match of tsx.matchAll(COMPONENT_IMPORT_RE)) {
        const importedName = match[1];
        const folderName = match[2];
        if (importedName === undefined || folderName === undefined)
            continue;
        if (importedName !== folderName)
            continue;
        out.set(importedName.toLowerCase(), importedName);
    }
    return out;
};
const CLASS_NAME_RE = /\{?\s*styles\.([A-Za-z_][A-Za-z0-9_]*)\s*\}?/;
/**
 * Match the destructured props on a component's default-export
 * function — the form generateCode emits for any component with
 * at least one text-prop:
 *
 *   export default function Foo({ label = "Hello" }: FooProps)
 *
 * Captures the contents of the inner `{ … }` so a follow-up pass
 * can extract individual `name = "default"` pairs. Matches greedy
 * stop on the closing `}` — none of the destructured defaults are
 * objects in Scamp's emitted form (all values are plain string
 * literals), so a balanced-brace parser isn't needed.
 *
 * No match → the function has no text-props (or it's a page,
 * which never emits this form). Callers fall back to an empty
 * defaults map.
 */
const COMPONENT_PROPS_DESTRUCTURE_RE = /export\s+default\s+function\s+\w+\s*\(\s*\{([^}]*)\}\s*:\s*\w+Props\s*\)/;
/**
 * Match one `name = "literal"` pair inside the destructure block.
 * Identifier syntax matches what the renderer's Data tab allows
 * (lowerCamelCase JS identifier). The string body is captured raw
 * — escape sequences are decoded by `decodeTsStringLiteral`.
 */
const PROPS_DESTRUCTURE_PAIR_RE = /([a-z][a-zA-Z0-9_]*)\s*=\s*"((?:\\.|[^"\\])*)"/g;
/**
 * Match a JSX-expression-only text body, ignoring surrounding
 * whitespace from generator indentation. Used to detect when a
 * parsed text element's content is a single `{propName}` ref so
 * we can hydrate it into the typed `prop` field.
 */
export const PROP_REF_TEXT_RE = /^\s*\{([a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\}\s*$/;
/**
 * Match a `name?: React.ReactNode` entry in a component's props type —
 * how a SLOT is declared. Slot names are the `React.ReactNode` props (vs
 * text props, which are `?: string`). see docs/plans/component-slots-plan.md
 */
const SLOT_PROP_TYPE_RE = /([a-z][a-zA-Z0-9_]*)\s*\?\s*:\s*React\.ReactNode/g;
/**
 * Collect the slot names declared in a component's props type (the
 * `React.ReactNode` props). Empty for pages (no props type). Used by the
 * parser to hydrate a slot-marked rectangle's `slot` field.
 */
export const parseSlotNames = (tsx) => {
    const out = new Set();
    const re = new RegExp(SLOT_PROP_TYPE_RE.source, 'g');
    for (const m of tsx.matchAll(re)) {
        if (m[1])
            out.add(m[1]);
    }
    return out;
};
/**
 * Reverse of `tsStringLiteral` in generateCode.ts. Decodes the
 * minimal set of escapes the generator emits.
 */
const decodeTsStringLiteral = (raw) => raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
const SCAMP_META_RE = /export\s+const\s+_scamp\s*=\s*\{\s*contract:\s*(\d+)\s*,\s*events:\s*\[([^\]]*)\]\s*\}\s*as\s+const\s*;?/;
/**
 * Read the `_scamp` export (contract version + event-prop names). Null
 * when the file has none — every page, and components written before
 * the framework contract. The generator always writes it back, so
 * nothing here needs preserving. see docs/plans/framework-phase-1-plan.md
 */
export const parseScampMeta = (tsx) => {
    const match = SCAMP_META_RE.exec(tsx);
    if (!match)
        return null;
    const contract = Number(match[1]);
    const events = (match[2] ?? '')
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter((s) => s.length > 0);
    return { contract, events };
};
export const parsePropsDestructure = (tsx) => {
    const out = new Map();
    const block = tsx.match(COMPONENT_PROPS_DESTRUCTURE_RE);
    if (!block)
        return out;
    const inner = block[1] ?? '';
    // Iterate with a fresh regex each time — global flags are stateful.
    const pairRe = new RegExp(PROPS_DESTRUCTURE_PAIR_RE.source, 'g');
    for (const m of inner.matchAll(pairRe)) {
        const name = m[1];
        const raw = m[2];
        if (!name)
            continue;
        out.set(name, decodeTsStringLiteral(raw ?? ''));
    }
    return out;
};
/**
 * Tags that count as text by default. The className prefix
 * (`text_xxxx`) still wins, but if the file uses a semantic tag with a
 * non-conventional class name, we can still classify it correctly.
 */
const TEXT_TAGS = new Set([
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'span',
    'a',
    'label',
    'strong',
    'em',
    'blockquote',
    'code',
    'small',
    'pre',
    'time',
    'figcaption',
    'legend',
    'li',
    // `<button>` is text-capable: a plain `<button>Sign up</button>` is a
    // text element (editable label). A button that gains Scamp element
    // children (icon + span, etc.) is auto-upgraded to a rectangle by the
    // structural correction in `onclosetag` — same dual-nature handling as
    // `<a>` and `<li>`.
    'button',
    // The inline run. A rectangle carries no text, so reading `<b>iQ</b>`
    // as one silently drops the word — and the importer's mirror of this
    // list has to agree with it, or an imported `<b>` is written with its
    // text once and regenerated empty.
    // see docs/notes/import-inline-spans.md
    'b',
    'i',
    'u',
    's',
    'sub',
    'sup',
    'mark',
    'abbr',
    'cite',
    'q',
    'kbd',
    'samp',
    'var',
    'del',
    'ins',
    'dt',
    'dd',
    'summary',
]);
const INPUT_TAGS = new Set(['input', 'textarea', 'select']);
/**
 * Decide whether an element is a text or a rectangle. The PRD's contract
 * (and `agent.md`) says the source of truth is the className prefix
 * (`rect_xxxx` vs `text_xxxx`), not the HTML tag, because hand-written
 * or agent-written files often use `<div>` for both. Fall back to the
 * tag name only when the className doesn't match the convention (e.g.
 * the special `root` class).
 */
const inferElementType = (className, tagName) => {
    if (className.startsWith('img_'))
        return 'image';
    if (className.startsWith('text_'))
        return 'text';
    if (className.startsWith('input_'))
        return 'input';
    if (className.startsWith('rect_'))
        return 'rectangle';
    if (tagName === 'img')
        return 'image';
    if (INPUT_TAGS.has(tagName))
        return 'input';
    return TEXT_TAGS.has(tagName) ? 'text' : 'rectangle';
};
/**
 * Walk the TSX with htmlparser2 and produce the element tree shape (no
 * styles yet — those come from the CSS pass). We rely on the strict format
 * generateCode emits, so we don't need a real JSX parser:
 *
 *   <div data-scamp-id="..." className={styles.X}>...</div>
 *   <p   data-scamp-id="..." className={styles.X}>text</p>
 *
 * Special cases:
 *   - `<svg>` inner source is captured verbatim via the parser's
 *     start/end indices; nested open/close events inside the svg are
 *     suppressed so children of the svg don't become canvas elements.
 *   - `<select>` children named `<option>` are consumed into a typed
 *     `selectOptions` list on the select rather than treated as canvas
 *     elements in their own right.
 */
/** Normalise a `data-scamp-id` / instance-id attribute to the short id. */
const shortId = (raw) => raw === ROOT_ELEMENT_ID
    ? raw
    : raw.includes('_')
        ? raw.slice(raw.lastIndexOf('_') + 1)
        : raw;
/**
 * A fresh 4-char hex id derived DETERMINISTICALLY from `base`, guaranteed
 * not to be in `reserved`. Deterministic (no randomness) so parseCode
 * stays pure — the same duplicate file always repairs to the same ids,
 * keeping the parse→generate→parse round-trip stable.
 */
const freshHexId = (base, reserved) => {
    let n = 0;
    for (const ch of base)
        n = (n * 31 + ch.charCodeAt(0)) & 0xffff;
    for (let i = 0; i < 0x10000; i += 1) {
        n = (n + 0x9e37) & 0xffff; // odd step walks the whole 16-bit space
        const hex = n.toString(16).padStart(4, '0');
        if (!reserved.has(hex))
            return hex;
    }
    return `${base}0`;
};
/** Replace the hex suffix of a class name (`rect_1a2b` → `rect_<hex>`). */
const renameClassSuffix = (className, hex) => {
    if (className.length === 0)
        return hex;
    const us = className.lastIndexOf('_');
    return us >= 0 ? `${className.slice(0, us + 1)}${hex}` : hex;
};
/** Collect every id already present in the source so generated ids can't
 *  collide with a later real one (the parser is a single streaming pass). */
const collectExistingIds = (tsx) => {
    const ids = new Set();
    const re = /data-scamp-(?:id|instance-id)="([^"]*)"/g;
    for (const m of tsx.matchAll(re)) {
        const raw = m[1];
        if (raw && raw.length > 0)
            ids.add(shortId(raw));
    }
    return ids;
};
/** A range in a rewritten text, as a range in what it was rewritten from. */
export const mapRange = (map, range) => ({
    start: map.toOriginalStart(range.start),
    openEnd: map.toOriginalEnd(range.openEnd),
    innerEnd: map.toOriginalEnd(range.innerEnd),
    end: map.toOriginalEnd(range.end),
});
export const parseTsxStructure = (rawTsx) => {
    // A component root's className is a template literal joining its own
    // class with the forwarded `className` prop. The space inside it would
    // terminate the unquoted attribute value for the HTML parser below, so
    // collapse it back to the plain `className={styles.X}` form first.
    const normalized = normalizeRootClassNamePassthroughWithMap(rawTsx);
    const tsx = normalized.text;
    const elements = [];
    const stack = [];
    const byId = new Map();
    // Duplicate-id repair: `seenIds` tracks ids already assigned; `reserved`
    // (seeded with EVERY id in the source) prevents a generated id from
    // colliding with a real one. When an id repeats, we reassign the later
    // element a fresh id in place — before its children are parsed, so the
    // whole subtree adopts it. see docs/notes/duplicate-id-repair.md
    const seenIds = new Set();
    const reserved = collectExistingIds(tsx);
    const claimId = (el) => {
        if (el.id === ROOT_ELEMENT_ID) {
            seenIds.add(el.id);
            return;
        }
        if (!seenIds.has(el.id)) {
            seenIds.add(el.id);
            return;
        }
        const hex = freshHexId(el.id, reserved);
        reserved.add(hex);
        seenIds.add(hex);
        if (el.className.length > 0)
            el.dedupedFrom = el.className;
        el.id = hex;
        el.className = renameClassSuffix(el.className, hex);
    };
    // Resolve lowercased JSX tag names back to their imported
    // PascalCase form (htmlparser2 lowercases tags). Pages that
    // don't use any components get an empty map; the
    // component-instance recognition path naturally skips for those.
    const componentImports = scanComponentImports(tsx);
    const frames = [];
    /** The opening tag's bounds, filled in on close. */
    const openRange = () => {
        const start = parser.startIndex ?? 0;
        const openEnd = (parser.endIndex ?? start) + 1;
        return { start, openEnd, innerEnd: openEnd, end: openEnd };
    };
    // Show / repeat pseudo-tags (from the bindings pre-pass) wrap the next
    // real element; they attach to it when it opens.
    const pendingWrappers = [];
    const attachWrappers = (el) => {
        while (pendingWrappers.length > 0) {
            const w = pendingWrappers.shift();
            if (!w)
                break;
            if (w.repeat)
                el.repeat = { ...w.repeat, ...(el.repeat?.key ? { key: el.repeat.key } : {}) };
            if (w.showIf)
                el.showIf = w.showIf;
        }
    };
    /**
     * Split an element's raw attributes into literals and bindings. A
     * `key={row.field}` on a repeated element names the repeat key.
     */
    const readBindings = (attribs, skip) => {
        const literals = {};
        let bind = null;
        let on = null;
        let repeatKey = null;
        for (const [attrName, attrValue] of Object.entries(attribs)) {
            if (skip.has(attrName))
                continue;
            const decoded = decodeBinding(attrName, attrValue);
            if (decoded === null) {
                literals[attrName] = attrValue;
                continue;
            }
            if (decoded.kind === 'verbatim') {
                literals[attrName] = `{${decoded.expr}}`;
                continue;
            }
            if (decoded.kind === 'event') {
                on = { ...(on ?? {}), [attrName]: decoded.handler };
                continue;
            }
            if (attrName === 'key') {
                const dot = decoded.expr.indexOf('.');
                const field = dot >= 0 ? decoded.expr.slice(dot + 1) : decoded.expr;
                // `id` is the default key; storing it would make a file written
                // without one parse differently from its own regeneration.
                repeatKey = field === 'id' ? null : field;
                continue;
            }
            bind = { ...(bind ?? {}), [attrName]: decoded.expr };
        }
        return { literals, bind, on, repeatKey };
    };
    // Depth of nested unclassed (skipped) tags currently open inside
    // a Scamp parent. When > 0, we treat text + nested tags as part of
    // the verbatim JSX fragment — only capture once we close the
    // OUTERMOST skipped tag so e.g. `<strong>a <em>b</em></strong>`
    // round-trips byte-equivalent.
    let skippedDepth = 0;
    let skippedRootStart = 0;
    // When capturing an svg's verbatim inner source.
    let svgTarget = null;
    let svgInnerStart = 0;
    // When inside a `<select>` element, we collect its `<option>`
    // children into the typed list rather than as normal RawElements.
    let selectTarget = null;
    let currentOption = null;
    const parser = new Parser({
        onopentag(name, attribs) {
            // Already inside an svg — everything is raw inner source.
            if (svgTarget) {
                frames.push('svg-inner');
                return;
            }
            // A show / repeat wrapper: remember it for the next real element.
            if (name === REPEAT_TAG || name === SHOW_TAG) {
                pendingWrappers.push({
                    repeat: name === REPEAT_TAG ? repeatFromAttribs(attribs) : null,
                    showIf: name === SHOW_TAG ? (attribs['if'] ?? null) : null,
                });
                frames.push('wrapper');
                return;
            }
            // Inside a select: recognise option children, ignore other tags.
            if (selectTarget && name === 'option') {
                currentOption = {
                    value: attribs['value'] ?? '',
                    label: '',
                    selected: 'selected' in attribs,
                };
                frames.push('option');
                return;
            }
            // Component instance: a JSX tag carrying
            // `data-scamp-instance-id`. The tag name we see here is
            // lowercased (htmlparser2 default), so we recover the
            // PascalCase component name via the import pre-pass. A
            // matching `import` confirms the reference; otherwise the
            // element still parses but is flagged as
            // `missingComponent` so the renderer can surface an error
            // placeholder.
            const rawInstanceId = attribs['data-scamp-instance-id'];
            if (typeof rawInstanceId === 'string' && rawInstanceId.length > 0) {
                const resolvedName = componentImports.get(name);
                const componentName = resolvedName ?? name;
                const parentId = stack.length > 0 ? requireAt(stack, stack.length - 1).id : null;
                // Use the instanceId itself as the canvas element id —
                // these need to be unique across the page anyway, and
                // reusing it keeps debugging simple. (For very old
                // `data-scamp-instance-id="inst_a1b2"` we strip the
                // `inst_` prefix; the canvas id is the hex tail.)
                const id = rawInstanceId.includes('_')
                    ? rawInstanceId.slice(rawInstanceId.lastIndexOf('_') + 1)
                    : rawInstanceId;
                // `className` is the page's own size class, forwarded to the
                // component root — it's this element's class, not a prop
                // override. Every other attribute is an override; empty-string
                // values are kept (an explicit "render empty" override is
                // distinct from absence).
                const classRaw = attribs['className'] ?? attribs['classname'] ?? '';
                const instanceClass = classRaw.match(CLASS_NAME_RE)?.[1] ?? '';
                const instanceBindings = readBindings(attribs, new Set(['data-scamp-instance-id', 'className', 'classname']));
                const propOverrides = instanceBindings.literals;
                const el = {
                    id,
                    type: 'component-instance',
                    tag: componentName,
                    className: instanceClass,
                    parentId,
                    childIds: [],
                    text: null,
                    inlineFragments: [],
                    name: null,
                    src: null,
                    alt: null,
                    attributes: {},
                    svgSource: null,
                    selectOptions: null,
                    componentName,
                    instanceId: rawInstanceId,
                    propOverrides,
                    missingComponent: resolvedName === undefined,
                    bind: instanceBindings.bind,
                    on: instanceBindings.on,
                    repeat: instanceBindings.repeatKey ? { over: '', as: '', key: instanceBindings.repeatKey } : null,
                    showIf: null,
                    range: null,
                };
                attachWrappers(el);
                if (el.repeat && el.repeat.over.length === 0)
                    el.repeat = null;
                claimId(el);
                if (parentId) {
                    const parent = byId.get(parentId);
                    parent?.childIds.push(el.id);
                }
                el.range = openRange();
                elements.push(el);
                byId.set(el.id, el);
                stack.push(el);
                frames.push('pushed');
                return;
            }
            const rawId = attribs['data-scamp-id'];
            if (typeof rawId !== 'string' || rawId.length === 0) {
                // Unclassed JSX inside a Scamp parent — start capturing
                // verbatim source from the outermost skipped tag's open
                // bracket so the close handler can slice the full subtree
                // and push it as an `inlineFragments` entry on the parent.
                if (skippedDepth === 0 && stack.length > 0) {
                    skippedRootStart = parser.startIndex ?? 0;
                }
                skippedDepth += 1;
                frames.push('skipped');
                return;
            }
            // data-scamp-id is either the full class name (`sidebar_a1b2`,
            // `rect_a1b2`) or, for backward compat with older projects, the
            // short 4-char hex id (`a1b2`). Extract the short id in both cases.
            const id = rawId === ROOT_ELEMENT_ID
                ? ROOT_ELEMENT_ID
                : rawId.includes('_')
                    ? rawId.slice(rawId.lastIndexOf('_') + 1)
                    : rawId;
            // className attribute case is preserved by the parser options —
            // fall back to the lowercase form too in case a hand-written
            // file uses HTML-style `class`.
            const classRaw = attribs['className'] ?? attribs['classname'] ?? '';
            const match = classRaw.match(CLASS_NAME_RE);
            const className = match?.[1] ?? '';
            const type = inferElementType(className, name);
            const parentId = stack.length > 0 ? requireAt(stack, stack.length - 1).id : null;
            // Derive the custom name from the class name prefix. If the
            // prefix is one of the defaults, the element has no custom name.
            let parsedName = null;
            if (className.includes('_') && rawId !== ROOT_ELEMENT_ID) {
                const prefix = className.slice(0, className.lastIndexOf('_'));
                if (prefix !== 'rect' &&
                    prefix !== 'text' &&
                    prefix !== 'img' &&
                    prefix !== 'input') {
                    parsedName = prefix;
                }
            }
            // Typed src/alt only apply when the tag is actually `<img>` —
            // video/iframe/svg and other image-family tags carry their
            // tag-specific attributes through the generic bag.
            const typedImgSrcAlt = type === 'image' && name === 'img';
            // Collect every attribute not already typed-captured into the
            // generic bag (bindings split off). Preserves unknown attrs verbatim.
            const skipAttrs = new Set(['data-scamp-id', 'className', 'classname']);
            const elementBindings = readBindings(attribs, skipAttrs);
            const extraAttributes = elementBindings.literals;
            // `src` / `alt` bind like any other attribute, so they go
            // through readBindings FIRST and are lifted into the typed
            // fields after — skipping the decode left the `__scamp_bind__`
            // marker sitting in `src`, which the canvas rendered as a dead
            // URL and the generator wrote back as a literal.
            // see docs/notes/view-bindings.md
            let typedSrc = null;
            let typedAlt = null;
            if (typedImgSrcAlt) {
                typedSrc = extraAttributes['src'] ?? null;
                typedAlt = extraAttributes['alt'] ?? null;
                delete extraAttributes['src'];
                delete extraAttributes['alt'];
            }
            const el = {
                id,
                type,
                tag: name,
                className,
                parentId,
                childIds: [],
                text: null,
                inlineFragments: [],
                name: parsedName,
                src: typedSrc,
                alt: typedAlt,
                attributes: extraAttributes,
                svgSource: null,
                selectOptions: null,
                // Component-instance fields default empty/null on
                // regular elements; only set on the component-instance
                // branch above.
                componentName: null,
                instanceId: null,
                propOverrides: null,
                missingComponent: false,
                bind: elementBindings.bind,
                on: elementBindings.on,
                repeat: elementBindings.repeatKey
                    ? { over: '', as: '', key: elementBindings.repeatKey }
                    : null,
                showIf: null,
                range: null,
            };
            attachWrappers(el);
            if (el.repeat && el.repeat.over.length === 0)
                el.repeat = null;
            claimId(el);
            if (parentId) {
                const parent = byId.get(parentId);
                parent?.childIds.push(el.id);
            }
            el.range = openRange();
            elements.push(el);
            byId.set(el.id, el);
            stack.push(el);
            frames.push('pushed');
            // After registering the element, check whether it kicks off
            // one of the special-case capture modes.
            if (name === 'svg') {
                svgTarget = el;
                // htmlparser2's endIndex is the `>` of the opening tag; the
                // verbatim body starts one character later.
                svgInnerStart = (parser.endIndex ?? 0) + 1;
            }
            else if (name === 'select') {
                selectTarget = el;
                el.selectOptions = [];
            }
        },
        ontext(text) {
            if (svgTarget)
                return; // inner source captured wholesale on close
            if (currentOption) {
                currentOption.label += text;
                return;
            }
            // Inside an unclassed JSX subtree — text is part of the
            // verbatim source captured on close.
            if (skippedDepth > 0)
                return;
            const top = stack[stack.length - 1];
            if (!top)
                return;
            if (top.type === 'text') {
                // Text element — concatenate raw chunks; htmlparser2 may
                // emit multiple ontext events around an entity boundary.
                // Normalised once on close, not here: a chunk boundary can
                // fall inside a `{' '}` token.
                top.text = (top.text ?? '') + text;
                return;
            }
            // Loose text inside a non-text Scamp parent — preserve as a
            // fragment so the source order is recoverable. Drop pure-
            // whitespace chunks (newline + indent between tags) to avoid
            // double-spacing the generator's own indentation on emit.
            if (text.trim().length === 0)
                return;
            top.inlineFragments.push({
                kind: 'text',
                value: text,
                afterChildIndex: top.childIds.length - 1,
            });
        },
        onclosetag(name) {
            const frame = frames.pop();
            if (frame === 'svg-inner')
                return;
            if (frame === 'wrapper')
                return;
            if (frame === 'option') {
                if (!currentOption)
                    return;
                const label = currentOption.label.trim();
                const entry = {
                    value: currentOption.value,
                    label,
                };
                if (currentOption.selected)
                    entry.selected = true;
                if (selectTarget?.selectOptions) {
                    selectTarget.selectOptions.push(entry);
                }
                currentOption = null;
                return;
            }
            if (frame === 'skipped') {
                skippedDepth -= 1;
                // Just closed the OUTERMOST skipped tag inside a Scamp
                // parent — slice its verbatim source out of the original
                // tsx and push as an inline JSX fragment on that parent.
                if (skippedDepth === 0 && stack.length > 0) {
                    const closeEnd = (parser.endIndex ?? skippedRootStart) + 1;
                    const source = tsx.slice(skippedRootStart, closeEnd);
                    const top = requireAt(stack, stack.length - 1);
                    top.inlineFragments.push({
                        kind: 'jsx',
                        source,
                        afterChildIndex: top.childIds.length - 1,
                    });
                }
                return;
            }
            // 'pushed' — real element. Pop the stack; also clear
            // svg/select capture state if this is the element that opened
            // them.
            const top = stack.pop();
            if (top?.type === 'text' && typeof top.text === 'string') {
                // The generator indents a text element onto its own line, so
                // what arrives here is `\n      works \n    ` and the words
                // are only recoverable by trimming. That trim used to live in
                // `makeBaseline` and took REAL edge spaces with it, which is
                // why `works ` and `works` were the same file.
                //
                // `{' '}` is how the generator writes an edge space, and it
                // survives the trim because it is not whitespace. Decode
                // after trimming, never before.
                // see docs/plans/inline-spans-plan.md
                top.text = top.text.trim().replace(/\{' '\}/g, ' ');
            }
            if (top?.range) {
                // A self-closing tag closes at its own open tag, which reads
                // as a close before `openEnd` — leave the range as it is.
                const closeStart = parser.startIndex ?? 0;
                if (closeStart >= top.range.openEnd) {
                    top.range.innerEnd = closeStart;
                    top.range.end = (parser.endIndex ?? closeStart) + 1;
                }
            }
            // Structural correction for ambiguous tags. Some HTML tags
            // (e.g. `<li>`, `<a>`, `<label>`) can semantically be either
            // a text node or a container. `inferElementType` defaults
            // them to `text` based on the tag name, which is right for
            // a leaf like `<li>Item</li>` but wrong for the much more
            // common `<li><span>...</span><span>...</span></li>` —
            // text-typed elements only render their `.text` content and
            // ignore Scamp children, so the inner spans visually
            // disappear on the canvas. When we close one of these
            // elements and it ended up with Scamp children, upgrade it
            // to a rectangle so its children render. Only applies when
            // the className prefix didn't pin the type explicitly (a
            // `text_` prefix is honored regardless).
            if (top &&
                top.type === 'text' &&
                top.childIds.length > 0 &&
                !top.className.startsWith('text_')) {
                top.type = 'rectangle';
            }
            if (top && top === svgTarget) {
                const closeAt = parser.startIndex ?? tsx.length;
                const source = tsx.slice(svgInnerStart, closeAt);
                // Empty source (self-closing `<svg />` or `<svg></svg>`)
                // stays as null so round-trips re-emit the self-closing
                // form instead of growing an open+close pair.
                top.svgSource = source.length > 0 ? source : null;
                svgTarget = null;
            }
            if (top && top === selectTarget) {
                selectTarget = null;
            }
            // `name` is intentionally unread — htmlparser2 calls
            // onclosetag in nesting order so the pop above matches.
            void name;
        },
    }, {
        lowerCaseTags: true,
        // Preserve attribute case so React-idiomatic attributes like
        // `htmlFor` and `tabIndex` round-trip unchanged.
        lowerCaseAttributeNames: false,
        decodeEntities: true,
        // Generated TSX uses self-closing syntax for empty elements
        // (`<div />`). div isn't a void element in HTML so we have to
        // opt in here.
        recognizeSelfClosing: true,
    });
    parser.write(tsx);
    parser.end();
    for (const el of elements) {
        if (el.range)
            el.range = mapRange(normalized.map, el.range);
    }
    return elements;
};
