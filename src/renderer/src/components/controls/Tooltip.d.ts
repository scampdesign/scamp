import { ReactElement } from 'react';
import { type TooltipPlacement } from '@lib/tooltipPlacement';
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
/**
 * Small custom tooltip. Matches the project's in-app tooltip design (dark
 * background, mono font, subtle border + shadow). Portaled to `document.body`
 * so it escapes overflow clipping from parent panels.
 *
 * The wrapper clones the child and attaches hover/focus handlers — it
 * doesn't add an extra DOM node, so layout of the trigger is preserved.
 */
export declare const Tooltip: ({ label, header, children, delay, placement, onlyWhenTruncated, }: Props) => JSX.Element;
export {};
