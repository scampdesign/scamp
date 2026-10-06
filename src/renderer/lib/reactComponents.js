// @lib/reactComponents.ts — a React app's components, found in its imported views.
//
// A React import captures every route as its own view, so a sidebar the
// app renders on every page arrives as eighteen copies. React itself says
// which elements each component instance drew (`CapturedReact.owners`,
// read in the capture). This groups the instances of one component that
// look alike across all the views, makes each group one Scamp component,
// and puts an instance where each copy was.
//
// Pure. The app window runs it when a multi-page import finishes.
// see docs/plans/react-import-plan.md
import { makeInstanceElement } from './componentInstance';
import { ROOT_ELEMENT_ID } from './element';
/**
 * An instance's elements, preorder, and the places holding children it
 * doesn't own. At a position in `absorbAt`, those children are taken in
 * as its own: content every copy has the same isn't the page's to fill.
 */
const collect = (elements, rootId, owns, absorbAt = new Set()) => {
    const members = [];
    const slotPlaces = [];
    const walk = (id, forced) => {
        const index = members.length;
        members.push(id);
        const el = elements[id];
        const take = forced || absorbAt.has(index);
        const parts = [];
        let slot = false;
        for (const childId of el?.childIds ?? []) {
            if (take || owns(childId))
                parts.push(walk(childId, forced || (take && !owns(childId))));
            else
                slot = true;
        }
        if (slot)
            slotPlaces.push(index);
        return `${el?.type ?? '?'}:${el?.tag ?? ''}${slot ? '{slot}' : ''}[${parts.join(',')}]`;
    };
    const signature = walk(rootId, false);
    return { members, slotPlaces, signature };
};
/** A subtree's look and words, as a comparable string. */
const contentKey = (elements, id) => {
    const el = elements[id];
    if (el === undefined)
        return '';
    return `${styleKey(el)}|${el.text ?? ''}[${el.childIds.map((c) => contentKey(elements, c)).join(',')}]`;
};
const FIELDS_NOT_STYLE = new Set(['id', 'parentId', 'childIds', 'text', 'x', 'y', 'name', 'prop']);
/** Each axis's size, settled apart from the rest of an element's look. */
const SIZE_FIELDS = {
    width: ['widthMode', 'widthValue', 'widthCustom'],
    height: ['heightMode', 'heightValue', 'heightCustom'],
};
const ALL_SIZE_FIELDS = new Set([...SIZE_FIELDS.width, ...SIZE_FIELDS.height]);
/**
 * One size for every copy. A size the copies share is the component's;
 * one that differs is each page's content showing through — a shell as
 * tall as its page, a breadcrumb as wide as its words — and pinning one
 * page's number on all of them clips or stretches the rest. So it goes
 * back to the content: `auto`, or `stretch` where any copy filled.
 */
const settleSize = (elements, axis) => {
    const [modeField, valueField, customField] = SIZE_FIELDS[axis];
    const keyOf = (el) => JSON.stringify([el[modeField], el[modeField] === 'fixed' ? el[valueField] : null, el[customField] ?? null]);
    const first = elements[0];
    if (first === undefined || elements.every((el) => keyOf(el) === keyOf(first)))
        return {};
    const stretched = elements.some((el) => el[modeField] === 'stretch');
    return { [modeField]: stretched ? 'stretch' : 'auto', [customField]: undefined };
};
/** Everything about an element's look, as a comparable string. */
const styleKey = (el) => {
    const out = {};
    for (const key of Object.keys(el).sort()) {
        if (!FIELDS_NOT_STYLE.has(key) && !ALL_SIZE_FIELDS.has(key))
            out[key] = el[key];
    }
    return JSON.stringify(out);
};
/** Fields that only paint: they change how an element looks, not where anything goes. */
const PAINT_FIELDS = new Set(['backgroundColor', 'borderColor', 'color', 'opacity', 'fontWeight', 'fill', 'stroke', 'boxShadows']);
/** Attributes you can see: a different one is a different look, not a different state. */
const VISIBLE_ATTRIBUTES = new Set(['src', 'srcset', 'alt', 'placeholder', 'value']);
const PAINT_CSS = new Set([
    'color',
    'background',
    'background-color',
    'background-image',
    'border-color',
    'box-shadow',
    'opacity',
    'font-weight',
    'outline',
    'outline-color',
    'text-decoration-line',
    'text-decoration-color',
    'filter',
    'cursor',
    'transition',
    '-webkit-text-fill-color',
]);
/**
 * Whether two looks differ only in paint — the selected nav item's
 * background and weight — and not in anything that moves or sizes.
 */
