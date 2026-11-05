/**
 * Embedded Scamp's shared vocabulary: the properties the inspector reads
 * from the page, how they become declarations Scamp's parser understands,
 * and how a queued edit becomes the agent's instructions. Pure.
 * see docs/plans/embedded-scamp-plan.md
 */
/** Computed properties the inspector reads for the panel. */
export const EMBEDDED_COMPUTED_PROPERTIES = [
    'display', 'position', 'top', 'left', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'align-content', 'row-gap', 'column-gap',
    'grid-template-columns', 'grid-template-rows', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-self',
    'background-color',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-top-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align',
    'text-transform', 'font-style', 'opacity', 'box-shadow', 'overflow-x', 'overflow-y', 'transform', 'z-index',
];
const four = (c, side) => {
    const values = ['top', 'right', 'bottom', 'left'].map((s) => c[side(s)]);
    if (values.some((v) => v === undefined || v === ''))
        return null;
    const [t, r, b, l] = values;
    if (t === r && r === b && b === l)
        return t;
    if (t === b && r === l)
        return `${t} ${r}`;
    return `${t} ${r} ${b} ${l}`;
};
const DROP_WHEN = {
    'box-shadow': ['none'],
    transform: ['none'],
    'z-index': ['auto'],
    'min-width': ['auto', '0px'],
    'min-height': ['auto', '0px'],
    'max-width': ['none'],
    'max-height': ['none'],
    'grid-template-columns': ['none'],
    'grid-template-rows': ['none'],
    'flex-basis': ['auto'],
    'align-self': ['auto'],
    'text-transform': ['none'],
    'font-style': ['normal'],
};
const SINGLE = [
    'display', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'align-content', 'row-gap', 'column-gap',
    'grid-template-columns', 'grid-template-rows', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-self',
    'background-color', 'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
    'text-align', 'text-transform', 'font-style', 'opacity', 'box-shadow', 'transform', 'z-index',
];
/**
 * The page's computed styles as declarations, shorthands where Scamp's
 * parser reads them. Values the browser reports at their default are left
 * out, so the panel shows what the element actually has.
 */
export const computedToDeclarations = (computed) => {
    const out = [];
    const push = (prop, value) => {
        if (value === null || value === undefined || value === '')
            return;
        if (DROP_WHEN[prop]?.includes(value) === true)
            return;
        out.push({ prop, value });
    };
    for (const prop of SINGLE)
        push(prop, computed[prop]);
    push('padding', four(computed, (s) => `padding-${s}`));
    push('margin', four(computed, (s) => `margin-${s}`));
    const borderWidth = four(computed, (s) => `border-${s}-width`);
    if (borderWidth !== null && borderWidth !== '0px' && computed['border-top-style'] !== 'none') {
        push('border-width', borderWidth);
        push('border-style', computed['border-top-style']);
        push('border-color', computed['border-top-color']);
    }
    const radius = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((c) => computed[`border-${c}-radius`] ?? '0px');
    if (radius.some((r) => r !== '0px'))
        push('border-radius', radius.every((r) => r === radius[0]) ? radius[0] : radius.join(' '));
    const position = computed['position'];
    if (position === 'absolute' || position === 'fixed') {
        push('position', position);
        push('left', computed['left']);
        push('top', computed['top']);
    }
    else if (position === 'relative' || position === 'sticky') {
        push('position', position);
    }
    if (computed['overflow-x'] === computed['overflow-y'] && computed['overflow-x'] !== 'visible')
        push('overflow', computed['overflow-x']);
    return out;
};
const IDIOM_RULES = {
    tailwind: 'This project styles with Tailwind: change utility classes in `className`, using its theme scale (for example `p-6`, not `p-[24px]`, when 24px is on the scale).',
    'css-modules': 'This project uses CSS Modules: change the rule for the element’s class in its `*.module.css` file, not inline styles.',
    'styled-components': 'This project uses styled-components or Emotion: change the styled definition, not inline styles.',
    'plain-css': 'This project uses plain CSS: change the rule for the element’s class in its stylesheet.',
};
const describeElement = (el) => {
    const lines = [
        `- Element: <${el.tag}>${el.classes.length > 0 ? ` with class \`${el.classes.join(' ')}\`` : ''}${el.text.length > 0 ? `, text “${el.text}”` : ''}`,
        `- Written at: ${el.source ?? 'not mapped. Find it: search the project for its classes, its text and the component names below'}`,
        `- On the page: \`${el.page}\`, at \`${el.selector}\``,
    ];
    if (el.components.length > 0)
        lines.push(`- Inside components: ${el.components.join(' › ')}`);
    if (el.usedAt !== null)
        lines.push(`- That component is used at: ${el.usedAt}`);
    if (el.library !== null) {
        lines.push(`- Drawn by ${el.library}, a library. Never edit \`node_modules\`: style it from the project's code that renders it (a \`className\`, prop or \`style\` on the component, or a rule in the project's styles that targets it).`);
    }
    if (el.instanceCount > 1)
        lines.push(`- The same JSX draws ${el.instanceCount} elements on this page.`);
    return lines.join('\n');
};
const scopeLine = (scope, el) => scope === 'all'
    ? 'Scope: every instance. Change the shared definition, so all of them change.'
    : el !== null && el.instanceCount > 1
        ? 'Scope: this instance only. Leave the other instances as they are: override it where this one is used (a prop, a modifier class, or the call site), not in the shared definition.'
        : 'Scope: this element.';
