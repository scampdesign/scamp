type Props = {
    /** `vertical` sits on a left or right edge and drags sideways; `horizontal` sits on a top edge. */
    orientation: 'vertical' | 'horizontal';
    /** 1 when dragging right or down grows the panel, -1 when left or up does. */
    direction: 1 | -1;
    /** The size the panel draws at now. */
    value: number;
    min: number;
    max: number;
    /** A size the user asked for, unclamped, while dragging. */
    onChange: (size: number) => void;
    /** The size asked for when a drag or key press ends, and the size it started from. */
    onCommit: (size: number, startSize: number) => void;
    /** Double-click: back to the default. */
    onReset: () => void;
    label: string;
    className?: string;
};
/**
 * The draggable edge of a panel, also a focusable separator the arrow
 * keys move. see docs/plans/resizable-sidebar-plan.md
 */
export declare const ResizeHandle: ({ orientation, direction, value, min, max, onChange, onCommit, onReset, label, className, }: Props) => JSX.Element;
export {};
