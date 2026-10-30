import {
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { classifyHref } from '@lib/linkHref';
import styles from './LinkIndicators.module.css';
import { canvasNodeById } from './canvasDom';

type Props = {
  frameRef: RefObject<HTMLDivElement>;
};

type Indicator = {
  elementId: string;
  href: string;
  /** True when the href is a `/page` reference whose target page
   *  doesn't exist in the project. */
  broken: boolean;
  /** True when the href is an absolute external URL (http(s):, mailto:,
   *  tel:). Click opens the system browser instead of navigating the
   *  canvas. */
  external: boolean;
  /** Page slug to navigate to, when the href resolves to an internal page. */
  pageName: string | null;
  /** Frame-local pixel rect of the element this indicator hovers over. */
  rect: { x: number; y: number; w: number; h: number };
};

/**
 * Floating chain icon overlay rendered inside the canvas frame on the
 * currently-selected element when that element has a non-empty
 * `attributes.href`. Click navigates the canvas to the linked page
 * (internal) or opens the system browser (external). Broken links —
 * `/<slug>` references whose page isn't in the project — render with
 * a strikethrough variant so the user notices.
 *
 * Scoped to the active selection so the canvas isn't visually
 * polluted by chain icons on every linked element. The Properties
 * panel's Link section is the canonical place to see / edit any
 * element's link state; the indicator is a quick visual confirmation
 * + jump-to-page affordance for the element you're already on.
 *
 * Positions are recomputed on every elements / pageNames / selection
 * change AND via a ResizeObserver on the canvas frame so the
 * indicator tracks elements that move via flex/grid layout shifts.
 */
export const LinkIndicators = ({ frameRef }: Props): JSX.Element | null => {
  const elements = useCanvasStore((s) => s.elements);
  const pageNames = useCanvasStore((s) => s.pageNames);
  const selectedElementIds = useCanvasStore((s) => s.selectedElementIds);
  const requestPageNavigation = useCanvasStore(
    (s) => s.requestPageNavigation
  );

  // Only the selected elements with a non-empty href contribute an
  // indicator. Multi-select is supported (every selected linked
  // element gets its own icon) but the common case is a single
  // selection.
  const linked = useMemo(() => {
    const out: Array<{ id: string; href: string }> = [];
    for (const id of selectedElementIds) {
      const el = elements[id];
      if (!el) continue;
      const href = el.attributes?.href;
      if (typeof href === 'string' && href.length > 0) {
        out.push({ id, href });
      }
    }
    return out;
  }, [elements, selectedElementIds]);

  const [indicators, setIndicators] = useState<ReadonlyArray<Indicator>>([]);

  const measure = useCallback((): void => {
    const frame = frameRef.current;
    if (!frame) return;
    const next: Indicator[] = [];
    for (const { id, href } of linked) {
      const node = canvasNodeById(id);
      if (node === null) continue;
      // Walk the offsetParent chain to recover frame-local logical
      // pixel coordinates — same approach as `measureElementInFrame`
      // in CanvasInteractionLayer. transform: scale on the frame
      // doesn't affect offset* values.
      let x = 0;
      let y = 0;
      let cur: HTMLElement | null = node;
      while (cur && cur !== frame) {
        x += cur.offsetLeft;
        y += cur.offsetTop;
        cur = cur.offsetParent as HTMLElement | null;
      }
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      const classification = classifyHref(href, pageNames);
      next.push({
        elementId: id,
        href,
        broken: classification.kind === 'broken',
        external: classification.kind === 'external',
        pageName:
          classification.kind === 'page' || classification.kind === 'broken'
            ? classification.pageName
            : null,
        rect: { x, y, w, h },
      });
    }
    setIndicators(next);
  }, [linked, pageNames, frameRef]);

  // Re-measure whenever the linked-elements list or page list changes,
  // and on every frame resize.
  useEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(frame);
    return () => ro.disconnect();
  }, [frameRef, measure]);

  if (indicators.length === 0) return null;

  const handleClick = (
    e: MouseEvent<HTMLButtonElement>,
    ind: Indicator
  ): void => {
    // Stop the click from bubbling into the canvas interaction layer's
    // pointer handler — selecting the element on link-icon click is
    // not what the user wants.
    e.stopPropagation();
    e.preventDefault();
    if (ind.broken) return;
    if (ind.external) {
      // Electron's main BrowserWindow has a setWindowOpenHandler that
      // routes window.open URLs through shell.openExternal — same
      // mechanism the rest of the editor uses for outbound links.
      window.open(ind.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (ind.pageName !== null) {
      requestPageNavigation(ind.pageName);
    }
  };

  return (
    <>
      {indicators.map((ind) => {
        const tooltip = ind.broken
          ? `Links to /${ind.pageName ?? ''} (page not found in this project)`
          : ind.external
            ? `Opens ${ind.href} in the system browser`
            : `Links to ${ind.href}`;
        return (
          <button
            key={ind.elementId}
            type="button"
            className={`${styles.indicator} ${
              ind.broken ? styles.broken : styles.valid
            }`}
            style={{
              left: ind.rect.x + ind.rect.w - INDICATOR_INSET,
              top: ind.rect.y - INDICATOR_HALF,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => handleClick(e, ind)}
            title={tooltip}
            aria-label={tooltip}
          >
            <ChainIcon broken={ind.broken} />
          </button>
        );
      })}
    </>
  );
};

/** Distance from the element's right edge to the indicator's right edge. */
const INDICATOR_INSET = 8;
/** Half the indicator's diameter — used to centre it on the element corner. */
const INDICATOR_HALF = 9;

const ChainIcon = ({ broken }: { broken: boolean }): JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M6.5 4.5h-1a3 3 0 0 0 0 6h1m3 0h1a3 3 0 0 0 0-6h-1m-3 3h4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    {broken && (
      <path
        d="M2 14L14 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    )}
  </svg>
);
