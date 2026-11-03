import type { EmbeddedEditScope, EmbeddedElementRef, EmbeddedIdiom, EmbeddedQueueItem } from './types';

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
] as const;

const four = (c: Record<string, string>, side: (s: string) => string): string | null => {
  const values = ['top', 'right', 'bottom', 'left'].map((s) => c[side(s)]);
  if (values.some((v) => v === undefined || v === '')) return null;
  const [t, r, b, l] = values as [string, string, string, string];
  if (t === r && r === b && b === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  return `${t} ${r} ${b} ${l}`;
};

const DROP_WHEN: Record<string, ReadonlyArray<string>> = {
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
export const computedToDeclarations = (computed: Record<string, string>): Array<{ prop: string; value: string }> => {
  const out: Array<{ prop: string; value: string }> = [];
  const push = (prop: string, value: string | null | undefined): void => {
    if (value === null || value === undefined || value === '') return;
    if (DROP_WHEN[prop]?.includes(value) === true) return;
    out.push({ prop, value });
  };
  for (const prop of SINGLE) push(prop, computed[prop]);
  push('padding', four(computed, (s) => `padding-${s}`));
  push('margin', four(computed, (s) => `margin-${s}`));
  const borderWidth = four(computed, (s) => `border-${s}-width`);
  if (borderWidth !== null && borderWidth !== '0px' && computed['border-top-style'] !== 'none') {
    push('border-width', borderWidth);
    push('border-style', computed['border-top-style']);
    push('border-color', computed['border-top-color']);
  }
  const radius = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((c) => computed[`border-${c}-radius`] ?? '0px');
  if (radius.some((r) => r !== '0px')) push('border-radius', radius.every((r) => r === radius[0]) ? radius[0] : radius.join(' '));
  const position = computed['position'];
  if (position === 'absolute' || position === 'fixed') {
    push('position', position);
    push('left', computed['left']);
    push('top', computed['top']);
  } else if (position === 'relative' || position === 'sticky') {
    push('position', position);
  }
  if (computed['overflow-x'] === computed['overflow-y'] && computed['overflow-x'] !== 'visible') push('overflow', computed['overflow-x']);
  return out;
};

const IDIOM_RULES: Record<EmbeddedIdiom, string> = {
  tailwind: 'This project styles with Tailwind: change utility classes in `className`, using its theme scale (for example `p-6`, not `p-[24px]`, when 24px is on the scale).',
  'css-modules': 'This project uses CSS Modules: change the rule for the element’s class in its `*.module.css` file, not inline styles.',
  'styled-components': 'This project uses styled-components or Emotion: change the styled definition, not inline styles.',
  'plain-css': 'This project uses plain CSS: change the rule for the element’s class in its stylesheet.',
};

const describeElement = (el: EmbeddedElementRef): string => {
  const lines = [
    `- Element: <${el.tag}>${el.classes.length > 0 ? ` with class \`${el.classes.join(' ')}\`` : ''}${el.text.length > 0 ? `, text “${el.text}”` : ''}`,
    `- Written at: ${el.source ?? 'unknown (Scamp could not map it)'}`,
  ];
  if (el.components.length > 0) lines.push(`- Inside components: ${el.components.join(' › ')}`);
  if (el.usedAt !== null) lines.push(`- That component is used at: ${el.usedAt}`);
  if (el.instanceCount > 1) lines.push(`- The same JSX draws ${el.instanceCount} elements on this page.`);
  return lines.join('\n');
};

const scopeLine = (scope: EmbeddedEditScope, el: EmbeddedElementRef | null): string =>
  scope === 'all'
    ? 'Scope: every instance. Change the shared definition, so all of them change.'
    : el !== null && el.instanceCount > 1
      ? 'Scope: this instance only. Leave the other instances as they are: override it where this one is used (a prop, a modifier class, or the call site), not in the shared definition.'
      : 'Scope: this element.';

/** One queued edit, as the agent reads it. */
export const describeQueueItem = (item: EmbeddedQueueItem, index: number): string => {
  if (item.kind === 'style') {
    const changes = item.changes.map((c) => `  - \`${c.property}\`: ${c.from === '' ? '(not set)' : `\`${c.from}\``} → \`${c.to}\``).join('\n');
    return `### Edit ${index + 1}: style\n${describeElement(item.element)}\n- ${scopeLine(item.scope, item.element)}\n- Change:\n${changes}`;
  }
  const where = item.element !== null ? `${describeElement(item.element)}\n- ${scopeLine(item.scope, item.element)}\n` : '';
  return `### Edit ${index + 1}: instruction\n${where}- Do this: ${item.text}`;
};

