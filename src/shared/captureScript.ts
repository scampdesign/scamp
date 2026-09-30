/// <reference lib="dom" />
// The DOM lib is pulled in for this file alone: `src/shared` is compiled
// by the node project too, where `document` and `Element` are rightly
// absent. This is the one shared module that runs in a page.

import {
  CAPTURED_PROPERTIES,
  CAPTURE_LIMITS,
  CAPTURE_VERSION,
  INHERITED_PROPERTIES,
  INITIAL_VALUES,
  CONDITIONAL_PROPERTIES,
  INLINE_MARKUP_ATTRIBUTES,
  INLINE_MARKUP_TAGS,
  INLINE_TAG_AFFORDANCES,
  KEPT_ATTRIBUTES,
  SPAN_VISUAL_PROPERTIES,
  SKIPPED_TAGS,
  type CapturePayload,
  type CapturedSource,
} from './importCapture';

/**
 * The capture script — the one piece that has to run inside the page.
 *
 * `captureFn` is serialized with `toString()` and evaluated in the
 * target document, so it MUST be self-contained: no imports, no
 * closures over module scope, no TypeScript that doesn't survive being
 * read back as plain JS. Everything it needs arrives as its argument,
 * which is why the policy is data rather than a set of imports — a
 * `Set` doesn't survive `JSON.stringify`, so the policy carries arrays
 * and the function rebuilds them.
 *
 * Keeping it a real exported function rather than a template string
 * means it typechecks and the fixture generator can call it directly
 * through Playwright's `page.evaluate`.
 * see docs/plans/website-import-plan.md
 */

export type CapturePolicy = {
  properties: ReadonlyArray<string>;
  initial: Readonly<Record<string, string | ReadonlyArray<string>>>;
  inherited: ReadonlyArray<string>;
  conditional: Readonly<Record<string, string | null>>;
  inlineTags: ReadonlyArray<string>;
  inlineAttrs: Readonly<Record<string, ReadonlyArray<string>>>;
  /** What makes an inline tag worth keeping as an element. */
  spanVisual: ReadonlyArray<string>;
  /** What each inline tag already gives you without one. */
  affordances: Readonly<Record<string, ReadonlyArray<string>>>;
  /** Tags whose content is running text, so inline children stay inline. */
  textTags: ReadonlyArray<string>;
  keptAttrs: ReadonlyArray<string>;
  skippedTags: ReadonlyArray<string>;
  limits: {
    maxDepth: number;
    maxNodes: number;
    maxTextLength: number;
    maxSourceLength: number;
  };
  version: number;
  /**
   * Record each node's box, relative to the page root.
   *
   * On by default. It began as harness-only weight, then turned out to
   * be the only way to tell a width the author chose from a width the
   * element got for free — which is the difference between an import
   * that reflows and a pixel snapshot. Four numbers a node.
   * see docs/plans/website-import-plan.md
   */
  includeRects?: boolean;
};

/** The policy as the page receives it: plain arrays, JSON-safe. */
export const capturePolicy = (): CapturePolicy => ({
  properties: [...CAPTURED_PROPERTIES],
  initial: { ...INITIAL_VALUES },
  inherited: [...INHERITED_PROPERTIES],
  conditional: { ...CONDITIONAL_PROPERTIES },
  inlineTags: [...INLINE_MARKUP_TAGS],
  inlineAttrs: { ...INLINE_MARKUP_ATTRIBUTES },
  spanVisual: [...SPAN_VISUAL_PROPERTIES],
  affordances: { ...INLINE_TAG_AFFORDANCES },
  textTags: [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'label', 'blockquote',
    'figcaption', 'legend', 'dt', 'dd', 'caption', 'th', 'td', 'a', 'span',
    'strong', 'em', 'small', 'button',
  ],
  keptAttrs: [...KEPT_ATTRIBUTES],
  skippedTags: [...SKIPPED_TAGS],
  limits: { ...CAPTURE_LIMITS },
  version: CAPTURE_VERSION,
  includeRects: true,
});