/** The fields two looks differ in that move or size something; empty when they differ only in paint. */
const layoutDifferences = (a, b) => {
    const ra = a;
    const rb = b;
    const out = [];
    for (const key of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
        if (FIELDS_NOT_STYLE.has(key) || ALL_SIZE_FIELDS.has(key))
            continue;
        if (JSON.stringify(ra[key]) === JSON.stringify(rb[key]))
            continue;
        if (PAINT_FIELDS.has(key))
            continue;
        if (key === 'customProperties') {
            const ca = a.customProperties;
            const cb = b.customProperties;
            for (const prop of new Set([...Object.keys(ca), ...Object.keys(cb)])) {
                if (ca[prop] !== cb[prop] && !PAINT_CSS.has(prop))
                    out.push(prop);
            }
            continue;
        }
        // A `datetime`, an `aria-label` or an `href` differs between copies
        // without changing what anyone sees; a placeholder or an image does.
        if (key === 'attributes') {
            const aa = a.attributes ?? {};
            const ab = b.attributes ?? {};
            for (const name of new Set([...Object.keys(aa), ...Object.keys(ab)])) {
                if (aa[name] !== ab[name] && VISIBLE_ATTRIBUTES.has(name))
                    out.push(name);
            }
            continue;
        }
        out.push(key);
    }
    return out;
};
const classNameOf = (el) => el.name ?? `${el.tag ?? el.type}_${el.id}`;
/** The most common value, and how many share it; ties go to the earliest. */
const majority = (values, keyOf) => {
    const counts = new Map();
    for (const value of values) {
        const key = keyOf(value);
        const seen = counts.get(key);
        if (seen === undefined)
            counts.set(key, { value, count: 1 });
        else
            seen.count += 1;
    }
    let best = null;
    for (const entry of counts.values())
        if (best === null || entry.count > best.count)
            best = entry;
    if (best === null)
        throw new Error('majority of nothing');
    return best;
};
const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;
const RESERVED_PROPS = new Set(['className', 'children', 'key', 'ref', 'style']);
const freeName = (base, taken) => {
    const clean = /^[A-Z][A-Za-z0-9]*$/.test(base) ? base : 'Component';
    let name = clean;
    for (let n = 2; taken.has(name); n += 1)
        name = `${clean}${n}`;
    taken.add(name);
    return name;
};
const ownersOf = (view) => {
    const cache = new Map();
    const resolve = (id) => {
        const known = cache.get(id);
        if (known !== undefined)
            return known;
        const own = view.react[id];
        // Words lifted into their own element carry no annotation: they belong
        // to whoever drew the element they were lifted from.
        const parentId = view.elements[id]?.parentId ?? null;
        const owners = own !== undefined ? own.owners.map((o) => ({ name: o.name, id: String(o.id) })) : parentId === null ? [] : resolve(parentId);
        cache.set(id, owners);
        return owners;
    };
    return resolve;
};
/** Every instance in a view whose root is one element. */
const findInstances = (view, viewIndex, findings) => {
    const ownersAt = ownersOf(view);
    const owns = (id, key) => ownersAt(id).some((o) => o.id === key);
    const roots = new Map();
    for (const [id, el] of Object.entries(view.elements)) {
        if (id === view.rootId || el.parentId === null)
            continue;
        // The nearest owner the parent doesn't share: an element that is the
        // root of several nested instances (`FramedPage` → `AppFrame`) counts
        // for the one that wrote its JSX.
        const parentOwners = new Set(ownersAt(el.parentId).map((o) => o.id));
        const owner = ownersAt(id).find((o) => !parentOwners.has(o.id));
        if (owner === undefined)
            continue;
        const entry = roots.get(owner.id) ?? { name: owner.name, rootIds: [] };
        entry.rootIds.push(id);
        roots.set(owner.id, entry);
    }
    const found = [];
    const fragments = new Map();
    for (const [key, { name, rootIds }] of roots) {
        if (rootIds.length !== 1) {
            fragments.set(name, (fragments.get(name) ?? 0) + 1);
            continue;
        }
        const rootId = rootIds[0];
        const ownsHere = (id) => owns(id, key);
        const { members, slotPlaces, signature } = collect(view.elements, rootId, ownsHere);
        found.push({ view: viewIndex, key: `${viewIndex}:${key}`, name, rootId, owns: ownsHere, members, slotPlaces, signature });
    }
    for (const [name, count] of fragments) {
        findings.push({ component: name, kind: 'fragment', detail: `${count} ${count === 1 ? 'copy' : 'copies'}` });
    }
    return found;
};
/**
 * Plan the components: which groups of copies become one component, what
 * each component looks like, and the views with instances in place of
 * the copies.
 */
