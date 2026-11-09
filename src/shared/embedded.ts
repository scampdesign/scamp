import type {
  EmbeddedBreakpoint,
  EmbeddedEditScope,
  EmbeddedHistoryEntry,
  EmbeddedElementRef,
  EmbeddedIdiom,
  EmbeddedPseudoState,
  EmbeddedQueueItem,
  EmbeddedRawSource,
  EmbeddedTreeNode,
} from './types';

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
    `- Written at: ${el.source ?? 'not mapped. Find it: search the project for its classes, its text and the component names below'}`,
    `- On the page: \`${el.page}\`, at \`${el.selector}\``,
  ];
  if (el.components.length > 0) lines.push(`- Inside components: ${el.components.join(' › ')}`);
  if (el.usedAt !== null) lines.push(`- That component is used at: ${el.usedAt}`);
  if (el.library !== null) {
    lines.push(
      `- Drawn by ${el.library}, a library. Never edit \`node_modules\`: style it from the project's code that renders it (a \`className\`, prop or \`style\` on the component, or a rule in the project's styles that targets it).`
    );
  }
  if (el.instanceCount > 1) lines.push(`- The same JSX draws ${el.instanceCount} elements on this page.`);
  return lines.join('\n');
};

const scopeLine = (scope: EmbeddedEditScope, el: EmbeddedElementRef | null): string =>
  scope === 'all'
    ? 'Scope: every instance. Change the shared definition, so all of them change.'
    : el !== null && el.instanceCount > 1
      ? 'Scope: this instance only. Leave the other instances as they are: override it where this one is used (a prop, a modifier class, or the call site), not in the shared definition.'
      : 'Scope: this element.';

/** What the agent is told about an edit made below desktop width. */
const breakpointLine = (bp: EmbeddedBreakpoint): string => {
  const project = bp.project.length > 0 ? ` The project's breakpoints are ${bp.project.map((w) => `${w}px`).join(', ')}${bp.direction === 'min' ? ', written mobile-first (`min-width`)' : bp.direction === 'max' ? ', written desktop-first (`max-width`)' : ''}.` : '';
  const how =
    bp.direction === 'min'
      ? ' In a mobile-first project, set the new value at the smallest size and restore the current value at the next breakpoint up (for Tailwind, an unprefixed class and the current one with the next prefix, such as `p-4 md:p-6`).'
      : ' Use the project\'s own breakpoints and style of media query or Tailwind prefix.';
  return `Breakpoint: the user made this edit with the app ${bp.width}px wide. Apply it at widths up to ${bp.upTo}px (\`@media (max-width: ${bp.upTo}px)\`), and leave wider widths as they are.${project}${how}`;
};