/**
 * Settle the page before reading it.
 *
 * Modern pages reveal content on scroll: an `IntersectionObserver`
 * flips a class and CSS transitions the element in from `opacity: 0`.
 * Capture the page as loaded and everything below the fold is recorded
 * invisible — which looks, in the imported view, exactly like elements
 * missing. Measured on one site: 21 elements at zero opacity on load,
 * 12 after scrolling through, so 9 were waiting to be seen.
 *
 * Scrolling the whole page and returning to the top triggers those
 * observers, and is what a person would have done before deciding they
 * wanted this page.
 * see docs/plans/website-import-plan.md
 */
export const prepareFn = async (): Promise<void> => {
  const step = Math.max(200, window.innerHeight * 0.8);
  const height = document.body.scrollHeight;
  for (let y = 0; y < height; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 400));
};

/**
 * Walk the rendered document into a `CapturePayload`.
 *
 * Runs in the page. Reads nothing but the DOM and its computed styles,
 * and mutates nothing — an import must never change the page it is
 * reading, not least because the user is still looking at it.
 */
export const captureFn = (policy: CapturePolicy): CapturePayload => {
  const props = policy.properties;
  const initial = policy.initial;
  const inherited = new Set(policy.inherited);
  const keptAttrs = new Set(policy.keptAttrs);
  const skipped = new Set(policy.skippedTags);
  const inlineTags = new Set(policy.inlineTags);
  const textTags = new Set(policy.textTags);
  const { maxDepth, maxNodes, maxTextLength } = policy.limits;

  type Note = { kind: string; at?: string; detail?: string };
  const pageNotes: Note[] = [];
  const assets: Array<{ url: string; kind: string; fromNodeId: number }> = [];
  let nextId = 0;
  let nodeBudget = maxNodes;

  /**
   * The page's own word for an element, taken from its class list.
   *
   * Rejects more than it accepts. `css-182dboe`, `MuiSvgIcon-root` and
   * `px-4` are all worse than the tag name; `page-title`, `nav-item`
   * and `eyebrow` are exactly what the layers panel should say.
   * A CSS-module class carries the author's name after its hash, so
   * that half is dug out rather than thrown away.
   * see docs/notes/import-naming.md
   */
  const UTILITY_CLASSES = new Set([
    'flex', 'grid', 'block', 'inline', 'hidden', 'relative', 'absolute',
    'sticky', 'fixed', 'row', 'col', 'container', 'active', 'open',
    'show', 'hide', 'left', 'right', 'center', 'top', 'bottom', 'root',
  ]);

  const nameHintOf = (el: Element): string | null => {
    // `getAttribute`, not `className`: on an SVG element `className` is
    // an `SVGAnimatedString`, so every icon on the page was skipped.
    const raw = (el.getAttribute('class') ?? '').trim();
    if (raw.length === 0) return null;
    let single: string | null = null;
    for (const cls of raw.split(/\s+/)) {
      // `Page-module__a1b2c3__title` → `title`.
      const moduled = cls.match(/^.+?-module__[A-Za-z0-9]+__(.+)$/);
      const name = moduled?.[1] ?? cls;
      if (!/^[A-Za-z][A-Za-z0-9_-]{1,39}$/.test(name)) continue;
      if (UTILITY_CLASSES.has(name.toLowerCase())) continue;
      const parts = name.split(/[-_]/).filter((part) => part.length > 0);
      // Every segment alphabetic: `patient-card` yes, `px-4` no, and
      // `css-182dboe` no. That one test removes most framework noise.
      if (parts.length >= 2 && parts.every((part) => /^[A-Za-z]{2,}$/.test(part))) {
        return parts.join('_').toLowerCase();
      }
      if (single === null && parts.length === 1 && /^[A-Za-z]{4,}$/.test(name)) {
        single = name.toLowerCase();
      }
    }
    return single;
  };

  /** A short, readable path for the report: `div.card > p`. */
  const pathOf = (el: Element): string => {
    const parts: string[] = [];
    let cur: Element | null = el;
    for (let i = 0; cur && i < 4; i += 1) {
      const cls = (cur.getAttribute('class') ?? '').trim().split(/\s+/)[0] ?? '';
      parts.unshift(cur.tagName.toLowerCase() + (cls ? `.${cls}` : ''));
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };

  /**
   * The first `url(...)` in a background-image, resolved absolute.
   *
   * A bare fragment — `url(#gradient)` — points at an SVG definition in
   * the same document, not a file. Resolving it against the base gives
   * a page URL that fetches as a 404, which is how one site produced
   * ten "image could not be fetched" errors for images that were never
   * images. Data URIs are likewise already the bytes.
   */
  const urlIn = (value: string): string | null => {
    // Quoted forms are matched to their own closing quote, not to the
    // first one anywhere. An inline SVG data URI contains both quotes
    // and parens — `url("data:image/svg+xml;utf8,<svg xmlns='…'>")` —
    // and a regex that stops at the first of either captures a
    // fragment, which then resolves into a perfectly fetchable 404.
    const m =
      value.match(/url\(\s*"([^"]*)"\s*\)/) ??
      value.match(/url\(\s*'([^']*)'\s*\)/) ??
      value.match(/url\(\s*([^)\s]*)\s*\)/);
    const raw = m?.[1]?.trim();
    if (raw === undefined || raw.length === 0) return null;
    // A fragment points into this document; a data or blob URI already
    // holds the bytes. Neither is a file to download.
    if (raw.startsWith('#') || raw.startsWith('data:') || raw.startsWith('blob:')) return null;
    try {
      return new URL(raw, document.baseURI).href;
    } catch {
      return null;
    }
  };

  /**
   * An svg's inner markup with paint moved OUT of inline `style` and
   * onto presentation attributes.
   *
   * A line icon carries its paint inline —
   * `style="fill:none;stroke:currentColor;stroke-width:1.6"` — and that
   * string cannot survive the trip. `svgSource` is emitted into a `.tsx`
   * file, so it is converted to JSX, where `style` becomes an OBJECT;
   * the canvas and the HTML exporter then render that string as HTML,
   * where `style={{…}}` is an attribute whose value is `{{` and is
   * discarded. The path falls back to the SVG default — fill black, no
   * stroke — which is a line icon imported as a solid blob.
   *
   * Presentation attributes have no such problem: `fill="none"` is
   * valid in HTML and in JSX, needs no case folding, and keeps
   * `currentColor` working, so the icon stays recolourable rather than
   * becoming a flat picture.
   *
   * Only paint is moved. Anything else in the style is left where it is
   * — a transform or an opacity is not this function's business, and
   * guessing would be a second bug.
   * see docs/notes/import-parity-log.md
   */
  const svgPaintAsAttributes = (svg: Element): string => {
    const PAINT = [
      'fill',
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-dasharray',
      'stroke-opacity',
      'fill-opacity',
      'fill-rule',
      'clip-rule',
      'stop-color',
      'stop-opacity',
    ];
    const clone = svg.cloneNode(true) as Element;
    for (const node of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
      const style = node.getAttribute('style');
      if (style === null || style.length === 0) continue;
      const kept: string[] = [];
      for (const part of style.split(';')) {
        const at = part.indexOf(':');
        if (at < 0) continue;
        const prop = part.slice(0, at).trim().toLowerCase();
        const value = part.slice(at + 1).trim();
        if (prop.length === 0 || value.length === 0) continue;
        // An inline style beats a presentation attribute in the
        // cascade, so it wins here too.
        if (PAINT.includes(prop)) node.setAttribute(prop, value);
        else kept.push(`${prop}: ${value}`);
      }
      if (kept.length > 0) node.setAttribute('style', kept.join('; '));
      else node.removeAttribute('style');
    }
    return clone.innerHTML;
  };

  /**
   * Keep one inset per axis on a positioned element.
   *
   * Insets read back as USED values, so `position: absolute; left: 0`
   * reports `right: 251.656px` too — the leftover space, not a decision.
   * Emitting both of an opposing pair does not position the element, it
   * STRETCHES it between them, overriding the width or height beside it.
   * A "skip to content" link hidden at `top: -100px` came back 4533px
   * tall and painted a dark bar down the whole left edge of the page.
   *
   * There is no way to ask which one the author wrote, so keep the inset
   * nearer its edge on each axis: in this idiom the authored one is the
   * small or zero value and the resolved one is whatever was left over.
   * A negative authored inset — which is how half the web hides
   * accessibility affordances — still wins on absolute value.
   * see docs/notes/import-positioned-insets.md
   */
  const dropResolvedInsets = (styles: Record<string, string>): void => {
    const position = styles['position'];
    if (position !== 'absolute' && position !== 'fixed') return;
    for (const [start, end, size, mStart, mEnd] of [
      ['left', 'right', 'width', 'margin-left', 'margin-right'],
      ['top', 'bottom', 'height', 'margin-top', 'margin-bottom'],
    ] as const) {
      if (styles[start] === undefined || styles[end] === undefined) continue;
      // With a size on this axis the box is already fully determined by
      // ONE inset: left + width fixes both edges. The other inset is
      // then redundant by construction rather than by guesswork, and
      // dropping it reproduces the measured position exactly. Without a
      // size the pair IS the size, so both have to stay.
      if (styles[size] === undefined) continue;
      // Both insets plus auto margins is the CENTRING idiom — `left: 24px;
      // right: 24px; margin: auto` with a max-width centres the box in
      // what is left. Here both insets are authored and dropping either
      // one slams the box against that edge.
      if (styles[mStart] === 'auto' && styles[mEnd] === 'auto') continue;
      delete styles[end];
    }
  };

  type PseudoOut = { text: string; styles: Record<string, string> };

  /**
   * The content value as plain text, or null if it is generated.
   *
   * Chromium normalises a static string to one double-quoted run, and
   * appends ` / "alt text"` when the author gave alternative text for
   * screen readers. Anything else — `url(...)`, `counter(...)`,
   * `attr(...)`, or several runs concatenated — depends on state the
   * model cannot hold.
   */
  const staticContent = (raw: string): string | null => {
    const value = raw.trim().split(' / ')[0]?.trim() ?? '';
    const m = value.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (!m || m[1] === undefined) return null;
    const text = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    return text.trim().length === 0 ? null : text;
  };

  const escapeText = (raw: string): string =>
    raw.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');

  /**
   * One inline element as JSX-safe markup.
   *
   * Not `outerHTML`: a fragment is emitted verbatim into a `.tsx` file,
   * so `class=` would be a React error and page-specific attributes
   * would be noise. Only the attributes that carry meaning survive.
   */
  const inlineSource = (el: Element, depth: number): string => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return '<br />';
    if (depth > 4) return escapeText(el.textContent ?? '');
    const allowed = policy.inlineAttrs[tag] ?? [];
    const attrs: string[] = [];
    for (const name of allowed) {
      const value = el.getAttribute(name);
      if (value === null) continue;
      const resolved =
        name === 'href'
          ? (() => {
              try {
                return new URL(value, document.baseURI).href;
              } catch {
                return value;
              }
            })()
          : value;
      attrs.push(` ${name}="${resolved.replace(/"/g, '&quot;')}"`);
    }
    let inner = '';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3) {
        inner += escapeText(child.textContent ?? '');
      } else if (child.nodeType === 1) {
        const childEl = child as Element;
        inner += inlineTags.has(childEl.tagName.toLowerCase())
          ? inlineSource(childEl, depth + 1)
          : escapeText(childEl.textContent ?? '');
      }
    }
    return `<${tag}${attrs.join('')}>${inner}</${tag}>`;
  };

  type InlineItem =
    | { kind: 'text'; value: string }
    | { kind: 'markup'; source: string }
    | { kind: 'element'; el: Element };

  /**
   * Is this inline tag carrying design a bare tag would not?
   *
   * A `<strong>` emitted on its own is still bold, so weight alone is
   * no reason to make an element of it. A `<span>` brings nothing at
   * all, and an `<em>` given a 10px small-print treatment brings only
   * the italic — the rest came from a class the import cannot carry,
   * and emitting the tag bare loses it. So: anything visible the tag
   * does not already account for, or a box that is not inline at all.
   */
  const carriesDesign = (child: Element, parent: CSSStyleDeclaration): boolean => {
    const tag = child.tagName.toLowerCase();
    if (tag === 'br') return false;
    const cs = window.getComputedStyle(child);
    if (cs.display !== 'inline') return true;
    const free = policy.affordances[tag] ?? [];
    return policy.spanVisual.some(
      (prop) =>
        free.indexOf(prop) < 0 && cs.getPropertyValue(prop) !== parent.getPropertyValue(prop)
    );
  };

  /**
   * Running text with inline markup in it, in source order — or null
   * when this node is not that shape.
   */
  const inlineContentOf = (el: Element, computed: CSSStyleDeclaration): InlineItem[] | null => {
    const tag = el.tagName.toLowerCase();
    if (!textTags.has(tag)) return null;
    // A flex or grid container has no inline content: its children are
    // items it lays out, whatever tags they happen to be. Reading them
    // as running text turned a three-part logo into one bare
    // `<span>Resova</span>` with its weight and size gone.
    const display = computed.display;
    if (
      display === 'flex' || display === 'inline-flex' ||
      display === 'grid' || display === 'inline-grid'
    ) {
      return null;
    }
    const kids = Array.from(el.children);
    if (kids.length === 0) return null;
    if (!kids.every((k) => inlineTags.has(k.tagName.toLowerCase()))) return null;
    const out: InlineItem[] = [];
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3) {
        const value = (child.textContent ?? '').replace(/\s+/g, ' ');
        if (value.trim().length > 0) out.push({ kind: 'text', value });
      } else if (child.nodeType === 1) {
        const childEl = child as Element;
        out.push(
          carriesDesign(childEl, computed)
            ? { kind: 'element', el: childEl }
            : { kind: 'markup', source: inlineSource(childEl, 0) }
        );
      }
    }
    return out.length > 0 ? out : null;
  };

  const visit = (
    el: Element,
    parentStyle: CSSStyleDeclaration | null,
    depth: number,
    path: string
  ): unknown => {
    const tag = el.tagName.toLowerCase();
    if (skipped.has(tag)) return null;

    const computed = window.getComputedStyle(el);
    // An element the page isn't showing is not part of the design. This
    // also prunes the subtree, which is most of what keeps a real page's
    // node count survivable — menus, modals and tab panels are usually
    // present and hidden.
    if (computed.display === 'none' || computed.visibility === 'hidden') return null;

    // Zero opacity means two different things. An element with a
    // transition or animation on opacity is part-way through being
    // revealed and belongs in the design at full strength; one without
    // is deliberately invisible and is left alone.
    let revealed = false;
    if (parseFloat(computed.opacity) === 0) {
      const motion = `${computed.transition} ${computed.animationName}`;
      revealed = motion.indexOf('opacity') >= 0 || computed.animationName !== 'none';
    }

    if (nodeBudget <= 0) return null;
    nodeBudget -= 1;
    const id = nextId++;
    const notes: Note[] = [];

    // Styles: computed, less "nothing set", less inheritance doing its job.
    const styles: Record<string, string> = {};
    for (const prop of props) {
      const value = computed.getPropertyValue(prop);
      if (!value) continue;
      const blank = initial[prop];
      if (blank === value) continue;
      if (Array.isArray(blank) && blank.indexOf(value) >= 0) continue;
      if (inherited.has(prop) && parentStyle && parentStyle.getPropertyValue(prop) === value) {
        continue;
      }
      styles[prop] = value;
    }
    if (revealed) {
      delete styles['opacity'];
      notes.push({ kind: 'revealed-on-scroll', at: pathOf(el) });
    }
    // `-webkit-text-fill-color` resolves to the element's own `color`
    // on everything that never set it, so keeping it unconditionally
    // would put a second colour on every element on the page. It only
    // says something when it disagrees with `color` — which is exactly
    // the gradient-text case.
    if (styles['-webkit-text-fill-color'] === computed.color) {
      delete styles['-webkit-text-fill-color'];
    }
    // Every positioned element, not just pseudo-elements.
    // see docs/notes/import-positioned-insets.md
    dropResolvedInsets(styles);

    // Scamp renders every box as `border-box` — its own reset says so —
    // but `getComputedStyle` reports `width` and `height` in whatever
    // box the page chose. A page without a border-box reset reports the
    // CONTENT size, and reading that back as a border-box size eats the
    // padding: a header measured 194px tall came out 146px with its
    // contents spilling, which is exactly its 24px of padding twice.
    if (computed.boxSizing === 'content-box') {
      const edge = (...props: string[]): number =>
        props.reduce((sum, prop) => sum + (parseFloat(computed.getPropertyValue(prop)) || 0), 0);
      const grow = (prop: string, by: number): void => {
        const value = styles[prop];
        if (value === undefined || by === 0) return;
        const size = parseFloat(value);
        if (!Number.isFinite(size) || !value.endsWith('px')) return;
        styles[prop] = `${Math.round((size + by) * 1000) / 1000}px`;
      };
      grow('width', edge('padding-left', 'padding-right', 'border-left-width', 'border-right-width'));
      grow('height', edge('padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width'));
    }

    // Drop values that are a layout result rather than a decision: a
    // border colour with no border, an origin with no transform.
    for (const [prop, requires] of Object.entries(policy.conditional)) {
      if (!(prop in styles)) continue;
      if (requires === null || !(requires in styles)) delete styles[prop];
    }

    // Attributes worth carrying. `src` is resolved absolute so the
    // downloader doesn't have to know the page's base URL.
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!keptAttrs.has(name)) continue;
      if (name === 'src' || name === 'href') {
        // A fragment, data URI or scheme-only value is not a location to
        // resolve. Resolving `#n` against the base turns it into a page
        // URL that looks perfectly fetchable and 404s — ten of those
        // were reported as failed images on one site.
        const value = attr.value.trim();
        if (value.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
          attrs[name] = value;
          continue;
        }
        try {
          const resolved = new URL(value, document.baseURI);
          // A link to somewhere else on the SAME site stays relative.
          // Resolving it absolute points the imported project back at
          // the page it copied — every nav item leaving the app. `src`
          // is the opposite: the downloader needs somewhere to fetch
          // from, so it keeps the absolute form.
          attrs[name] =
            name === 'href' && resolved.origin === location.origin
              ? `${resolved.pathname}${resolved.search}${resolved.hash}`
              : resolved.href;
        } catch {
          attrs[name] = value;
        }
        continue;
      }
      attrs[name] = attr.value;
    }

    const imgSrc = attrs['src'];
    if (tag === 'img' && imgSrc && /^https?:/.test(imgSrc)) {
      assets.push({ url: imgSrc, kind: 'image', fromNodeId: id });
    }
    const bg = styles['background-image'];
    if (bg) {
      const url = urlIn(bg);
      if (url) {
        assets.push({ url, kind: 'image', fromNodeId: id });
        notes.push({ kind: 'background-image', at: pathOf(el), detail: url });
      }
    }

    // `::before` / `::after`. Static text is recovered as a real
    // element by the reducer; anything generated — a url, a counter, an
    // attr — has nowhere to live in the model and is reported instead.
    let pseudo: { before?: PseudoOut; after?: PseudoOut } | undefined;
    for (const which of ['::before', '::after']) {
      const pseudoStyle = window.getComputedStyle(el, which);
      const content = pseudoStyle.content;
      if (!content || content === 'none' || content === 'normal' || content === '""') continue;
      const text = staticContent(content);
      if (text === null) {
        notes.push({ kind: 'pseudo-element', at: `${pathOf(el)}${which}`, detail: content });
        continue;
      }
      const pseudoStyles: Record<string, string> = {};
      for (const prop of props) {
        const value = pseudoStyle.getPropertyValue(prop);
        if (!value) continue;
        const blank = initial[prop];
        if (blank === value) continue;
        if (Array.isArray(blank) && blank.indexOf(value) >= 0) continue;
        // Inherited values are compared against the HOST, which is what
        // the pseudo-element actually inherits from.
        if (inherited.has(prop) && computed.getPropertyValue(prop) === value) continue;
        pseudoStyles[prop] = value;
      }
      for (const [prop, requires] of Object.entries(policy.conditional)) {
        if (!(prop in pseudoStyles)) continue;
        if (requires === null || !(requires in pseudoStyles)) delete pseudoStyles[prop];
      }
      // Same rule as an element's: it only says something when it
      // disagrees with `color`, and on a glyph it never does.
      if (pseudoStyles['-webkit-text-fill-color'] === pseudoStyle.color) {
        delete pseudoStyles['-webkit-text-fill-color'];
      }
      // A pseudo-element's computed width and height are used values
      // measured around the glyph. Carrying them pins a "✓" to the
      // width it happened to take in whatever face the page had.
      delete pseudoStyles['width'];
      delete pseudoStyles['height'];
      dropResolvedInsets(pseudoStyles);
      pseudo = pseudo ?? {};
      pseudo[which === '::before' ? 'before' : 'after'] = { text, styles: pseudoStyles };
    }
    // A shadow host that paints nothing lost nothing. Next.js puts a
    // 0x0 `<next-route-announcer>` on every page it renders, and
    // reporting it as an unreadable web component put a false loss at
    // the top of every import report — which is how a report stops
    // being read.
    if (el.shadowRoot) {
      const hostBox = el.getBoundingClientRect();
      if (hostBox.width > 0 && hostBox.height > 0) {
        notes.push({ kind: 'shadow-root', at: pathOf(el) });
      }
    }
    if (tag === 'canvas') notes.push({ kind: 'canvas', at: pathOf(el) });
    if (tag === 'iframe') notes.push({ kind: 'iframe', at: pathOf(el) });
    // An inline SVG is almost always an icon, and Scamp keeps svg inner
    // markup verbatim (`svgSource`), so it can come across whole rather
    // than as an empty box. Only the note changes meaning: the shape is
    // preserved, it just isn't editable as elements.
    let svgSource: string | null = null;
    if (tag === 'svg') {
      svgSource = svgPaintAsAttributes(el);
      for (const name of ['viewBox', 'fill', 'stroke', 'stroke-width', 'xmlns']) {
        const value = el.getAttribute(name);
        if (value !== null) attrs[name] = value;
      }

      // An icon's paint is usually a CSS rule — `svg { fill: currentColor }`
      // — not an attribute, and `fill` and `stroke` are not worth
      // capturing on the other 4000 elements of a page, so they are read
      // here. Without them every imported icon arrived with no fill at
      // all and rendered in the initial black, on a dark page.
      //
      // Where the paint IS the text colour, `currentColor` is kept as
      // written rather than resolved: it is what the page meant, it
      // keeps the icon following the colour around it, and it is what
      // Scamp's own "current color" swatch edits.
      // see docs/notes/svg-recolor.md
      const asWritten = (value: string): string =>
        value === computed.color ? 'currentColor' : value;
      const paint = computed.fill;
      if (paint && paint !== 'rgb(0, 0, 0)' && paint !== 'none') {
        styles['fill'] = asWritten(paint);
      }
      const line = computed.stroke;
      if (line && line !== 'none') {
        styles['stroke'] = asWritten(line);
        const width = computed.strokeWidth;
        if (width && width !== '1px') styles['stroke-width'] = width;
      }
      notes.push({ kind: 'svg', at: pathOf(el) });
    }

    // Direct text, kept separate from element children so the reducer
    // can apply Scamp's rule that text lives in a text element.
    let text: string | null = null;
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (ownText) text = ownText.slice(0, maxTextLength);

    // Where those words sat among the element children, so the child
    // they get lifted into can land in the same place.
    let textAfterChildIndex = -1;
    if (text !== null) {
      let seen = 0;
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === 1) {
          seen += 1;
          continue;
        }
        if (child.nodeType === 3 && (child.textContent ?? '').trim().length > 0) {
          textAfterChildIndex = seen - 1;
          break;
        }
      }
    }

    // An element item is walked like any other child, so a styled span
    // arrives as a node and the reducer can make it an element that
    // sits in the line. see docs/notes/import-inline-spans.md
    const inlineItems = inlineContentOf(el, computed);
    let inline: unknown[] | null = null;
    if (inlineItems !== null) {
      const built: unknown[] = [];
      let index = 0;
      for (const item of inlineItems) {
        if (item.kind !== 'element') {
          built.push(item);
          continue;
        }
        const childPath = `${path}>${item.el.tagName.toLowerCase()}:${index}`;
        index += 1;
        const node = depth >= maxDepth ? null : visit(item.el, computed, depth + 1, childPath);
        // Hidden, or too deep to walk: keep the words rather than the
        // box, which is still better than losing the run.
        built.push(
          node === null
            ? { kind: 'markup', source: inlineSource(item.el, 0) }
            : { kind: 'element', node }
        );
      }
      inline = built;
    }
    const children: unknown[] = [];
    if (inline !== null) {
      // Its children ARE its content; walking them would make boxes of
      // words. `text` stays null — the ordered run carries everything.
      text = null;
    } else if (depth >= maxDepth) {
      if (el.children.length > 0) {
        notes.push({ kind: 'depth-capped', at: pathOf(el), detail: String(maxDepth) });
      }
    } else if (tag !== 'svg') {
      // An svg's internals are its own language; the element is kept,
      // its children are not walked.
      const siblings = Array.from(el.children);
      siblings.forEach((child, index) => {
        const childPath = `${path}>${child.tagName.toLowerCase()}:${index}`;
        const built = visit(child, computed, depth + 1, childPath);
        if (built) children.push(built);
      });
    }

    const built: Record<string, unknown> = { id, tag, styles, text, attrs, children, notes };
    if (svgSource !== null) built['svgSource'] = svgSource;
    built['path'] = path;
    if (inline !== null) built['inline'] = inline;
    if (pseudo !== undefined) built['pseudo'] = pseudo;
    const hint = nameHintOf(el);
    if (hint !== null) built['nameHint'] = hint;
    if (text !== null && el.children.length > 0) {
      built['textAfterChildIndex'] = textAfterChildIndex;
    }
    if (policy.includeRects) {
      const box = el.getBoundingClientRect();
      built['rect'] = {
        x: Math.round((box.left + window.scrollX) * 100) / 100,
        y: Math.round((box.top + window.scrollY) * 100) / 100,
        w: Math.round(box.width * 100) / 100,
        h: Math.round(box.height * 100) / 100,
      };
    }
    return built;
  };

  const rootEl = document.body;
  const root = visit(rootEl, null, 0, 'body');
  if (nodeBudget <= 0) {
    pageNotes.push({ kind: 'node-capped', detail: String(maxNodes) });
  }

  // The page exactly as it was, kept beside the reduction. Read AFTER
  // the walk so it reflects the same settled page the tree describes —
  // `prepareFn` has already scrolled the reveals in.
  const readSource = (): CapturedSource => {
    const cap = policy.limits.maxSourceLength;
    const unreadable: string[] = [];
    const parts: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRule[];
      try {
        // Cross-origin without CORS throws here rather than returning
        // nothing, which is why this is a try and not a null check.
        rules = Array.from(sheet.cssRules);
      } catch {
        if (sheet.href) unreadable.push(sheet.href);
        continue;
      }
      parts.push(sheet.href ? `/* ${sheet.href} */` : '/* <style> */');
      for (const rule of rules) parts.push(rule.cssText);
    }
    const html = document.documentElement.outerHTML;
    const css = parts.join('\n');
    return {
      html: html.slice(0, cap),
      css: css.slice(0, cap),
      unreadable,
      truncated: html.length > cap || css.length > cap,
    };
  };

  return {
    version: policy.version,
    url: location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    root,
    assets,
    notes: pageNotes,
    source: readSource(),
  } as CapturePayload;
};