export const planReactComponents = (input, options = {}) => {
    const minInstances = options.minInstances ?? 2;
    const minElements = options.minElements ?? 3;
    const taken = new Set(options.takenNames ?? []);
    for (const view of input)
        taken.add(view.name);
    const usedIds = new Set(input.flatMap((v) => Object.keys(v.elements)));
    const nextId = options.randomId ??
        (() => {
            let n = 0;
            return () => {
                n += 1;
                return `r${n.toString(16).padStart(3, '0')}`;
            };
        })();
    const freshId = () => {
        let id = nextId();
        while (usedIds.has(id))
            id = nextId();
        usedIds.add(id);
        return id;
    };
    const views = input.map((v) => ({ ...v, elements: { ...v.elements }, react: { ...v.react } }));
    const components = [];
    const findings = [];
    /** Groups already decided, by name and shape, so a rejected one isn't tried again. */
    const settled = new Set();
    // One group at a time, largest first: the page shell before the buttons
    // inside it, which then belong to its definition.
    for (let round = 0; round < 200; round += 1) {
        const roundFindings = [];
        const all = views.flatMap((view, i) => findInstances(view, i, roundFindings));
        if (round === 0)
            findings.push(...roundFindings);
        const groups = new Map();
        for (const f of all) {
            const id = `${f.name}\u0000${f.signature}`;
            if (settled.has(id))
                continue;
            groups.set(id, [...(groups.get(id) ?? []), f]);
        }
        const next = [...groups.entries()]
            .filter(([, list]) => list.length >= minInstances && (list[0]?.members.length ?? 0) >= minElements)
            .sort((a, b) => (b[1][0]?.members.length ?? 0) - (a[1][0]?.members.length ?? 0))[0];
        if (next === undefined)
            break;
        const [groupId, group] = next;
        settled.add(groupId);
        const head = group[0];
        // Content passed in that is the same in every copy (the same bell in
        // every top bar) is part of the component; content that differs is
        // the page's, and goes in through a slot. One slot at most.
        const absorbAt = new Set();
        const varyingPlaces = [];
        for (const place of head.slotPlaces) {
            const keys = group.map((f) => {
                const elements = views[f.view]?.elements ?? {};
                const at = f.members[place];
                return (elements[at]?.childIds ?? []).filter((c) => !f.owns(c)).map((c) => contentKey(elements, c)).join(';');
            });
            if (keys.every((k) => k === keys[0]))
                absorbAt.add(place);
            else
                varyingPlaces.push(place);
        }
        if (varyingPlaces.length > 1) {
            findings.push({ component: head.name, kind: 'slots', detail: `${varyingPlaces.length} places` });
            continue;
        }
        const slotPlace = varyingPlaces[0];
        let resolved = group.map((f) => {
            const slotId = slotPlace === undefined ? null : f.members[slotPlace];
            const { members } = collect(views[f.view]?.elements ?? {}, f.rootId, f.owns, absorbAt);
            return { ...f, members, slotId };
        });
        let first = resolved[0];
        // A Scamp slot replaces all of its element's children with the page's,
        // so the element can hold nothing of its own beside them.
        const mixed = resolved.some((f) => {
            if (f.slotId === null)
                return false;
            return (views[f.view]?.elements[f.slotId]?.childIds ?? []).some((c) => f.members.includes(c));
        });
        if (mixed) {
            findings.push({ component: head.name, kind: 'slots', detail: 'a place it shares with its own elements' });
            continue;
        }
        if (resolved.some((f) => f.members.some((id) => views[f.view]?.elements[id]?.type === 'component-instance'))) {
            findings.push({ component: head.name, kind: 'nested', detail: `${group.length} copies` });
            continue;
        }
        // Each position's look, settled by the copies that share it.
        const positions = first.members.length;
        const settle = (list) => {
            const chosen = [];
            const varying = [];
            for (let p = 0; p < positions; p += 1) {
                const atP = list.map((f) => views[f.view]?.elements[f.members[p]]);
                const best = majority(atP, styleKey);
                chosen.push({ ...best.value, ...settleSize(atP, 'width'), ...settleSize(atP, 'height') });
                if (best.count < atP.length)
                    varying.push(classNameOf(best.value));
            }
            return { chosen, varying };
        };
        let { chosen, varying } = settle(resolved);
        // A copy that differs only in paint — the selected nav item — takes the
        // common look: that's a state, and a Scamp instance has nowhere to keep
        // one. A copy that differs in layout is a different design under the
        // same name, and stays as it is.
        /** What a copy differs in, element by element, beyond paint. */
        const misfits = (f) => chosen.flatMap((look, p) => {
            const el = views[f.view]?.elements[f.members[p]];
            if (el === undefined || styleKey(el) === styleKey(look))
                return [];
            const fields = layoutDifferences(el, look);
            return fields.length === 0 ? [] : [`${fields.join(', ')} on ${classNameOf(look)}`];
        });
        const compatible = resolved.filter((f) => misfits(f).length === 0);
        if (compatible.length < resolved.length) {
            const example = resolved.map(misfits).find((m) => m.length > 0) ?? [];
            findings.push({
                component: head.name,
                kind: 'too-different',
                detail: `${resolved.length - compatible.length} of ${resolved.length} copies (${example.slice(0, 2).join('; ')})`,
            });
            if (compatible.length < minInstances)
                continue;
            resolved = compatible;
            first = resolved[0];
            ({ chosen, varying } = settle(resolved));
        }
        // Text that differs between copies is a prop. Its name comes from the
        // component's own props when one holds that exact string.
        const propOf = new Map();
        const propNames = new Set();
        for (let p = 0; p < positions; p += 1) {
            if (chosen[p]?.type !== 'text')
                continue;
            const texts = resolved.map((f) => views[f.view]?.elements[f.members[p]]?.text ?? '');
            if (texts.every((t) => t === texts[0]))
                continue;
            const votes = new Map();
            resolved.forEach((f, i) => {
                const props = views[f.view]?.instances[f.key.slice(f.key.indexOf(':') + 1)]?.props ?? {};
                for (const [name, value] of Object.entries(props)) {
                    if (value === texts[i] && IDENTIFIER.test(name) && !RESERVED_PROPS.has(name))
                        votes.set(name, (votes.get(name) ?? 0) + 1);
                }
            });
            const voted = [...votes.entries()].sort((a, b) => b[1] - a[1]).find(([name]) => !propNames.has(name))?.[0];
            let name = voted ?? 'text';
            for (let n = 2; propNames.has(name); n += 1)
                name = `${voted ?? 'text'}${n}`;
            propNames.add(name);
            propOf.set(p, { name, fallback: majority(texts, (t) => t).value });
        }
        // The definition: the commonest look at each position, one copy's ids.
        const componentName = freeName(first.name, taken);
        const idMap = new Map(first.members.map((id, p) => [id, p === 0 ? ROOT_ELEMENT_ID : id]));
        const definition = {};
        first.members.forEach((id, p) => {
            const source = views[first.view]?.elements[id];
            const look = chosen[p];
            const prop = propOf.get(p);
            definition[idMap.get(id)] = {
                ...look,
                id: idMap.get(id),
                parentId: p === 0 ? null : (idMap.get(source.parentId) ?? null),
                childIds: source.childIds.filter((c) => idMap.has(c)).map((c) => idMap.get(c)),
                name: p === 0 ? undefined : source.name,
                ...(source.text !== undefined ? { text: prop?.fallback ?? source.text } : {}),
                ...(prop !== undefined ? { prop: prop.name } : {}),
                ...(id === first.slotId ? { slot: 'children' } : {}),
            };
        });
        // Each copy becomes an instance; the page's own content stays as its children.
        const usedIn = new Set();
        for (const f of resolved) {
            const view = views[f.view];
            if (view === undefined)
                continue;
            const elements = view.elements;
            const root = elements[f.rootId];
            const parent = root?.parentId ? elements[root.parentId] : undefined;
            if (root === undefined || parent === undefined)
                continue;
            const instanceId = freshId();
            const overrides = {};
            for (const [p, prop] of propOf) {
                const text = elements[f.members[p]]?.text ?? '';
                if (text !== prop.fallback)
                    overrides[prop.name] = text;
            }
            const slotted = f.slotId === null ? [] : (elements[f.slotId]?.childIds ?? []).filter((c) => !f.members.includes(c));
            for (const id of f.members)
                delete elements[id];
            // The instance stands for what the copy's root was: same owners, so
            // an enclosing component still sees it as page content or its own.
            const rootReact = view.react[f.rootId];
            if (rootReact !== undefined)
                view.react[instanceId] = rootReact;
            elements[instanceId] = {
                ...makeInstanceElement({ parentId: parent.id, componentName, x: root.x, y: root.y }, instanceId),
                childIds: slotted,
                propOverrides: overrides,
            };
            for (const childId of slotted) {
                const child = elements[childId];
                if (child !== undefined)
                    elements[childId] = { ...child, parentId: instanceId };
            }
            elements[parent.id] = { ...parent, childIds: parent.childIds.map((c) => (c === f.rootId ? instanceId : c)) };
            usedIn.add(view.name);
        }
        if (varying.length > 0) {
            findings.push({ component: componentName, kind: 'style-varies', detail: varying.join(', ') });
        }
        components.push({
            name: componentName,
            elements: definition,
            rootId: ROOT_ELEMENT_ID,
            instances: resolved.length,
            views: [...usedIn],
            props: [...propNames],
        });
    }
    return {
        views: views.map(({ name, elements, rootId }) => ({ name, elements, rootId })),
        components,
        findings,
    };
};
/** A finding in the words the import report uses. */
export const describeReactFinding = (finding) => {
    switch (finding.kind) {
        case 'style-varies':
            return `${finding.component} looks different on some pages (${finding.detail}); the component shows its most common look`;
        case 'too-different':
            return `${finding.detail} of ${finding.component} differ in layout from the rest, so they stay as separate elements`;
        case 'fragment':
            return `${finding.component} draws more than one top-level element (${finding.detail}), so it stays as elements`;
        case 'slots':
            return `${finding.component} takes each page's content in ${finding.detail}, which a Scamp slot can't hold, so it stays as elements`;
        case 'nested':
            return `${finding.component} holds another component this import made, and components inside components aren't made yet`;
    }
};