/** One queued edit, as the agent reads it. */
export const describeQueueItem = (item: EmbeddedQueueItem, index: number): string => {
  if (item.kind === 'style') {
    const changes = item.changes.map((c) => `  - \`${c.property}\`: ${c.from === '' ? '(not set)' : `\`${c.from}\``} → \`${c.to}\``).join('\n');
    const bp = item.breakpoint === undefined ? '' : `\n- ${breakpointLine(item.breakpoint)}`;
    const state = item.state === undefined ? '' : `\n- State: \`:${item.state}\`. Style the element only while it's in that state (a \`:${item.state}\` rule, or Tailwind's \`${item.state}:\` prefix), leaving its normal styles as they are.`;
    return `### Edit ${index + 1}: style${item.state === undefined ? '' : ` (:${item.state})`}\n${describeElement(item.element)}\n- ${scopeLine(item.scope, item.element)}${state}${bp}\n- Change:\n${changes}`;
  }
  if (item.kind === 'move') {
    const how = item.fromList
      ? 'Both are drawn from one line of JSX, by a list (`.map()` or similar), so their order is the data\'s. If the list is written in the project, reorder its items. If it comes from an API, a database or elsewhere, change nothing and say so.'
      : 'Move the element\'s JSX so it renders just ' + item.position + ' the other. If the element is the root of a component, move where that component is used instead. Keep everything else as it is, keys included.';
    return `### Edit ${index + 1}: move\n${describeElement(item.element)}\n- Move it to just **${item.position}** this sibling (same parent):\n${describeElement(item.target).replace(/^- /gm, '  - ')}\n- ${how}`;
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

/** What to tell the user's own agent to start it working the queue. see docs/plans/embedded-agent-connection-plan.md */
export const OWN_AGENT_LINE =
  'Work my Scamp edit queue: call scamp_embedded_wait_for_edits, write each batch it gives you, call scamp_embedded_done, and keep waiting for more until I say stop.';

/** A route path needs values filled in: `:id` (React Router) or `[id]` (Next.js). */
export const routeHasParams = (path: string): boolean => /\/:|\[/.test(path);

/** Known routes plus newly found ones: one each, pages before parameterised paths, then alphabetical. */
export const mergeRoutes = (known: ReadonlyArray<string>, found: ReadonlyArray<string>, limit = 300): string[] => {
  const all = new Set<string>();
  for (const raw of [...known, ...found]) {
    const path = raw.trim().replace(/(.)\/+$/, '$1').split(/[?#]/)[0] ?? '';
    if (path.startsWith('/') && !path.startsWith('//') && !path.includes('*')) all.add(path);
  }
  return [...all]
    .sort((a, b) => Number(routeHasParams(a)) - Number(routeHasParams(b)) || a.localeCompare(b))
    .slice(0, limit);
};

/** One queued edit in a few words: the queue list, the history, and commit messages. */
export const shortQueueItem = (item: EmbeddedQueueItem): string => {
  if (item.kind === 'move') {
    return `Move <${item.element.tag}> ${item.position} <${item.target.tag}>${item.target.text.length > 0 ? ` “${item.target.text.slice(0, 24)}”` : ''}`;
  }
  if (item.kind === 'instruction') return item.text;
  const where = `${item.state !== undefined ? `:${item.state}` : ''}${item.breakpoint !== undefined ? ` @${item.breakpoint.width}` : ''}`;
  return `<${item.element.tag}${where}> ${item.changes.map((c) => `${c.property} → ${c.to}`).join(', ')}${item.scope === 'all' ? ' (all)' : ''}`;
};

/** A change in plain words for people, and the technical form (tags, classes, values) for the tooltip. */
export type ChangeDescription = { text: string; detail: string };

/** Elements by what they look like, for the plain wording. */
const ELEMENT_WORDS: Record<string, string> = {
  a: 'Link', button: 'Button', img: 'Image', svg: 'Icon', picture: 'Image', video: 'Video',
  h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', h5: 'Heading', h6: 'Heading',
  p: 'Text', span: 'Text', strong: 'Text', em: 'Text', small: 'Text', label: 'Label',
  input: 'Input', textarea: 'Text field', select: 'Menu', option: 'Option',
  ul: 'List', ol: 'List', li: 'List item', nav: 'Navigation', header: 'Header', footer: 'Footer',
  main: 'Page', section: 'Section', article: 'Article', aside: 'Sidebar', form: 'Form', dialog: 'Dialog',
  table: 'Table', tr: 'Row', td: 'Cell', th: 'Cell', div: 'Box',
};
/** Containers that read better as the component they're the root of. */
const GENERIC = new Set(['div', 'section', 'article', 'span', 'main', 'aside', 'header', 'footer', 'nav', 'li']);

/** "Card", "Heading in Card", "Button": the component a container draws, or what the element is and where. */
const elementWords = (el: EmbeddedElementRef): string => {
  const word = ELEMENT_WORDS[el.tag] ?? el.tag.toUpperCase().slice(0, 1) + el.tag.slice(1);
  const component = el.components[0];
  // The outermost component is the app itself: "in App" says nothing.
  const inside = component !== undefined && el.components.length > 1 ? component : null;
  if (inside !== null && GENERIC.has(el.tag)) return inside;
  return inside === null ? word : `${word} in ${inside}`;
};

/** What a CSS property changes, in a word or two. */
const propertyGroup = (property: string): string => {
  if (/radius/.test(property)) return 'corners';
  if (/^(color|background|fill|stroke)/.test(property)) return 'color';
  if (/^(padding|margin|gap|row-gap|column-gap)/.test(property)) return 'spacing';
  if (/^(width|height|min-|max-|flex-basis|aspect-ratio)/.test(property)) return 'size';
  if (/^(font|line-height|letter-spacing|text-|white-space|word-|font-)/.test(property)) return 'text style';
  if (/^(border|outline)/.test(property)) return 'border';
  if (/shadow/.test(property)) return 'shadow';
  if (/^(opacity|filter|backdrop-filter|transform|transition|animation|mix-blend)/.test(property)) return 'effects';
  return 'layout';
};

/** Where an edit applies, beyond the element: its state and width. */
const qualifiers = (item: Extract<EmbeddedQueueItem, { kind: 'style' }>): string => {
  const parts: string[] = [];
  if (item.state !== undefined) parts.push(`(${item.state})`);
  if (item.breakpoint !== undefined) {
    const w = item.breakpoint.width;
    parts.push(w <= 480 ? 'on mobile' : w <= 1024 ? 'on tablet' : `at ${w}px`);
  }
  return parts.length === 0 ? '' : ` ${parts.join(' ')}`;
};

/** One queued edit for people ("Changed spacing on every Card"), with its technical form for the tooltip. */
export const describeChange = (item: EmbeddedQueueItem): ChangeDescription => {
  const detail = shortQueueItem(item);
  if (item.kind === 'instruction') return { text: item.text.length > 80 ? `${item.text.slice(0, 77)}…` : item.text, detail: item.element === null ? '' : `<${item.element.tag}>` };
  if (item.kind === 'move') {
    const target = item.target.text.length > 0 ? `“${item.target.text.slice(0, 24)}”` : elementWords(item.target);
    return { text: `Moved ${elementWords(item.element)} ${item.position} ${target}`, detail };
  }
  const groups = [...new Set(item.changes.map((c) => propertyGroup(c.property)))];
  const name = `${item.scope === 'all' ? 'every ' : ''}${elementWords(item.element)}`;
  const only = groups.length === 1 ? groups[0] : undefined;
  const verb =
    only === undefined ? `Restyled ${name}` : only === 'size' ? `Resized ${name}` : only === 'corners' ? `Changed the corners on ${name}` : `Changed ${only} on ${name}`;
  return { text: `${verb}${qualifiers(item)}`, detail };
};

/**
 * An Accept's commit: a subject (the user's, or the first change) and the
 * changes in the body, each in plain words with its technical form indented
 * under it, which the history reads back.
 */
export const commitMessageFor = (subject: string, changes: ReadonlyArray<ChangeDescription>, files: ReadonlyArray<string>): { subject: string; body: string } => {
  const typed = subject.trim();
  const first = changes[0]?.text;
  const auto = first === undefined ? `update ${files.join(', ')}` : changes.length === 1 ? first : `${first}, and ${changes.length - 1} more`;
  const body = changes.map((c) => (c.detail.length > 0 ? `- ${c.text}\n  ${c.detail}` : `- ${c.text}`)).join('\n');
  return { subject: (typed.length > 0 ? typed : auto).slice(0, 120), body };
};

/** Unit and record separators, which no commit message contains. */
const UNIT = '\x1f';
const RECORD = '\x1e';
/** For `git log --name-only`: each record starts with the separator, and the file list ends it. */
export const HISTORY_LOG_FORMAT = '%x1e%H%x1f%ct%x1f%s%x1f%b%x1f';

/** A commit body's changes: `- plain words`, each optionally followed by its indented technical form. */
const changesFromBody = (body: string): ChangeDescription[] => {
  const out: ChangeDescription[] = [];
  for (const line of body.split('\n')) {
    if (line.startsWith('- ')) out.push({ text: line.slice(2), detail: '' });
    else if (line.startsWith('  ') && line.trim().length > 0) {
      const last = out[out.length - 1];
      if (last !== undefined && last.detail.length === 0) last.detail = line.trim();
    }
  }
  return out;
};

/** `git log --format=HISTORY_LOG_FORMAT --name-only` read into entries, newest first. */
export const parseHistoryLog = (text: string): Array<Omit<EmbeddedHistoryEntry, 'undone' | 'current'>> =>
  text.split(RECORD).flatMap((record) => {
    const [sha, time, subject, body, files] = record.split(UNIT);
    if (sha === undefined || !/^[0-9a-f]{7,40}$/.test(sha)) return [];
    return [
      {
        sha,
        time: Number(time ?? 0),
        subject: subject ?? '',
        changes: changesFromBody(body ?? ''),
        files: (files ?? '')
          .split('\n')
          .map((f) => f.trim())
          .filter((f) => f.length > 0),
      },
    ];
  });

/**
 * The breakpoint an edit made `width` pixels wide applies up to: just under
 * the project's next breakpoint above it, or the width itself when the
 * project has none above. Null at desktop (no width set).
 */
export const breakpointFor = (width: number | null, project: ReadonlyArray<number>, direction: 'min' | 'max' | null): EmbeddedBreakpoint | null => {
  if (width === null) return null;
  const above = [...project].sort((a, b) => a - b).find((w) => w > width);
  return { width, upTo: above === undefined ? width : above - 1, project: [...project].sort((a, b) => a - b), direction };
};

/** Messages from the inspector arrive as console lines starting with this. */
export const INSPECTOR_PREFIX = '__scamp_inspector__';

export type InspectorConfig = {
  prefix: string;
  attr: string;
  properties: ReadonlyArray<string>;
};

export type InspectorState = EmbeddedPseudoState;

export type InspectorCommand =
  | { type: 'edit'; on: boolean }
  | { type: 'freeze'; on: boolean }
  /**
   * Preview styles on the page. `uid` is the element the edit is about (the
   * selection when omitted), `media` wraps it in a media query (an edit made
   * below desktop width), and `tag` (the queue item's id) lets `undoTag`
   * take back exactly what this edit set.
   */
  | { type: 'apply'; scope: EmbeddedEditScope; styles: Record<string, string>; state: InspectorState; uid?: string; media?: string | null; tag?: string }
  | { type: 'restore'; scope: EmbeddedEditScope; properties: ReadonlyArray<string>; state: InspectorState; uid?: string; media?: string | null }
  /** Take back everything an edit or move with this tag previewed. */
  | { type: 'undoTag'; tag: string }
  | { type: 'clear' }
  | { type: 'deselect' }
  /** Force a pseudo-class on the selection, as DevTools' `:hov` does. */
  | { type: 'state'; state: InspectorState }
  /** Let go of every forced state, the frozen ones included. */
  | { type: 'release' }
  /** Report the selection again, with its styles as they are now. */
  | { type: 'reselect' }
  | { type: 'selectId'; id: string }
  | { type: 'hoverId'; id: string | null }
  /** Move a layer next to a sibling, from the layers tree. */
  | { type: 'move'; id: string; targetId: string; position: 'before' | 'after'; tag: string };

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
export const installInspector = (config: InspectorConfig): void => {
  type Api = { run: (cmd: unknown) => void; tree: () => EmbeddedTreeNode; breakpoints: () => { min: number[]; max: number[] }; config: InspectorConfig };
  type Win = Window & { __scampInspector?: Api };
  const w = window as Win;
  if (w.__scampInspector !== undefined) {
    w.__scampInspector.config = config;
    return;
  }
  type Fiber = {
    type?: unknown;
    return?: Fiber | null;
    stateNode?: unknown;
    _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number } | null;
    _debugStack?: { stack?: string } | null;
  };
  const FORCE_ATTR = 'data-scamp-force';
  const UID_ATTR = 'data-scamp-uid';
  const state = {
    edit: false,
    frozen: false,
    pointer: null as Element | null,
    hovered: null as Element | null,
    treeHover: null as Element | null,
    selected: null as Element | null,
    selectedKey: null as string | null,
    selectedIndex: 0,
    overrides: new Map<HTMLElement, Map<string, { value: string; priority: string }>>(),
    frozenForce: new Map<Element, string[]>(),
    panelForce: null as { el: Element; state: string } | null,
    forcedNow: new Set<Element>(),
    /** Preview rules, keyed by media and selector: for states and breakpoints, which inline styles can't express. */
    rules: new Map<string, { media: string | null; selector: string; props: Record<string, string> }>(),
    /** What each tagged edit replaced, so `undoTag` can put exactly that back. */
    tags: new Map<string, { inline: Array<{ el: HTMLElement; prop: string; value: string; priority: string }>; rules: Array<{ key: string; prop: string; prev: string | undefined }>; marks: HTMLDivElement[] }>(),
    moveCount: 0,
    drag: null as { el: Element; x: number; y: number; active: boolean; target: Element | null; position: 'before' | 'after' } | null,
    suppressClick: false,
    /** Moves the page can't preview (block flow), marked until the agent writes them. */
    marks: [] as Array<{ box: HTMLDivElement; target: Element; position: 'before' | 'after' }>,
  };
  let api: Api;
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
  const preview = document.createElement('style');
  preview.setAttribute('data-scamp-overlay', '');
  const insertLine = document.createElement('div');
  insertLine.setAttribute('data-scamp-overlay', '');
  insertLine.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;display:none;background:#4a8cff;border-radius:2px;';
  document.documentElement.append(hoverBox, selectBox, label, preview, insertLine);

  // Ids for the layers tree, kept off the DOM.
  let nextUid = 1;
  const uids = new WeakMap<Element, string>();
  const byUid = new Map<string, WeakRef<Element>>();
  const uidOf = (el: Element): string => {
    let id = uids.get(el);
    if (id === undefined) {
      id = `n${nextUid++}`;
      uids.set(el, id);
      byUid.set(id, new WeakRef(el));
    }
    return id;
  };

  const fiberOf = (el: Element): Fiber | undefined => {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    return key === undefined ? undefined : (el as unknown as Record<string, Fiber>)[key];
  };
  const INTERNAL = /\/node_modules\/(react|react-dom|scheduler|next)\/|node_modules_(react|next)[_.]|\/next\/dist\/|react-dom|react-server-dom|jsx-dev-runtime|jsx-runtime|\[turbopack\]|<anonymous>/;
  /** Where React says the element's JSX is, for an element Scamp couldn't tag at build time. */
  const rawSourceOf = (el: Element): EmbeddedRawSource | null => {
    const fiber = fiberOf(el);
    const ds = fiber?._debugSource;
    if (ds !== undefined && ds !== null) return { kind: 'file', path: ds.fileName, line: ds.lineNumber, column: ds.columnNumber ?? 0 };
    const stack = fiber?._debugStack?.stack ?? '';
    for (const line of stack.split('\n').slice(1)) {
      const m = /(?:\(|\bat\s+)([^()\s]+):(\d+):(\d+)\)?\s*$/.exec(line);
      if (m === null || INTERNAL.test(m[1] ?? '')) continue;
      return { kind: 'frame', url: m[1] ?? '', line: Number(m[2]), column: Number(m[3]) };
    }
    return null;
  };
  /** One string for "the same line of JSX", tagged or not. */
  const keyOf = (el: Element): string | null => {
    const attr = el.getAttribute(api.config.attr);
    if (attr !== null) return attr;
    const raw = rawSourceOf(el);
    return raw === null ? null : raw.kind === 'frame' ? `${raw.url}:${raw.line}:${raw.column}` : `${raw.path}:${raw.line}:${raw.column}`;
  };
  const sameSource = (el: Element): HTMLElement[] => {
    const attr = el.getAttribute(api.config.attr);
    if (attr !== null) return Array.from(document.querySelectorAll<HTMLElement>(`[${api.config.attr}="${CSS.escape(attr)}"]`));
    const key = keyOf(el);
    if (key === null) return el instanceof HTMLElement ? [el] : [];
    return Array.from(document.getElementsByTagName(el.tagName)).filter((o): o is HTMLElement => o instanceof HTMLElement && keyOf(o) === key);
  };
  const componentsOf = (el: Element): string[] => {
    const names: string[] = [];
    let fiber: Fiber | null | undefined = fiberOf(el);
    for (let i = 0; fiber && i < 200 && names.length < 6; i += 1, fiber = fiber.return) {
      const t = fiber.type as { displayName?: string; name?: string; render?: { name?: string } } | string | undefined;
      if (t === undefined || t === null || typeof t === 'string') continue;
      const name = (typeof t === 'function' ? (t as { displayName?: string }).displayName ?? (t as { name?: string }).name : t.displayName ?? t.render?.name) ?? '';
      if (/^[A-Z]/.test(name) && names[names.length - 1] !== name) names.push(name);
    }
    return names;
  };
  /** The component this element is the outermost DOM node of, if any. */
  const rootComponentOf = (el: Element): string | null => {
    let found: string | null = null;
    let fiber: Fiber | null | undefined = fiberOf(el)?.return;
    for (let i = 0; fiber && i < 50; i += 1, fiber = fiber.return) {
      if (typeof fiber.type === 'string') break;
      const t = fiber.type as { displayName?: string; name?: string } | undefined;
      const name = t === undefined || t === null ? '' : (t.displayName ?? t.name ?? '');
      if (/^[A-Z]/.test(name)) found = name;
    }
    return found;
  };

  const short = (el: Element): string => {
    const cls = Array.from(el.classList)[0];
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : cls !== undefined ? `.${cls}` : ''}`;
  };
  const heldList = (): Array<{ label: string; states: string[] }> =>
    Array.from(state.forcedNow).map((el) => ({ label: short(el), states: (el.getAttribute(FORCE_ATTR) ?? '').split(',').filter((x) => x.length > 0) }));
  /** Mark what's forced, for main to apply; tell the window what's held. */
  const syncForce = (): void => {
    const wanted = new Map<Element, Set<string>>();
    for (const [el, states] of state.frozenForce) wanted.set(el, new Set(states));
    if (state.panelForce !== null && state.panelForce.state !== 'none') {
      const set = wanted.get(state.panelForce.el) ?? new Set<string>();
      set.add(state.panelForce.state);
      wanted.set(state.panelForce.el, set);
    }
    for (const el of state.forcedNow) if (!wanted.has(el)) el.removeAttribute(FORCE_ATTR);
    state.forcedNow = new Set();
    for (const [el, set] of wanted) {
      if (!el.isConnected) continue;
      el.setAttribute(FORCE_ATTR, [...set].join(','));
      state.forcedNow.add(el);
    }
    send({ type: 'forced', held: heldList() });
  };

  const describe = (el: Element): unknown => {
    const attr = el.getAttribute(api.config.attr);
    const raw = attr === null ? rawSourceOf(el) : null;
    const src = attr ?? null;
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
    const where = src ?? (raw === null ? '' : raw.kind === 'frame' ? raw.url : raw.path);
    const library = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(where)?.[1] ?? null;
    const chain: string[] = [];
    for (let a: Element | null = el; a !== null && a !== document.body && chain.length < 5; a = a.parentElement) chain.unshift(short(a));
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

  const select = (el: Element): void => {
    if (state.panelForce !== null && state.panelForce.el !== el) {
      state.panelForce = null;
      syncForce();
    }
    state.selected = el;
    state.selectedKey = keyOf(el);
    state.selectedIndex = Math.max(0, sameSource(el).indexOf(el as HTMLElement));
    send(describe(el));
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
    if (state.selected !== null && !state.selected.isConnected && state.selectedKey !== null) {
      const key = state.selectedKey;
      const again =
        Array.from(document.querySelectorAll('*')).filter((o) => keyOf(o) === key)[state.selectedIndex] ?? null;
      state.selected = again;
      if (again !== null) send(describe(again));
    }
    const hover = state.drag?.active === true ? state.drag.el : state.treeHover ?? (state.edit && state.hovered !== state.selected ? state.hovered : null);
    place(hoverBox, hover);
    for (const m of state.marks) drawLine(m.box, m.target, m.position);
    place(selectBox, state.selected);
    if (state.selected !== null && state.selected.isConnected) {
      const r = state.selected.getBoundingClientRect();
      const src = state.selected.getAttribute(api.config.attr);
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
  // Drag the selection among its siblings. Registered before the edit-mode
  // swallowing below, which stops later listeners for the same events.
  const axisOf = (parent: Element, a: Element, b: Element): 'x' | 'y' => {
    const cs = getComputedStyle(parent);
    if (cs.display.includes('flex')) return cs.flexDirection.startsWith('row') ? 'x' : 'y';
    if (cs.display.includes('grid')) {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return Math.abs(ra.top - rb.top) < Math.min(ra.height, rb.height) / 2 ? 'x' : 'y';
    }
    return 'y';
  };
  const drawLine = (box: HTMLDivElement, target: Element, position: 'before' | 'after'): void => {
    const parent = target.parentElement;
    if (!target.isConnected || parent === null) {
      box.style.display = 'none';
      return;
    }
    const r = target.getBoundingClientRect();
    const axis = axisOf(parent, target, target.previousElementSibling ?? target.nextElementSibling ?? target);
    box.style.display = 'block';
    if (axis === 'x') {
      box.style.left = `${(position === 'before' ? r.left : r.right) - 2}px`;
      box.style.top = `${r.top}px`;
      box.style.width = '3px';
      box.style.height = `${r.height}px`;
    } else {
      box.style.left = `${r.left}px`;
      box.style.top = `${(position === 'before' ? r.top : r.bottom) - 2}px`;
      box.style.width = `${r.width}px`;
      box.style.height = '3px';
    }
  };
  const kidsOf = (parent: Element): Element[] => Array.from(parent.children).filter((c) => !isOverlay(c) && !SKIP.has(c.tagName));
  /**
   * What a drag of `el` moves: `el`, or, when it's an only child (a card's
   * title, say), the nearest ancestor that has siblings to move between.
   * Null when nothing up to the app's root has any.
   */
  const movable = (el: Element): Element | null => {
    for (let at: Element | null = el; at !== null && at !== document.body; at = at.parentElement) {
      const parent = at.parentElement;
      if (parent === null || parent === document.body || parent === document.documentElement) return null;
      if (kidsOf(parent).length > 1) return at;
    }
    return null;
  };
  /** The sibling of `el` under the point, and which side of it. */
  const dropAt = (el: Element, x: number, y: number): { target: Element; position: 'before' | 'after' } | null => {
    const parent = el.parentElement;
    if (parent === null) return null;
    let under = document.elementFromPoint(x, y);
    while (under !== null && under.parentElement !== parent) under = under.parentElement;
    if (under === null || under === el || isOverlay(under)) return null;
    const r = under.getBoundingClientRect();
    const axis = axisOf(parent, under, el);
    const position = (axis === 'x' ? x < r.left + r.width / 2 : y < r.top + r.height / 2) ? 'before' : 'after';
    return { target: under, position };
  };
  /** Preview a move where `order` can show it, mark it where it can't, and tell the window. */
  const applyMove = (el: Element, target: Element, position: 'before' | 'after', given?: string): void => {
    const tag = given ?? `m-${Date.now().toString(36)}-${(state.moveCount += 1)}`;
    const parent = el.parentElement;
    if (parent === null || target.parentElement !== parent || el === target) return;
    const kids = kidsOf(parent);
    const without = kids.filter((k) => k !== el);
    const at = without.indexOf(target) + (position === 'after' ? 1 : 0);
    const next = [...without.slice(0, at), el, ...without.slice(at)];
    const previewed = /flex|grid/.test(getComputedStyle(parent).display);
    if (previewed) {
      next.forEach((kid, i) => {
        if (kid instanceof HTMLElement) setInline(kid, 'order', String(i), tag);
      });
    } else {
      const box = document.createElement('div');
      box.setAttribute('data-scamp-overlay', '');
      box.title = 'Moves here once the agent writes it';
      box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;background:repeating-linear-gradient(90deg,#4a8cff 0 6px,transparent 6px 10px);';
      document.documentElement.append(box);
      state.marks.push({ box, target, position });
      tagRecord(tag).marks.push(box);
    }
    const a = describe(el) as { element: unknown; raw: unknown };
    const b = describe(target) as { element: unknown; raw: unknown };
    const key = keyOf(el);
    send({ type: 'moved', tag, uid: uidOf(el), targetUid: uidOf(target), element: a.element, raw: a.raw, target: b.element, targetRaw: b.raw, position, fromList: key !== null && key === keyOf(target), previewed });
  };
  window.addEventListener('pointerdown', (e) => {
    if (!state.edit || e.button !== 0) return;
    const t = e.target;
    if (state.selected !== null && t instanceof Node && state.selected.contains(t)) {
      state.drag = { el: state.selected, x: e.clientX, y: e.clientY, active: false, target: null, position: 'before' };
    }
  }, true);
  window.addEventListener('pointermove', (e) => {
    const drag = state.drag;
    if (drag === null) return;
    if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    if (!drag.active) {
      const moving = movable(drag.el);
      if (moving === null) {
        state.drag = null;
        // The pointerup that ends this gesture would otherwise select.
        state.suppressClick = true;
        send({ type: 'dragNote', text: 'This element and the ones around it have no siblings to move between.' });
        return;
      }
      drag.el = moving;
      drag.active = true;
      if (moving !== state.selected) send({ type: 'dragNote', text: `Moving the <${moving.tagName.toLowerCase()}> around it: the selected element has no siblings.` });
    }
    const drop = dropAt(drag.el, e.clientX, e.clientY);
    drag.target = drop?.target ?? null;
    if (drop === null) insertLine.style.display = 'none';
    else {
      drag.position = drop.position;
      drawLine(insertLine, drop.target, drop.position);
    }
  }, true);
  window.addEventListener('pointerup', () => {
    const drag = state.drag;
    state.drag = null;
    insertLine.style.display = 'none';
    if (drag === null || !drag.active) return;
    // The click that follows a drag isn't a selection.
    state.suppressClick = true;
    if (drag.target !== null) applyMove(drag.el, drag.target, drag.position);
  }, true);

  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu', 'auxclick']) {
    window.addEventListener(type, (e) => {
      if (state.edit) swallow(e);
    }, true);
  }
  window.addEventListener('click', (e) => {
    if (!state.edit) return;
    swallow(e);
    if (state.suppressClick) {
      state.suppressClick = false;
      return;
    }
    const target = e.target;
    if (!(target instanceof Element) || isOverlay(target)) return;
    select(target);
  }, true);
  window.addEventListener('pointermove', (e) => {
    const t = e.target;
    state.pointer = t instanceof Element && !isOverlay(t) ? t : null;
    if (state.edit) state.hovered = state.pointer;
  }, true);
  for (const type of ['mouseleave', 'mouseout', 'pointerleave', 'pointerout', 'blur', 'focusout', 'visibilitychange']) {
    const handler = (e: Event): void => {
      if (state.frozen) e.stopImmediatePropagation();
    };
    window.addEventListener(type, handler, true);
    document.addEventListener(type, handler, true);
  }

  /** Freeze: hold leave and blur, and force what's hovered and focused as it is now. */
  const setFrozen = (on: boolean): void => {
    state.frozen = on;
    state.frozenForce = new Map();
    if (on) {
      for (let el: Element | null = state.pointer; el !== null && el !== document.documentElement; el = el.parentElement) {
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
    if ((state.frozen || state.edit) && e.key === 'Escape') swallow(e);
    // In edit mode the page is Scamp's canvas: Cmd+Z undoes Scamp's edits, not the app's.
    if (state.edit && (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'z') {
      swallow(e);
      send({ type: e.shiftKey ? 'redo' : 'undo' });
    }
  }, true);

  /** The element an edit is about: by id, or the selection. */
  const baseOf = (uid: string | undefined): Element | null => (uid !== undefined ? (byUid.get(uid)?.deref() ?? null) : state.selected);
  const targets = (scope: string, base: Element | null): HTMLElement[] => {
    if (!(base instanceof HTMLElement)) return [];
    return scope === 'all' ? sameSource(base) : [base];
  };
  /** The selector a preview rule uses for the edit's targets, with its pseudo-class. */
  const ruleSelector = (scope: string, pseudo: string, base: Element | null): string | null => {
    if (base === null) return null;
    const suffix = pseudo === 'none' ? '' : `:${pseudo}`;
    const attr = base.getAttribute(api.config.attr);
    if (scope === 'all' && attr !== null) return `[${api.config.attr}="${CSS.escape(attr)}"]${suffix}`;
    const ids = targets(scope, base).map((el) => {
      const id = uidOf(el);
      el.setAttribute(UID_ATTR, id);
      return `[${UID_ATTR}="${id}"]${suffix}`;
    });
    return ids.length === 0 ? null : ids.join(', ');
  };
  const ruleKey = (media: string | null, selector: string): string => `${media ?? ''}|${selector}`;
  const writeRules = (): void => {
    preview.textContent = Array.from(state.rules.values())
      .map(({ media, selector, props }) => {
        const body = `${selector} { ${Object.entries(props).map(([p, v]) => `${p}: ${v} !important;`).join(' ')} }`;
        return media === null ? body : `@media ${media} { ${body} }`;
      })
      .join('\n');
  };
  const tagRecord = (tag: string): { inline: Array<{ el: HTMLElement; prop: string; value: string; priority: string }>; rules: Array<{ key: string; prop: string; prev: string | undefined }>; marks: HTMLDivElement[] } => {
    let rec = state.tags.get(tag);
    if (rec === undefined) {
      rec = { inline: [], rules: [], marks: [] };
      state.tags.set(tag, rec);
    }
    return rec;
  };
  /** Set an inline preview style, remembering the page's own value and, per tag, what this replaced. */
  const setInline = (el: HTMLElement, prop: string, value: string, tag: string | undefined): void => {
    const saved = state.overrides.get(el) ?? new Map<string, { value: string; priority: string }>();
    if (!saved.has(prop)) saved.set(prop, { value: el.style.getPropertyValue(prop), priority: el.style.getPropertyPriority(prop) });
    state.overrides.set(el, saved);
    if (tag !== undefined) {
      const rec = tagRecord(tag);
      if (!rec.inline.some((i) => i.el === el && i.prop === prop)) {
        rec.inline.push({ el, prop, value: el.style.getPropertyValue(prop), priority: el.style.getPropertyPriority(prop) });
      }
    }
    el.style.setProperty(prop, value, 'important');
  };
  const setRule = (media: string | null, selector: string, props: Record<string, string>, tag: string | undefined): void => {
    const key = ruleKey(media, selector);
    const rule = state.rules.get(key) ?? { media, selector, props: {} };
    for (const [prop, value] of Object.entries(props)) {
      if (tag !== undefined) {
        const rec = tagRecord(tag);
        if (!rec.rules.some((r) => r.key === key && r.prop === prop)) rec.rules.push({ key, prop, prev: rule.props[prop] });
      }
      rule.props[prop] = value;
    }
    state.rules.set(key, rule);
    writeRules();
  };
  /** Put back everything one tagged edit or move previewed. */
  const undoTag = (tag: string): void => {
    const rec = state.tags.get(tag);
    if (rec === undefined) return;
    state.tags.delete(tag);
    for (const i of [...rec.inline].reverse()) {
      if (i.value === '') i.el.style.removeProperty(i.prop);
      else i.el.style.setProperty(i.prop, i.value, i.priority);
      // Back to the page's own value: no longer an override `clear` has to restore.
      const saved = state.overrides.get(i.el);
      const original = saved?.get(i.prop);
      if (saved !== undefined && original !== undefined && original.value === i.value && original.priority === i.priority) saved.delete(i.prop);
    }
    for (const r of [...rec.rules].reverse()) {
      const rule = state.rules.get(r.key);
      if (rule === undefined) continue;
      if (r.prev === undefined) delete rule.props[r.prop];
      else rule.props[r.prop] = r.prev;
      if (Object.keys(rule.props).length === 0) state.rules.delete(r.key);
    }
    for (const box of rec.marks) box.remove();
    state.marks = state.marks.filter((m) => !rec.marks.includes(m.box));
    writeRules();
  };
  /** Widths the page's own stylesheets break at, from their media queries. */
  const breakpoints = (): { min: number[]; max: number[] } => {
    const min = new Set<number>();
    const max = new Set<number>();
    const QUERY = /\(\s*(?:(min|max)-width\s*:\s*|width\s*(>=|>|<=|<)\s*)([\d.]+)(px|em|rem)\s*\)/g;
    const walk = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) {
          for (const m of rule.media.mediaText.matchAll(QUERY)) {
            const px = Math.round(Number(m[3]) * (m[4] === 'px' ? 1 : 16));
            const isMin = m[1] === 'min' || m[2] === '>=' || m[2] === '>';
            if (px > 0 && px < 4000) (isMin ? min : max).add(px);
          }
        }
        if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      if (sheet.ownerNode instanceof Element && isOverlay(sheet.ownerNode)) continue;
      try {
        walk(sheet.cssRules);
      } catch {
        // A cross-origin stylesheet can't be read; its breakpoints go unseen.
      }
    }
    return { min: [...min].sort((a, b) => a - b), max: [...max].sort((a, b) => a - b) };
  };

  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META']);
  const MAX_NODES = 3000;
  const tree = (): EmbeddedTreeNode => {
    let count = 0;
    const build = (el: Element, depth: number): EmbeddedTreeNode => {
      count += 1;
      const children = Array.from(el.children).filter((c) => !SKIP.has(c.tagName) && !isOverlay(c));
      const kids: EmbeddedTreeNode[] = [];
      let more = 0;
      for (const child of children) {
        if (count >= MAX_NODES || depth > 60) more += 1;
        else kids.push(build(child, depth + 1));
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
  let treeTimer: ReturnType<typeof setTimeout> | null = null;
  new MutationObserver((records) => {
    if (records.every((r) => isOverlay(r.target) || Array.from(r.addedNodes).every(isOverlay))) return;
    if (treeTimer !== null) clearTimeout(treeTimer);
    treeTimer = setTimeout(() => send({ type: 'treeChanged' }), 400);
  }).observe(document.body, { childList: true, subtree: true });

  api = {
    config,
    tree,
    breakpoints,
    run: (raw: unknown): void => {
      const cmd = raw as { type: string; on?: boolean; scope?: string; styles?: Record<string, string>; properties?: string[]; state?: string; id?: string | null; targetId?: string; position?: string; uid?: string; media?: string | null; tag?: string };
      const media = cmd.media ?? null;
      const pseudo = cmd.state ?? 'none';
      if (cmd.type === 'edit') {
        state.edit = cmd.on === true;
        if (!state.edit) state.hovered = null;
      } else if (cmd.type === 'freeze') {
        setFrozen(cmd.on === true);
      } else if (cmd.type === 'deselect') {
        state.selected = null;
        state.selectedKey = null;
        if (state.panelForce !== null) {
          state.panelForce = null;
          syncForce();
        }
      } else if (cmd.type === 'state') {
        state.panelForce = state.selected === null || pseudo === 'none' ? null : { el: state.selected, state: pseudo };
        syncForce();
      } else if (cmd.type === 'release') {
        state.frozen = false;
        state.frozenForce = new Map();
        state.panelForce = null;
        syncForce();
        send({ type: 'freeze', on: false });
      } else if (cmd.type === 'reselect') {
        if (state.selected !== null && state.selected.isConnected) send(describe(state.selected));
      } else if (cmd.type === 'selectId') {
        const el = byUid.get(cmd.id ?? '')?.deref();
        if (el !== undefined && el.isConnected) {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          select(el);
        }
      } else if (cmd.type === 'move') {
        const el = byUid.get(cmd.id ?? '')?.deref();
        const target = byUid.get(cmd.targetId ?? '')?.deref();
        if (el !== undefined && target !== undefined) applyMove(el, target, cmd.position === 'after' ? 'after' : 'before', cmd.tag);
      } else if (cmd.type === 'hoverId') {
        state.treeHover = cmd.id === null ? null : (byUid.get(cmd.id ?? '')?.deref() ?? null);
      } else if (cmd.type === 'apply') {
        const base = baseOf(cmd.uid);
        const scope = cmd.scope ?? 'instance';
        // A state or a breakpoint previews as a rule; anything else inline.
        if (pseudo !== 'none' || media !== null) {
          const selector = ruleSelector(scope, pseudo, base);
          if (selector !== null) setRule(media, selector, cmd.styles ?? {}, cmd.tag);
          return;
        }
        for (const el of targets(scope, base)) {
          for (const [prop, value] of Object.entries(cmd.styles ?? {})) setInline(el, prop, value, cmd.tag);
        }
      } else if (cmd.type === 'undoTag') {
        undoTag(cmd.tag ?? '');
      } else if (cmd.type === 'restore') {
        const props = cmd.properties ?? [];
        const base = baseOf(cmd.uid);
        if (pseudo !== 'none' || media !== null) {
          for (const scope of ['all', 'instance']) {
            const selector = ruleSelector(scope, pseudo, base);
            const rule = selector === null ? undefined : state.rules.get(ruleKey(media, selector));
            if (rule === undefined || selector === null) continue;
            for (const prop of props) delete rule.props[prop];
            if (Object.keys(rule.props).length === 0) state.rules.delete(ruleKey(media, selector));
          }
          writeRules();
          return;
        }
        // Back to what the page had, for properties an edit returned to their start.
        for (const el of targets('all', base).concat(targets('instance', base))) {
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
        state.rules.clear();
        state.tags.clear();
        for (const m of state.marks) m.box.remove();
        state.marks = [];
        writeRules();
      }
    },
  };
  w.__scampInspector = api;
};

/** The source text that installs the inspector, then runs `cmd` if given. */
export const inspectorScript = (config: InspectorConfig, cmd?: InspectorCommand): string =>
  `(${installInspector.toString()})(${JSON.stringify(config)});` +
  (cmd === undefined ? '' : `window.__scampInspector.run(${JSON.stringify(cmd)});`);

/** The source text that returns the widths the page's stylesheets break at. */
export const inspectorBreakpointsScript = (config: InspectorConfig): string =>
  `(${installInspector.toString()})(${JSON.stringify(config)}); window.__scampInspector.breakpoints();`;

/** The source text that returns the page's tree, installing the inspector first. */
export const inspectorTreeScript = (config: InspectorConfig): string =>
  `(${installInspector.toString()})(${JSON.stringify(config)}); window.__scampInspector.tree();`;
