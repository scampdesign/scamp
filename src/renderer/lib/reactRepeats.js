// @lib/reactRepeats.ts — a React app's lists, as repeats.
//
// A list the app draws with `.map()` arrives as one element per row: a
// table of 21 claims is 21 copies of the row. React says which siblings
// came from one `.map()` — they share a JSX call site (React 19), or they
// carry the `key` React requires on every element of a list. A run of
// those siblings that look alike becomes ONE element with
// `repeat: { over, as }`, the rows as samples on the root, and whatever
// differs between them — words, an image, a link, an instance's props —
// as row fields.
//
// Pure. Runs after `@lib/reactComponents`, on each view and on each
// component it made.
// see docs/plans/react-import-plan.md, docs/notes/view-bindings.md
/** What a row may differ in; anything else differing means it isn't the same template. */
const ROW_FIELDS_NOT_LOOK = new Set([
    'id',
    'parentId',
    'childIds',
    'text',
    'x',
    'y',
    'name',
    'prop',
    'attributes',
    'propOverrides',
    'src',
    'alt',
    'instanceId',
    'widthMode',
    'widthValue',
    'widthCustom',
    'heightMode',
    'heightValue',
    'heightCustom',
]);
const lookKey = (el) => {
    const out = {};
    for (const key of Object.keys(el).sort()) {
        if (!ROW_FIELDS_NOT_LOOK.has(key))
            out[key] = el[key];
    }
    return JSON.stringify(out);
};
/** The first field a row's look differs from the first row's in, `field on element`; null when none does. */
const lookDifference = (elements, positions) => {
    const template = positions[0] ?? [];
    for (let p = 0; p < template.length; p += 1) {
        const a = elements[template[p]];
        for (const ids of positions.slice(1)) {
            const b = elements[ids[p]];
            for (const key of Object.keys({ ...a, ...b })) {
                if (ROW_FIELDS_NOT_LOOK.has(key))
                    continue;
                if (JSON.stringify(a[key]) !== JSON.stringify(b[key]))
                    return `${key} on ${String(a['name'] ?? a['id'])}`;
            }
        }
    }
    return null;
};
const shapeOf = (elements, id) => {
    const el = elements[id];
    if (el === undefined)
        return '';
    return `${el.type}:${el.tag ?? ''}[${el.childIds.map((c) => shapeOf(elements, c)).join(',')}]`;
};
const preorder = (elements, id, out = []) => {
    out.push(id);
    for (const c of elements[id]?.childIds ?? [])
        preorder(elements, c, out);
    return out;
};
const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;
const RESERVED = new Set(['className', 'children', 'key', 'ref', 'style', 'id']);
/** `dp_nav_label` → `navLabel`; a short leading namespace (`dp`, `os`) is dropped. */
export const fieldNameFrom = (raw, fallback) => {
    const words = (raw ?? '').split(/[^A-Za-z0-9]+/).filter((w) => w.length > 0);
    while (words.length > 1 && (words[0]?.length ?? 0) <= 2)
        words.shift();
    const name = words
        .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join('');
    return IDENTIFIER.test(name) && !RESERVED.has(name) ? name : fallback;
};
const unique = (base, taken) => {
    let name = base;
    for (let n = 2; taken.has(name); n += 1)
        name = `${base}${n}`;
    taken.add(name);
    return name;
};
/**
 * Why these siblings would be one `.map()`, or null when nothing says so:
 * one call site; or a key on each, with one owner writing them all; or
 * each the keyed root of an instance of the same component.
 */
