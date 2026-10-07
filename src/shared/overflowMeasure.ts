/// <reference lib="dom" />
// The DOM lib is pulled in for this file alone, as in captureScript.ts:
// `measureOverflowFn` runs inside the rendered page.

/**
 * What overflows on a rendered view — measured by the browser, not
 * guessed from styles. Runs in a hidden window over the view's HTML
 * export (main/agent/overflowRender.ts); the renderer maps each class
 * back to an element (@lib/overflowReport).
 * see docs/notes/agent-overflow-check.md
 */

export type OverflowKind =
  /** Past an edge of the page: off-screen, or widening it. */
  | 'off-page'
  /** Outside its parent, which lets it show. */
  | 'outside-parent'
  /** Outside its parent, which cuts it off (overflow: hidden / clip). */
  | 'clipped'
  /** Outside its parent, which scrolls to it (overflow: auto / scroll). */
  | 'scrolls'
  /** Its own text runs past its box. */
  | 'text-spills';

export type OverflowFinding = {
  kind: OverflowKind;
  /** The element's first class, as exported (`inst__child_x` inside an instance). */
  cls: string;
  /** The box it overflows: its parent's first class, or null for the page. */
  parentCls: string | null;
  /** How far past each side, in px; 0 when inside. */
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
  position: string;
  /** The overflow setting that decides how it shows: the parent's, or its own for text. */
  overflow: string;
  whiteSpace: string;
  /** Elements with this class and finding — rows of a list share one. */
  count: number;
};

export type OverflowReport = {
  /** The window's width, which the view was laid out at. */
  viewportWidth: number;
  pageWidth: number;
  pageHeight: number;
  findings: OverflowFinding[];
  /** Findings past the cap, left out. */
  more: number;
};

/** Self-contained: serialized with `toString()` and run in the page. */
export const measureOverflowFn = (limit: number): OverflowReport => {
  const TOLERANCE = 1;
  const doc = document.documentElement;
  const viewportWidth = doc.clientWidth;
  const firstClass = (el: Element): string => (el.getAttribute('class') ?? '').trim().split(/\s+/)[0] ?? '';
  const round = (n: number): number => Math.max(0, Math.round(n));
  const shows = (el: Element): boolean => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };
  /** The nearest ancestor with a box — `display: contents` has none. */
  const boxParent = (el: Element): Element | null => {
    let p = el.parentElement;
    while (p !== null && p !== document.body && getComputedStyle(p).display === 'contents') p = p.parentElement;
    return p === null || p === document.body || p === doc ? null : p;
  };

  const found = new Map<string, OverflowFinding>();
  // An escaping element's whole subtree escapes with it: report its root once.
  const reported = new Set<Element>();
  const insideReported = (el: Element): boolean => {
    for (let p = el.parentElement; p !== null; p = p.parentElement) if (reported.has(p)) return true;
    return false;
  };
  const add = (el: Element, finding: Omit<OverflowFinding, 'count'>): void => {
    reported.add(el);
    const key = `${finding.kind}|${finding.cls}`;
    const had = found.get(key);
    if (had === undefined) {
      found.set(key, { ...finding, count: 1 });
      return;
    }
    had.count += 1;
    had.top = Math.max(had.top, finding.top);
    had.right = Math.max(had.right, finding.right);
    had.bottom = Math.max(had.bottom, finding.bottom);
    had.left = Math.max(had.left, finding.left);
  };

  for (const el of Array.from(document.body.querySelectorAll('[class]'))) {
    if (!shows(el) || insideReported(el)) continue;
    const cls = firstClass(el);
    if (cls.length === 0) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const base = { cls, width: Math.round(r.width), height: Math.round(r.height), position: cs.position, whiteSpace: cs.whiteSpace };

    const page = {
      top: round(-(r.top + window.scrollY)),
      right: round(r.right + window.scrollX - viewportWidth),
      bottom: 0,
      left: round(-(r.left + window.scrollX)),
    };
    if (page.top > TOLERANCE || page.right > TOLERANCE || page.left > TOLERANCE) {
      add(el, { ...base, kind: 'off-page', parentCls: null, ...page, overflow: 'visible' });
      continue;
    }

    const parent = boxParent(el);
    if (parent !== null && cs.position !== 'fixed') {
      const pr = parent.getBoundingClientRect();
      const out = {
        top: round(pr.top - r.top),
        right: round(r.right - pr.right),
        bottom: round(r.bottom - pr.bottom),
        left: round(pr.left - r.left),
      };
      if (out.top > TOLERANCE || out.right > TOLERANCE || out.bottom > TOLERANCE || out.left > TOLERANCE) {
        const pcs = getComputedStyle(parent);
        const horizontal = out.left > TOLERANCE || out.right > TOLERANCE;
        const overflow = horizontal ? pcs.overflowX : pcs.overflowY;
        const kind: OverflowKind =
          overflow === 'hidden' || overflow === 'clip' ? 'clipped' : overflow === 'auto' || overflow === 'scroll' ? 'scrolls' : 'outside-parent';
        add(el, { ...base, kind, parentCls: firstClass(parent), ...out, overflow });
        continue;
      }
    }

    // Words wider than their box, with nothing inside to blame.
    if (el.children.length === 0 && (el.textContent ?? '').trim().length > 0) {
      const spill = el.scrollWidth - el.clientWidth;
      if (spill > TOLERANCE && cs.overflowX === 'visible') {
        add(el, { ...base, kind: 'text-spills', parentCls: null, top: 0, right: round(spill), bottom: 0, left: 0, overflow: cs.overflowX });
      }
    }
  }

  const all = [...found.values()].sort(
    (a, b) => Math.max(b.top, b.right, b.bottom, b.left) - Math.max(a.top, a.right, a.bottom, a.left)
  );
  return {
    viewportWidth,
    pageWidth: doc.scrollWidth,
    pageHeight: doc.scrollHeight,
    findings: all.slice(0, limit),
    more: Math.max(0, all.length - limit),
  };
};
