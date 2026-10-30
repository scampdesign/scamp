import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { cloneElement, useEffect, useLayoutEffect, useRef, useState, } from 'react';
import { createPortal } from 'react-dom';
import { splitTooltipLabel } from '@lib/tooltipLabel';
import { resolveTooltipPlacement, TOOLTIP_GAP, } from '@lib/tooltipPlacement';
import styles from './Tooltip.module.css';
/**
 * Inset from the viewport edge the tooltip should keep — tooltips
 * sliding right up against the window border look pinched, especially
 * on the right where the properties panel lives.
 */
const VIEWPORT_INSET = 12;
/**
 * Small custom tooltip. Matches the project's in-app tooltip design (dark
 * background, mono font, subtle border + shadow). Portaled to `document.body`
 * so it escapes overflow clipping from parent panels.
 *
 * The wrapper clones the child and attaches hover/focus handlers — it
 * doesn't add an extra DOM node, so layout of the trigger is preserved.
 */
export const Tooltip = ({ label, header, children, delay = 400, placement = 'auto', onlyWhenTruncated = false, }) => {
    // An explicit `header` prop always wins; otherwise fall back to the
    // `Name — description` convention baked into most label strings.
    const parts = splitTooltipLabel(label);
    const resolvedHeader = header ?? parts.header;
    const resolvedBody = header === undefined ? parts.body : label;
    const [position, setPosition] = useState(null);
    const timerRef = useRef(null);
    const triggerRef = useRef(null);
    const tooltipRef = useRef(null);
    // The trigger's rect at show-time, stashed so the post-mount layout
    // effect can decide placement (needs the tip's measured height) and
    // anchor to the correct edge.
    const triggerRectRef = useRef(null);
    const show = () => {
        const el = triggerRef.current;
        if (!el)
            return;
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
        if (position === null)
            return;
        const tip = tooltipRef.current;
        const rect = triggerRectRef.current;
        if (!tip || !rect)
            return;
        const tipWidth = tip.offsetWidth;
        // The tooltip's CSS uses `translate(-50%, ...)`, so `position.left`
        // is the centerpoint and the tooltip extends ±tipWidth/2 from it.
        const halfWidth = tipWidth / 2;
        const minLeft = halfWidth + VIEWPORT_INSET;
        const maxLeft = window.innerWidth - halfWidth - VIEWPORT_INSET;
        let nextLeft = position.left;
        if (nextLeft > maxLeft)
            nextLeft = maxLeft;
        if (nextLeft < minLeft)
            nextLeft = minLeft;
        // Flip below when the trigger is too near the top edge to fit the
        // bubble above it. Anchor at the trigger's bottom edge when flipped.
        const nextPlacement = resolveTooltipPlacement(rect.top, tip.offsetHeight + TOOLTIP_GAP, placement);
        const nextTop = nextPlacement === 'bottom' ? rect.bottom : rect.top;
        if (nextLeft !== position.left ||
            nextTop !== position.top ||
            nextPlacement !== position.placement) {
            setPosition({ left: nextLeft, top: nextTop, placement: nextPlacement });
        }
    }, [position, placement]);
    const handleEnter = () => {
        if (timerRef.current !== null)
            window.clearTimeout(timerRef.current);
        const node = triggerRef.current;
        if (onlyWhenTruncated && node !== null && node.scrollWidth <= node.clientWidth)
            return;
        timerRef.current = window.setTimeout(show, delay);
    };
    const handleLeave = () => {
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
    const handlePointerDown = () => {
        pointerFocusRef.current = true;
        handleLeave();
    };
    const handleFocus = () => {
        if (pointerFocusRef.current) {
            pointerFocusRef.current = false;
            return;
        }
        handleEnter();
    };
    const handleBlur = () => {
        pointerFocusRef.current = false;
        handleLeave();
    };
    // Escape dismisses, the conventional out for a tooltip that has
    // outstayed its welcome. Only bound while one is actually open.
    useEffect(() => {
        if (position === null)
            return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape')
                setPosition(null);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [position]);
    const childProps = children.props;
    const trigger = cloneElement(children, {
        ref: (node) => {
            triggerRef.current = node;
            // Preserve any existing ref on the child.
            const childRef = children.ref;
            if (typeof childRef === 'function')
                childRef(node);
            else if (childRef && typeof childRef === 'object') {
                childRef.current = node;
            }
        },
        onMouseEnter: (e) => {
            childProps.onMouseEnter?.(e);
            handleEnter();
        },
        onMouseLeave: (e) => {
            childProps.onMouseLeave?.(e);
            handleLeave();
        },
        onPointerDown: (e) => {
            childProps.onPointerDown?.(e);
            handlePointerDown();
        },
        onFocus: (e) => {
            childProps.onFocus?.(e);
            handleFocus();
        },
        onBlur: (e) => {
            childProps.onBlur?.(e);
            handleBlur();
        },
    });
    return (_jsxs(_Fragment, { children: [trigger, position !== null &&
                createPortal(_jsxs("div", { ref: tooltipRef, className: `${styles.tooltip} ${position.placement === 'bottom' ? styles.bottom : ''}`, style: {
                        left: position.left,
                        top: position.top,
                    }, role: "tooltip", children: [resolvedHeader !== null && (_jsx("p", { className: styles.tooltipHeader, children: resolvedHeader })), _jsx("p", { className: `${styles.tooltipText} ${resolvedHeader !== null ? styles.tooltipBody : ''}`, children: resolvedBody })] }), document.body)] }));
};