/** One queued edit, as the agent reads it. */
export const describeQueueItem = (item, index) => {
    if (item.kind === 'style') {
        const changes = item.changes.map((c) => `  - \`${c.property}\`: ${c.from === '' ? '(not set)' : `\`${c.from}\``} → \`${c.to}\``).join('\n');
        const state = item.state === undefined ? '' : `\n- State: \`:${item.state}\`. Style the element only while it's in that state (a \`:${item.state}\` rule, or Tailwind's \`${item.state}:\` prefix), leaving its normal styles as they are.`;
        return `### Edit ${index + 1}: style${item.state === undefined ? '' : ` (:${item.state})`}\n${describeElement(item.element)}\n- ${scopeLine(item.scope, item.element)}${state}\n- Change:\n${changes}`;
    }
    const where = item.element !== null ? `${describeElement(item.element)}\n- ${scopeLine(item.scope, item.element)}\n` : '';
    return `### Edit ${index + 1}: instruction\n${where}- Do this: ${item.text}`;
};
/** A batch of queued edits as one message to the agent. */
export const buildAgentPrompt = (items, idioms) => {
    const rules = idioms.map((i) => `- ${IDIOM_RULES[i]}`).join('\n');
    return [
        `Make ${items.length === 1 ? 'this change' : `these ${items.length} changes`} in the project's source, as the user made ${items.length === 1 ? 'it' : 'them'} visually on the running app.`,
        'The user saw the result live already; write it so it holds after a reload.',
        '',
        'How this project writes styles:',
        rules,
        '',
        ...items.map(describeQueueItem),
        '',
        'Read the file at each source location first. Make the smallest edit that produces each change, then stop. If an element can’t be changed safely (it comes from a library, or from data), say so instead of guessing.',
    ].join('\n');
};
/** A route path needs values filled in: `:id` (React Router) or `[id]` (Next.js). */
export const routeHasParams = (path) => /\/:|\[/.test(path);
/** Known routes plus newly found ones: one each, pages before parameterised paths, then alphabetical. */
export const mergeRoutes = (known, found, limit = 300) => {
    const all = new Set();
    for (const raw of [...known, ...found]) {
        const path = raw.trim().replace(/(.)\/+$/, '$1').split(/[?#]/)[0] ?? '';
        if (path.startsWith('/') && !path.startsWith('//') && !path.includes('*'))
            all.add(path);
    }
    return [...all]
        .sort((a, b) => Number(routeHasParams(a)) - Number(routeHasParams(b)) || a.localeCompare(b))
        .slice(0, limit);
};
/** Messages from the inspector arrive as console lines starting with this. */
export const INSPECTOR_PREFIX = '__scamp_inspector__';
/**
 * Runs IN the page, installed by `webview.executeJavaScript`. Must be
 * self-contained: it's sent as source text, so it can reference nothing
 * outside itself. Idempotent: a second install only updates the config.
 *
 * - **Edit mode** outlines what's under the pointer and selects on click;
 *   the page's own pointer events are swallowed, so a click selects
 *   instead of navigating, and an open menu isn't "clicked outside".
 * - **Freeze** swallows the events transient UI closes on (leave, blur,
 *   Escape), and marks what's under the pointer for a forced `:hover` (and
 *   what has focus for `:focus`), which main applies through the debugger
 *   protocol, so CSS-only hover UI holds too. F8 toggles it from the page.
 * - **States** force a pseudo-class on the selection; an edit made in one
 *   previews as a `:hover` (or `:focus`, `:active`) rule, not inline.
 * - **Apply** sets layer-1 styles inline (`!important`), remembering what
 *   was there so `clear` puts it back.
 * - **Tree** returns the page as a tree of ids, for the layers panel.
 */
export const installInspector = (config) => {
    const w = window;
    if (w.__scampInspector !== undefined) {
        w.__scampInspector.config = config;
        return;
    }
    const FORCE_ATTR = 'data-scamp-force';
    const UID_ATTR = 'data-scamp-uid';
    const state = {
        edit: false,
        frozen: false,
        pointer: null,
        hovered: null,
        treeHover: null,
        selected: null,
        selectedKey: null,
        selectedIndex: 0,
        overrides: new Map(),
        frozenForce: new Map(),
        panelForce: null,
        forcedNow: new Set(),
        rules: new Map(),
    };
    let api;
    const send = (msg) => {
        console.debug(api.config.prefix + JSON.stringify(msg));
    };
    const box = (dashed) => {
        const d = document.createElement('div');
        d.setAttribute('data-scamp-overlay', '');
        d.style.cssText =
            'position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;display:none;' +
                `border:2px ${dashed ? 'dashed' : 'solid'} #4a8cff;border-radius:2px;`;
        return d;
    };
    const hoverBox = box(true);
    const selectBox = box(false);
    const label = document.createElement('div');
    label.setAttribute('data-scamp-overlay', '');
    label.style.cssText =
        'position:fixed;pointer-events:none;z-index:2147483647;display:none;background:#4a8cff;color:#fff;' +
            'font:11px/16px system-ui,sans-serif;padding:0 6px;border-radius:3px;white-space:nowrap;';
    const preview = document.createElement('style');
    preview.setAttribute('data-scamp-overlay', '');
    document.documentElement.append(hoverBox, selectBox, label, preview);
    // Ids for the layers tree, kept off the DOM.
    let nextUid = 1;
    const uids = new WeakMap();
    const byUid = new Map();
    const uidOf = (el) => {
        let id = uids.get(el);
        if (id === undefined) {
            id = `n${nextUid++}`;
            uids.set(el, id);
            byUid.set(id, new WeakRef(el));
        }
        return id;
    };
    const fiberOf = (el) => {
        const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
        return key === undefined ? undefined : el[key];
    };
    const INTERNAL = /\/node_modules\/(react|react-dom|scheduler|next)\/|node_modules_(react|next)[_.]|\/next\/dist\/|react-dom|react-server-dom|jsx-dev-runtime|jsx-runtime|\[turbopack\]|<anonymous>/;
    /** Where React says the element's JSX is, for an element Scamp couldn't tag at build time. */
    const rawSourceOf = (el) => {
        const fiber = fiberOf(el);
        const ds = fiber?._debugSource;
        if (ds !== undefined && ds !== null)
            return { kind: 'file', path: ds.fileName, line: ds.lineNumber, column: ds.columnNumber ?? 0 };
        const stack = fiber?._debugStack?.stack ?? '';
        for (const line of stack.split('\n').slice(1)) {
            const m = /(?:\(|\bat\s+)([^()\s]+):(\d+):(\d+)\)?\s*$/.exec(line);
            if (m === null || INTERNAL.test(m[1] ?? ''))
                continue;
            return { kind: 'frame', url: m[1] ?? '', line: Number(m[2]), column: Number(m[3]) };
        }
        return null;
    };
    /** One string for "the same line of JSX", tagged or not. */
    const keyOf = (el) => {
        const attr = el.getAttribute(api.config.attr);
        if (attr !== null)
            return attr;
        const raw = rawSourceOf(el);
        return raw === null ? null : raw.kind === 'frame' ? `${raw.url}:${raw.line}:${raw.column}` : `${raw.path}:${raw.line}:${raw.column}`;
    };
    const sameSource = (el) => {
        const attr = el.getAttribute(api.config.attr);
        if (attr !== null)
            return Array.from(document.querySelectorAll(`[${api.config.attr}="${CSS.escape(attr)}"]`));
        const key = keyOf(el);
        if (key === null)
            return el instanceof HTMLElement ? [el] : [];
        return Array.from(document.getElementsByTagName(el.tagName)).filter((o) => o instanceof HTMLElement && keyOf(o) === key);
    };
    const componentsOf = (el) => {
        const names = [];
        let fiber = fiberOf(el);
        for (let i = 0; fiber && i < 200 && names.length < 6; i += 1, fiber = fiber.return) {
            const t = fiber.type;
            if (t === undefined || t === null || typeof t === 'string')
                continue;
            const name = (typeof t === 'function' ? t.displayName ?? t.name : t.displayName ?? t.render?.name) ?? '';
            if (/^[A-Z]/.test(name) && names[names.length - 1] !== name)
                names.push(name);
        }
        return names;
    };
    /** The component this element is the outermost DOM node of, if any. */
    const rootComponentOf = (el) => {
        let found = null;
        let fiber = fiberOf(el)?.return;
        for (let i = 0; fiber && i < 50; i += 1, fiber = fiber.return) {
            if (typeof fiber.type === 'string')
                break;
            const t = fiber.type;
            const name = t === undefined || t === null ? '' : (t.displayName ?? t.name ?? '');
            if (/^[A-Z]/.test(name))
                found = name;
        }
        return found;
    };
    const short = (el) => {
        const cls = Array.from(el.classList)[0];
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : cls !== undefined ? `.${cls}` : ''}`;
    };
    const heldList = () => Array.from(state.forcedNow).map((el) => ({ label: short(el), states: (el.getAttribute(FORCE_ATTR) ?? '').split(',').filter((x) => x.length > 0) }));
    /** Mark what's forced, for main to apply; tell the window what's held. */
    const syncForce = () => {
        const wanted = new Map();
        for (const [el, states] of state.frozenForce)
            wanted.set(el, new Set(states));
        if (state.panelForce !== null && state.panelForce.state !== 'none') {
            const set = wanted.get(state.panelForce.el) ?? new Set();
            set.add(state.panelForce.state);
            wanted.set(state.panelForce.el, set);
        }
        for (const el of state.forcedNow)
            if (!wanted.has(el))
                el.removeAttribute(FORCE_ATTR);
        state.forcedNow = new Set();
        for (const [el, set] of wanted) {
            if (!el.isConnected)
                continue;
            el.setAttribute(FORCE_ATTR, [...set].join(','));
            state.forcedNow.add(el);
        }
        send({ type: 'forced', held: heldList() });
    };
    const describe = (el) => {
        const attr = el.getAttribute(api.config.attr);
        const raw = attr === null ? rawSourceOf(el) : null;
        const src = attr ?? null;
        const file = src === null ? null : src.replace(/:\d+:\d+$/, '');
        let usedAt = null;
        for (let a = el.parentElement; a !== null && usedAt === null; a = a.parentElement) {
            const s = a.getAttribute(api.config.attr);
            if (s !== null && s.replace(/:\d+:\d+$/, '') !== file)
                usedAt = s;
        }
        const computed = {};
        const cs = getComputedStyle(el);
        for (const p of api.config.properties)
            computed[p] = cs.getPropertyValue(p);
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        const where = src ?? (raw === null ? '' : raw.kind === 'frame' ? raw.url : raw.path);
        const library = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(where)?.[1] ?? null;
        const chain = [];
        for (let a = el; a !== null && a !== document.body && chain.length < 5; a = a.parentElement)
            chain.unshift(short(a));
        return {
            type: 'select',
            uid: uidOf(el),
            raw,
            element: {
                source: library === null ? src : null,
                library,
                page: location.pathname,
                selector: chain.join(' > '),
                tag: el.tagName.toLowerCase(),
                classes: Array.from(el.classList),
                components: componentsOf(el),
                instanceCount: sameSource(el).length || 1,
                usedAt,
                text: text.length > 60 ? `${text.slice(0, 57)}…` : text,
            },
            computed,
            parentDisplay: el.parentElement === null ? 'block' : getComputedStyle(el.parentElement).display,
            textOnly: el.children.length === 0 && text.length > 0,
        };
    };
    const select = (el) => {
        if (state.panelForce !== null && state.panelForce.el !== el) {
            state.panelForce = null;
            syncForce();
        }
        state.selected = el;
        state.selectedKey = keyOf(el);
        state.selectedIndex = Math.max(0, sameSource(el).indexOf(el));
        send(describe(el));
    };
    const place = (target, el) => {
        if (el === null || !el.isConnected) {
            target.style.display = 'none';
            return;
        }
        const r = el.getBoundingClientRect();
        target.style.display = 'block';
        target.style.left = `${r.left}px`;
        target.style.top = `${r.top}px`;
        target.style.width = `${r.width}px`;
        target.style.height = `${r.height}px`;
    };
    const tick = () => {
        // A hot reload can replace the selected node: find it again from its source line.
        if (state.selected !== null && !state.selected.isConnected && state.selectedKey !== null) {
            const key = state.selectedKey;
            const again = Array.from(document.querySelectorAll('*')).filter((o) => keyOf(o) === key)[state.selectedIndex] ?? null;
            state.selected = again;
            if (again !== null)
                send(describe(again));
        }
        const hover = state.treeHover ?? (state.edit && state.hovered !== state.selected ? state.hovered : null);
        place(hoverBox, hover);
        place(selectBox, state.selected);
        if (state.selected !== null && state.selected.isConnected) {
            const r = state.selected.getBoundingClientRect();
            const src = state.selected.getAttribute(api.config.attr);
            label.textContent = `${state.selected.tagName.toLowerCase()}${src !== null ? `  ${src.replace(/:\d+$/, '')}` : ''}`;
            label.style.display = 'block';
            label.style.left = `${Math.max(0, r.left)}px`;
            label.style.top = `${Math.max(0, r.top - 18)}px`;
        }
        else {
            label.style.display = 'none';
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const isOverlay = (t) => t instanceof Element && t.hasAttribute('data-scamp-overlay');
    const swallow = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
    };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu', 'auxclick']) {
        window.addEventListener(type, (e) => {
            if (state.edit)
                swallow(e);
        }, true);
    }
    window.addEventListener('click', (e) => {
        if (!state.edit)
            return;
        swallow(e);
        const target = e.target;
        if (!(target instanceof Element) || isOverlay(target))
            return;
        select(target);
    }, true);
    window.addEventListener('pointermove', (e) => {
        const t = e.target;
        state.pointer = t instanceof Element && !isOverlay(t) ? t : null;
        if (state.edit)
            state.hovered = state.pointer;
    }, true);
    for (const type of ['mouseleave', 'mouseout', 'pointerleave', 'pointerout', 'blur', 'focusout', 'visibilitychange']) {
        const handler = (e) => {
            if (state.frozen)
                e.stopImmediatePropagation();
        };
        window.addEventListener(type, handler, true);
        document.addEventListener(type, handler, true);
    }
    /** Freeze: hold leave and blur, and force what's hovered and focused as it is now. */
    const setFrozen = (on) => {
        state.frozen = on;
        state.frozenForce = new Map();
        if (on) {
            for (let el = state.pointer; el !== null && el !== document.documentElement; el = el.parentElement) {
                state.frozenForce.set(el, ['hover']);
            }
            const active = document.activeElement;
            if (active !== null && active !== document.body) {
                state.frozenForce.set(active, [...(state.frozenForce.get(active) ?? []), 'focus', 'focus-visible']);
                for (let el = active.parentElement; el !== null && el !== document.documentElement; el = el.parentElement) {
                    state.frozenForce.set(el, [...(state.frozenForce.get(el) ?? []), 'focus-within']);
                }
            }
        }
        syncForce();
    };
    window.addEventListener('keydown', (e) => {
        // F8 freezes without moving the pointer off the page, which would close
        // a menu that closes on leave before the toolbar could be reached.
        if (e.key === 'F8' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
            swallow(e);
            setFrozen(!state.frozen);
            send({ type: 'freeze', on: state.frozen });
            return;
        }
        if ((state.frozen || state.edit) && e.key === 'Escape')
            swallow(e);
    }, true);
    const targets = (scope) => {
        const sel = state.selected;
        if (!(sel instanceof HTMLElement))
            return [];
        return scope === 'all' ? sameSource(sel) : [sel];
    };
    /** The selector a state's preview rule uses for the edit's targets. */
    const stateSelector = (scope, pseudo) => {
        const sel = state.selected;
        if (sel === null)
            return null;
        const attr = sel.getAttribute(api.config.attr);
        if (scope === 'all' && attr !== null)
            return `[${api.config.attr}="${CSS.escape(attr)}"]:${pseudo}`;
        const ids = targets(scope).map((el) => {
            const id = uidOf(el);
            el.setAttribute(UID_ATTR, id);
            return `[${UID_ATTR}="${id}"]:${pseudo}`;
        });
        return ids.length === 0 ? null : ids.join(', ');
    };
    const writeRules = () => {
        preview.textContent = Array.from(state.rules)
            .map(([selector, props]) => `${selector} { ${Object.entries(props).map(([p, v]) => `${p}: ${v} !important;`).join(' ')} }`)
            .join('\n');
    };
    const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META']);
    const MAX_NODES = 3000;
    const tree = () => {
        let count = 0;
        const build = (el, depth) => {
            count += 1;
            const children = Array.from(el.children).filter((c) => !SKIP.has(c.tagName) && !isOverlay(c));
            const kids = [];
            let more = 0;
            for (const child of children) {
                if (count >= MAX_NODES || depth > 60)
                    more += 1;
                else
                    kids.push(build(child, depth + 1));
            }
            const src = el.getAttribute(api.config.attr);
            const text = children.length === 0 ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
            return {
                id: uidOf(el),
                tag: el.tagName.toLowerCase(),
                cls: Array.from(el.classList).join(' ').slice(0, 80),
                comp: rootComponentOf(el),
                src: src === null ? null : (src.split('/').pop() ?? src).replace(/:\d+$/, ''),
                text: text.length > 40 ? `${text.slice(0, 37)}…` : text,
                kids,
                more,
            };
        };
        return build(document.body, 0);
    };
    // The tree goes stale as the page renders: say so, and the window asks again.
    let treeTimer = null;
    new MutationObserver((records) => {
        if (records.every((r) => isOverlay(r.target) || Array.from(r.addedNodes).every(isOverlay)))
            return;
        if (treeTimer !== null)
            clearTimeout(treeTimer);
        treeTimer = setTimeout(() => send({ type: 'treeChanged' }), 400);
    }).observe(document.body, { childList: true, subtree: true });
    api = {
        config,
        tree,
        run: (raw) => {
            const cmd = raw;
            const pseudo = cmd.state ?? 'none';
            if (cmd.type === 'edit') {
                state.edit = cmd.on === true;
                if (!state.edit)
                    state.hovered = null;
            }
            else if (cmd.type === 'freeze') {
                setFrozen(cmd.on === true);
            }
            else if (cmd.type === 'deselect') {
                state.selected = null;
                state.selectedKey = null;
                if (state.panelForce !== null) {
                    state.panelForce = null;
                    syncForce();
                }
            }
            else if (cmd.type === 'state') {
                state.panelForce = state.selected === null || pseudo === 'none' ? null : { el: state.selected, state: pseudo };
                syncForce();
            }
            else if (cmd.type === 'release') {
                state.frozen = false;
                state.frozenForce = new Map();
                state.panelForce = null;
                syncForce();
                send({ type: 'freeze', on: false });
            }
            else if (cmd.type === 'reselect') {
                if (state.selected !== null && state.selected.isConnected)
                    send(describe(state.selected));
            }
            else if (cmd.type === 'selectId') {
                const el = byUid.get(cmd.id ?? '')?.deref();
                if (el !== undefined && el.isConnected) {
                    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    select(el);
                }
            }
            else if (cmd.type === 'hoverId') {
                state.treeHover = cmd.id === null ? null : (byUid.get(cmd.id ?? '')?.deref() ?? null);
            }
            else if (cmd.type === 'apply') {
                if (pseudo !== 'none') {
                    const selector = stateSelector(cmd.scope ?? 'instance', pseudo);
                    if (selector !== null)
                        state.rules.set(selector, { ...(state.rules.get(selector) ?? {}), ...(cmd.styles ?? {}) });
                    writeRules();
                    return;
                }
                for (const el of targets(cmd.scope ?? 'instance')) {
                    const saved = state.overrides.get(el) ?? new Map();
                    for (const [prop, value] of Object.entries(cmd.styles ?? {})) {
                        if (!saved.has(prop))
                            saved.set(prop, { value: el.style.getPropertyValue(prop), priority: el.style.getPropertyPriority(prop) });
                        el.style.setProperty(prop, value, 'important');
                    }
                    state.overrides.set(el, saved);
                }
            }
            else if (cmd.type === 'restore') {
                const props = cmd.properties ?? [];
                if (pseudo !== 'none') {
                    for (const [selector, rule] of state.rules) {
                        if (!selector.endsWith(`:${pseudo}`) && !selector.includes(`:${pseudo},`))
                            continue;
                        for (const prop of props)
                            delete rule[prop];
                        if (Object.keys(rule).length === 0)
                            state.rules.delete(selector);
                    }
                    writeRules();
                    return;
                }
                // Back to what the page had, for properties an edit returned to their start.
                for (const el of targets('all').concat(targets('instance'))) {
                    const saved = state.overrides.get(el);
                    if (saved === undefined)
                        continue;
                    for (const prop of props) {
                        const was = saved.get(prop);
                        if (was === undefined)
                            continue;
                        if (was.value === '')
                            el.style.removeProperty(prop);
                        else
                            el.style.setProperty(prop, was.value, was.priority);
                        saved.delete(prop);
                    }
                }
            }
            else if (cmd.type === 'clear') {
                for (const [el, saved] of state.overrides) {
                    for (const [prop, was] of saved) {
                        if (was.value === '')
                            el.style.removeProperty(prop);
                        else
                            el.style.setProperty(prop, was.value, was.priority);
                    }
                }
                state.overrides.clear();
                state.rules.clear();
                writeRules();
            }
        },
    };
    w.__scampInspector = api;
};
/** The source text that installs the inspector, then runs `cmd` if given. */
export const inspectorScript = (config, cmd) => `(${installInspector.toString()})(${JSON.stringify(config)});` +
    (cmd === undefined ? '' : `window.__scampInspector.run(${JSON.stringify(cmd)});`);
/** The source text that returns the page's tree, installing the inspector first. */
export const inspectorTreeScript = (config) => `(${installInspector.toString()})(${JSON.stringify(config)}); window.__scampInspector.tree();`;