const listSignal = (react, parentOwners) => {
    if (react === undefined)
        return null;
    if (react.site !== undefined)
        return `site:${react.site}`;
    const nearest = react.owners[0];
    if (react.key !== undefined && nearest !== undefined)
        return `key:${nearest.id}`;
    if (nearest !== undefined && nearest.key !== undefined && !parentOwners.has(String(nearest.id))) {
        return `component:${nearest.name}`;
    }
    return null;
};
/** The repeats in one element tree: each run of `.map()` siblings that look alike. */
export const planRepeats = (tree, options = {}) => {
    const elements = { ...tree.elements };
    const repeats = [];
    const skipped = [];
    const root = elements[tree.rootId];
    if (root === undefined)
        return { elements, repeats, skipped };
    const taken = new Set([...(options.takenNames ?? []), ...Object.keys(root.samples ?? {})]);
    const samples = {};
    // Parents first, so a list inside a list's row is seen once the outer
    // one has settled; a run is only ever made of elements still present.
    for (const parentId of preorder(elements, tree.rootId)) {
        const parent = elements[parentId];
        if (parent === undefined || parent.childIds.length < 2)
            continue;
        const parentOwners = new Set((tree.react[parentId]?.owners ?? []).map((o) => String(o.id)));
        // Runs of neighbours with the same signal.
        const runs = [];
        let current = [];
        let currentSignal = null;
        for (const childId of parent.childIds) {
            const signal = listSignal(tree.react[childId], parentOwners);
            if (signal !== null && signal === currentSignal)
                current.push(childId);
            else {
                if (current.length >= 2)
                    runs.push(current);
                current = signal === null ? [] : [childId];
                currentSignal = signal;
            }
        }
        if (current.length >= 2)
            runs.push(current);
        for (const run of runs) {
            const first = run[0];
            const firstReact = tree.react[first];
            // Rows built from one template: the same shape, the same look at
            // every position. A row that differs in look (a status chip's
            // colour) isn't the same template, and the list stays as copies.
            const shape = shapeOf(elements, first);
            const positions = run.map((id) => preorder(elements, id));
            const listLabel = elements[first]?.componentName ?? elements[first]?.name ?? 'list';
            const differs = run.every((id) => shapeOf(elements, id) === shape) ? lookDifference(elements, positions) : 'shape';
            if (differs !== null) {
                skipped.push({ list: listLabel, rows: run.length, differs });
                continue;
            }
            // The list's names: from the source when it was read, else from the row.
            const source = firstReact?.site !== undefined ? options.sources?.[firstReact.site] : undefined;
            const rowWord = fieldNameFrom(elements[first]?.componentName ?? elements[first]?.name, 'item');
            const over = unique(source?.over ?? `${rowWord}s`, taken);
            const as = source?.as !== undefined && source.as !== over ? source.as : rowWord === over ? 'row' : rowWord;
            // What differs between rows becomes a field; what doesn't stays put.
            const fieldNames = new Set();
            const rows = run.map(() => ({}));
            const template = positions[0];
            const patches = new Map();
            const patch = (id, change) => {
                patches.set(id, { ...(patches.get(id) ?? {}), ...change });
            };
            const addField = (base, values) => {
                const name = unique(base, fieldNames);
                values.forEach((v, i) => {
                    rows[i][name] = v;
                });
                return name;
            };
            template.forEach((templateId, p) => {
                const atP = positions.map((ids) => elements[ids[p]]);
                const el = atP[0];
                // Words.
                const texts = atP.map((e) => e.text ?? '');
                if (el.type === 'text' && el.prop === undefined && texts.some((t) => t !== texts[0])) {
                    const field = addField(fieldNameFrom(el.name, 'text'), texts);
                    patch(templateId, { prop: `${as}.${field}`, text: undefined });
                }
                // An instance's props.
                if (el.type === 'component-instance') {
                    const names = new Set(atP.flatMap((e) => Object.keys(e.propOverrides ?? {})));
                    const bind = { ...(el.bind ?? {}) };
                    const overrides = { ...(el.propOverrides ?? {}) };
                    for (const name of names) {
                        const values = atP.map((e) => e.propOverrides?.[name] ?? '');
                        if (values.every((v) => v === values[0]))
                            continue;
                        bind[name] = `${as}.${addField(name, values)}`;
                        delete overrides[name];
                    }
                    if (Object.keys(bind).length > 0)
                        patch(templateId, { bind, propOverrides: overrides });
                }
                // Attributes, and an image's own src and alt.
                const attrNames = new Set(atP.flatMap((e) => Object.keys(e.attributes ?? {})));
                const bind = { ...(patches.get(templateId)?.bind ?? el.bind ?? {}) };
                for (const name of attrNames) {
                    const values = atP.map((e) => e.attributes?.[name] ?? '');
                    if (values.every((v) => v === values[0]))
                        continue;
                    bind[name] = `${as}.${addField(fieldNameFrom(name, 'value'), values)}`;
                }
                for (const typed of ['src', 'alt']) {
                    const values = atP.map((e) => e[typed] ?? '');
                    if (values.every((v) => v === values[0]))
                        continue;
                    bind[typed] = `${as}.${addField(typed, values)}`;
                }
                if (Object.keys(bind).length > 0)
                    patch(templateId, { bind });
                // A size that differs by row is the row's content showing through.
                for (const axis of ['width', 'height']) {
                    const mode = `${axis}Mode`;
                    const value = `${axis}Value`;
                    const keyOf = (e) => `${e[mode]}:${e[mode] === 'fixed' ? e[value] : ''}`;
                    if (atP.some((e) => keyOf(e) !== keyOf(el))) {
                        patch(templateId, {
                            [mode]: atP.some((e) => e[mode] === 'stretch') ? 'stretch' : 'auto',
                            [`${axis}Custom`]: undefined,
                        });
                    }
                }
            });
            if (fieldNames.size === 0) {
                // Rows with nothing to tell them apart: still one template, drawn
                // as many times as the page drew it.
                rows.forEach((row, i) => {
                    row['index'] = i + 1;
                });
                fieldNames.add('index');
            }
            // The key: a field every row holds a different value of, else a number.
            const keyField = [...fieldNames].find((f) => new Set(rows.map((r) => String(r[f]))).size === rows.length);
            if (keyField === undefined)
                rows.forEach((row, i) => (row['id'] = String(i + 1)));
            for (const [id, change] of patches) {
                const el = elements[id];
                if (el !== undefined)
                    elements[id] = { ...el, ...change };
            }
            elements[first] = {
                ...elements[first],
                repeat: { over, as, ...(keyField !== undefined && keyField !== 'id' ? { key: keyField } : {}) },
            };
            for (const ids of positions.slice(1))
                for (const id of ids)
                    delete elements[id];
            const latest = elements[parentId];
            elements[parentId] = { ...latest, childIds: latest.childIds.filter((c) => c === first || !run.includes(c)) };
            samples[over] = rows;
            repeats.push({ over, as, rows: rows.length, fields: [...fieldNames] });
        }
    }
    if (repeats.length > 0) {
        const latestRoot = elements[tree.rootId];
        elements[tree.rootId] = { ...latestRoot, samples: { ...(latestRoot.samples ?? {}), ...samples } };
    }
    return { elements, repeats, skipped };
};
