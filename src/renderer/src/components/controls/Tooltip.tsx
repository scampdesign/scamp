import {
  cloneElement,
  ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { splitTooltipLabel } from '@lib/tooltipLabel';
import {
  resolveTooltipPlacement,
  TOOLTIP_GAP,
  type TooltipPlacement,
} from '@lib/tooltipPlacement';
import styles from './Tooltip.module.css';

/**
 * Inset from the viewport edge the tooltip should keep — tooltips
 * sliding right up against the window border look pinched, especially
 * on the right where the properties panel lives.
 */
const VIEWPORT_INSET = 12;

type Props = {
  /** Tooltip body text shown on hover. Supports `\n` line breaks. */
  label: string;
  /**
   * Optional header rendered above the body with a subtle
   * border-bottom separator — typically the field name ("Height").
   * When omitted, a `Name — description` label splits into a header
   * and body automatically (see `@lib/tooltipLabel`). Either way the
   * body steps down to secondary text so the name reads as the title.
   */
  header?: string;
  /**
   * The element to hover over. Must be a single React element that can
   * accept `onMouseEnter` / `onMouseLeave` / `onFocus` / `onBlur` handlers.
   */
  children: ReactElement;
  /** Hover delay in ms before showing. Default 400. */
  delay?: number;
  /** Show only while the trigger's own text is cut off, for a name that may not fit. */
  onlyWhenTruncated?: boolean;
  /**
   * Which side of the trigger to render on. `'auto'` (the default) flips
   * to `'bottom'` when the trigger is too close to the top edge for the
   * bubble to fit — this keeps the top toolbar's tooltips from clipping.
   */
  placement?: TooltipPlacement | 'auto';
};

type Position = {
  left: number;
  top: number;
  placement: TooltipPlacement;
};

/**
 * Small custom tooltip. Matches the project's in-app tooltip design (dark
 * background, mono font, subtle border + shadow). Portaled to `document.body`
 * so it escapes overflow clipping from parent panels.
 *
 * The wrapper clones the child and attaches hover/focus handlers — it
 * doesn't add an extra DOM node, so layout of the trigger is preserved.
 */
export const Tooltip = ({
  label,
  header,
  children,
  delay = 400,
  placement = 'auto',
  onlyWhenTruncated = false,
}: Props): JSX.Element => {
  // An explicit `header` prop always wins; otherwise fall back to the
  // `Name — description` convention baked into most label strings.
  const parts = splitTooltipLabel(label);
  const resolvedHeader = header ?? parts.header;
  const resolvedBody = header === undefined ? parts.body : label;

  const [position, setPosition] = useState<Position | null>(null);
  const timerRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  // The trigger's rect at show-time, stashed so the post-mount layout
  // effect can decide placement (needs the tip's measured height) and
  // anchor to the correct edge.
  const triggerRectRef = useRef<DOMRect | null>(null);

  const show = (): void => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    triggerRectRef.current = rect;
    // Provisional: above the trigger, horizontally centered. The layout
    // effect below clamps left to the viewport and flips to `bottom`
    // when there isn't room above, once the tip's height is known.
    setPosition({
      left: rect.left + rect.width / 2,
      top: rect.top,
      placement: 'top',
    });
  };

  // After the tooltip mounts, measure its rendered width and shift
  // the anchor leftward when the centered-above position would
  // spill off the viewport's right edge. Most tooltips in Scamp
  // live inside the properties panel on the right side of the
  // window, so without this clamp the right edge regularly clips.
  useLayoutEffect(() => {
    if (position === null) return;
    const tip = tooltipRef.current;
    const rect = triggerRectRef.current;
    if (!tip || !rect) return;
    const tipWidth = tip.offsetWidth;
    // The tooltip's CSS uses `translate(-50%, ...)`, so `position.left`
    // is the centerpoint and the tooltip extends ±tipWidth/2 from it.
    const halfWidth = tipWidth / 2;
    const minLeft = halfWidth + VIEWPORT_INSET;
    const maxLeft = window.innerWidth - halfWidth - VIEWPORT_INSET;
    let nextLeft = position.left;
    if (nextLeft > maxLeft) nextLeft = maxLeft;
    if (nextLeft < minLeft) nextLeft = minLeft;
    // Flip below when the trigger is too near the top edge to fit the
    // bubble above it. Anchor at the trigger's bottom edge when flipped.
    const nextPlacement = resolveTooltipPlacement(
      rect.top,
      tip.offsetHeight + TOOLTIP_GAP,
      placement
    );
    const nextTop = nextPlacement === 'bottom' ? rect.bottom : rect.top;
    if (
      nextLeft !== position.left ||
      nextTop !== position.top ||
      nextPlacement !== position.placement
    ) {
      setPosition({ left: nextLeft, top: nextTop, placement: nextPlacement });
    }
  }, [position, placement]);

  const handleEnter = (): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const node = triggerRef.current;
    if (onlyWhenTruncated && node !== null && node.scrollWidth <= node.clientWidth) return;
    timerRef.current = window.setTimeout(show, delay);
  };

  const handleLeave = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPosition(null);
  };

  /**
   * A focus raised by clicking the trigger must not open a tooltip: the
   * pointer is already parked on it so no `mouseleave` follows, and the
   * canvas's mousedown handlers call preventDefault, so the input may
   * never blur either. The tooltip then sits there until the user finds
   * something that does steal focus. Keyboard focus keeps working.
   *
   * `:focus-visible` can't decide this — a text input matches it however
   * it was focused — so the pointer press is recorded instead.
   */
  const pointerFocusRef = useRef(false);

  const handlePointerDown = (): void => {
    pointerFocusRef.current = true;
    handleLeave();
  };

  const handleFocus = (): void => {
    if (pointerFocusRef.current) {
      pointerFocusRef.current = false;
      return;
    }
    handleEnter();
  };

  const handleBlur = (): void => {
    pointerFocusRef.current = false;
    handleLeave();
  };

  // Escape dismisses, the conventional out for a tooltip that has
  // outstayed its welcome. Only bound while one is actually open.
  useEffect(() => {
    if (position === null) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPosition(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [position]);

  const childProps = children.props as {
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onPointerDown?: (e: React.PointerEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
  };

  const trigger = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Preserve any existing ref on the child.
      const childRef = (children as unknown as { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof childRef === 'function') childRef(node);
      else if (childRef && typeof childRef === 'object') {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      childProps.onMouseEnter?.(e);
      handleEnter();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      childProps.onMouseLeave?.(e);
      handleLeave();
    },
    onPointerDown: (e: React.PointerEvent) => {
      childProps.onPointerDown?.(e);
      handlePointerDown();
    },
    onFocus: (e: React.FocusEvent) => {
      childProps.onFocus?.(e);
      handleFocus();
    },
    onBlur: (e: React.FocusEvent) => {
      childProps.onBlur?.(e);
      handleBlur();
    },
  });

  return (
    <>
      {trigger}
      {position !== null &&
        createPortal(
          <div
            ref={tooltipRef}
            className={`${styles.tooltip} ${
              position.placement === 'bottom' ? styles.bottom : ''
            }`}
            style={{
              left: position.left,
              top: position.top,
            }}
            role="tooltip"
          >
            {resolvedHeader !== null && (
              <p className={styles.tooltipHeader}>{resolvedHeader}</p>
            )}
            <p
              className={`${styles.tooltipText} ${
                resolvedHeader !== null ? styles.tooltipBody : ''
              }`}
            >
              {resolvedBody}
            </p>
          </div>,
          document.body
        )}
    </>
  );
};