/** A batch of queued edits as one message to the agent. */
export const buildAgentPrompt = (items: ReadonlyArray<EmbeddedQueueItem>, idioms: ReadonlyArray<EmbeddedIdiom>): string => {
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

/** Messages from the inspector arrive as console lines starting with this. */
export const INSPECTOR_PREFIX = '__scamp_inspector__';

export type InspectorConfig = {
  prefix: string;
  attr: string;
  properties: ReadonlyArray<string>;
};

export type InspectorCommand =
  | { type: 'edit'; on: boolean }
  | { type: 'freeze'; on: boolean }
  | { type: 'apply'; scope: EmbeddedEditScope; styles: Record<string, string> }
  | { type: 'restore'; scope: EmbeddedEditScope; properties: ReadonlyArray<string> }
  | { type: 'clear' }
  | { type: 'deselect' };

/**
 * Runs IN the page, installed by `webview.executeJavaScript`. Must be
 * self-contained: it's sent as source text, so it can reference nothing
 * outside itself. Idempotent: a second install only updates the config.
 *
 * - **Edit mode** outlines what's under the pointer and selects on click;
 *   the page's own pointer events are swallowed, so a click selects
 *   instead of navigating, and an open menu isn't "clicked outside".
 * - **Freeze** swallows the events transient UI closes on (leave, blur,
 *   Escape), so a popover or tooltip opened by script stays open while
 *   the user moves to the panel. F8 toggles it from inside the page.
 *   CSS `:hover`-only UI can't be held this way: nothing script does
 *   keeps the browser's hover state once the pointer leaves.
 * - **Apply** sets layer-1 styles inline (`!important`), remembering what
 *   was there so `clear` puts it back.
 */
export const installInspector = (config: InspectorConfig): void => {
  type Win = Window & { __scampInspector?: { run: (cmd: unknown) => void; config: InspectorConfig } };
  const w = window as Win;
  if (w.__scampInspector !== undefined) {
    w.__scampInspector.config = config;
    return;
  }
  const state = {
    edit: false,
    frozen: false,
    hovered: null as Element | null,
    selected: null as Element | null,
    selectedSrc: null as string | null,
    selectedIndex: 0,
    overrides: new Map<HTMLElement, Map<string, { value: string; priority: string }>>(),
  };
  const send = (msg: unknown): void => {
    console.debug(api.config.prefix + JSON.stringify(msg));
  };
  const box = (dashed: boolean): HTMLDivElement => {
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
  document.documentElement.append(hoverBox, selectBox, label);

  const srcOf = (el: Element): string | null => {
    const attr = el.getAttribute(api.config.attr);
    if (attr !== null) return attr;
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    type Fiber = { _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number } | null; _debugStack?: { stack?: string } | null };
    const fiber = key === undefined ? undefined : (el as unknown as Record<string, Fiber>)[key];
    const ds = fiber?._debugSource;
    if (ds !== undefined && ds !== null) return `${ds.fileName}:${ds.lineNumber}:${ds.columnNumber ?? 0}`;
    const stack = fiber?._debugStack?.stack ?? '';
    for (const line of stack.split('\n').slice(1)) {
      const m = /\(?(?:https?:\/\/[^/]+)?(\/[^?:)]+)(?:\?[^:)]*)?:(\d+):(\d+)\)?\s*$/.exec(line);
      if (m !== null && !/node_modules|react-dom|react\.development/.test(m[1] ?? '')) return `${(m[1] ?? '').replace(/^\//, '')}:${m[2]}:${m[3]}`;
    }
    return null;
  };
  const componentsOf = (el: Element): string[] => {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    type F = { type?: unknown; return?: F | null };
    let fiber: F | null | undefined = key === undefined ? undefined : (el as unknown as Record<string, F>)[key];
    const names: string[] = [];
    for (let i = 0; fiber && i < 200 && names.length < 6; i += 1, fiber = fiber.return) {
      const t = fiber.type as { displayName?: string; name?: string; render?: { name?: string } } | string | undefined;
      if (t === undefined || t === null || typeof t === 'string') continue;
      const name = (typeof t === 'function' ? (t as { displayName?: string }).displayName ?? (t as { name?: string }).name : t.displayName ?? t.render?.name) ?? '';
      if (/^[A-Z]/.test(name) && names[names.length - 1] !== name) names.push(name);
    }
    return names;
  };
  const sameSource = (src: string): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>(`[${api.config.attr}="${CSS.escape(src)}"]`));

  const describe = (el: Element): unknown => {
    const src = srcOf(el);
    const file = src === null ? null : src.replace(/:\d+:\d+$/, '');
    let usedAt: string | null = null;
    for (let a = el.parentElement; a !== null && usedAt === null; a = a.parentElement) {
      const s = a.getAttribute(api.config.attr);
      if (s !== null && s.replace(/:\d+:\d+$/, '') !== file) usedAt = s;
    }
    const computed: Record<string, string> = {};
    const cs = getComputedStyle(el);
    for (const p of api.config.properties) computed[p] = cs.getPropertyValue(p);
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const library = src !== null && src.includes('node_modules/') ? (/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(src)?.[1] ?? 'a library') : null;
    return {
      type: 'select',
      element: {
        source: src,
        unmappable:
          src === null
            ? 'Scamp couldn’t find where this element is written. It may be drawn by a library or by code Scamp can’t read.'
            : library !== null
              ? `This element comes from ${library}, so it can’t be edited here. Select the element of yours that uses it.`
              : null,
        tag: el.tagName.toLowerCase(),
        classes: Array.from(el.classList),
        components: componentsOf(el),
        instanceCount: src !== null && el.hasAttribute(api.config.attr) ? sameSource(src).length : 1,
        usedAt,
        text: text.length > 60 ? `${text.slice(0, 57)}…` : text,
      },
      computed,
      parentDisplay: el.parentElement === null ? 'block' : getComputedStyle(el.parentElement).display,
      textOnly: el.children.length === 0 && text.length > 0,
    };
  };

  const place = (target: HTMLElement, el: Element | null): void => {
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
  const tick = (): void => {
    // A hot reload can replace the selected node: find it again from its source line.
    if (state.selected !== null && !state.selected.isConnected && state.selectedSrc !== null) {
      const again = sameSource(state.selectedSrc)[state.selectedIndex] ?? null;
      state.selected = again;
      if (again !== null) send(describe(again));
    }
    place(hoverBox, state.edit && state.hovered !== state.selected ? state.hovered : null);
    place(selectBox, state.selected);
    if (state.selected !== null && state.selected.isConnected) {
      const r = state.selected.getBoundingClientRect();
      const src = srcOf(state.selected);
      label.textContent = `${state.selected.tagName.toLowerCase()}${src !== null ? `  ${src.replace(/:\d+$/, '')}` : ''}`;
      label.style.display = 'block';
      label.style.left = `${Math.max(0, r.left)}px`;
      label.style.top = `${Math.max(0, r.top - 18)}px`;
    } else {
      label.style.display = 'none';
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const isOverlay = (t: EventTarget | null): boolean => t instanceof Element && t.hasAttribute('data-scamp-overlay');
  const swallow = (e: Event): void => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu', 'auxclick']) {
    window.addEventListener(type, (e) => {
      if (state.edit) swallow(e);
    }, true);
  }
  window.addEventListener('click', (e) => {
    if (!state.edit) return;
    swallow(e);
    const target = e.target;
    if (!(target instanceof Element) || isOverlay(target)) return;
    state.selected = target;
    state.selectedSrc = target.getAttribute(api.config.attr);
    state.selectedIndex = state.selectedSrc === null ? 0 : Math.max(0, sameSource(state.selectedSrc).indexOf(target as HTMLElement));
    send(describe(target));
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (!state.edit) return;
    const t = e.target;
    state.hovered = t instanceof Element && !isOverlay(t) ? t : null;
  }, true);
  for (const type of ['mouseleave', 'mouseout', 'pointerleave', 'pointerout', 'blur', 'focusout', 'visibilitychange']) {
    const handler = (e: Event): void => {
      if (state.frozen) e.stopImmediatePropagation();
    };
    window.addEventListener(type, handler, true);
    document.addEventListener(type, handler, true);
  }
  window.addEventListener('keydown', (e) => {
    // F8 freezes without moving the pointer off the page, which would close
    // a menu that closes on leave before the toolbar could be reached.
    if (e.key === 'F8' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      swallow(e);
      state.frozen = !state.frozen;
      send({ type: 'freeze', on: state.frozen });
      return;
    }
    if ((state.frozen || state.edit) && e.key === 'Escape') swallow(e);
  }, true);

  const targets = (scope: string): HTMLElement[] => {
    const sel = state.selected;
    if (!(sel instanceof HTMLElement)) return [];
    const src = sel.getAttribute(api.config.attr);
    return scope === 'all' && src !== null ? sameSource(src) : [sel];
  };
  const api = {
    config,
    run: (raw: unknown): void => {
      const cmd = raw as { type: string; on?: boolean; scope?: string; styles?: Record<string, string> };
      if (cmd.type === 'edit') {
        state.edit = cmd.on === true;
        if (!state.edit) state.hovered = null;
      } else if (cmd.type === 'freeze') {
        state.frozen = cmd.on === true;
      } else if (cmd.type === 'deselect') {
        state.selected = null;
        state.selectedSrc = null;
      } else if (cmd.type === 'apply') {
        for (const el of targets(cmd.scope ?? 'instance')) {
          const saved = state.overrides.get(el) ?? new Map<string, { value: string; priority: string }>();
          for (const [prop, value] of Object.entries(cmd.styles ?? {})) {
            if (!saved.has(prop)) saved.set(prop, { value: el.style.getPropertyValue(prop), priority: el.style.getPropertyPriority(prop) });
            el.style.setProperty(prop, value, 'important');
          }
          state.overrides.set(el, saved);
        }
      } else if (cmd.type === 'restore') {
        // Back to what the page had, for properties an edit returned to their start.
        const props = (raw as { properties?: string[] }).properties ?? [];
        for (const el of targets('all').concat(targets('instance'))) {
          const saved = state.overrides.get(el);
          if (saved === undefined) continue;
          for (const prop of props) {
            const was = saved.get(prop);
            if (was === undefined) continue;
            if (was.value === '') el.style.removeProperty(prop);
            else el.style.setProperty(prop, was.value, was.priority);
            saved.delete(prop);
          }
        }
      } else if (cmd.type === 'clear') {
        for (const [el, saved] of state.overrides) {
          for (const [prop, was] of saved) {
            if (was.value === '') el.style.removeProperty(prop);
            else el.style.setProperty(prop, was.value, was.priority);
          }
        }
        state.overrides.clear();
      }
    },
  };
  w.__scampInspector = api;
};

/** The source text that installs the inspector, then runs `cmd` if given. */
export const inspectorScript = (config: InspectorConfig, cmd?: InspectorCommand): string =>
  `(${installInspector.toString()})(${JSON.stringify(config)});` +
  (cmd === undefined ? '' : `window.__scampInspector.run(${JSON.stringify(cmd)});`);
