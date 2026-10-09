import type { ProjectConfig, ComponentKind } from '@shared/types';
type Props = {
    config: ProjectConfig;
    onChange: (next: ProjectConfig) => void;
    /**
     * When set, the control edits the canvas size for the named
     * component (writing to `config.componentCanvas[name]`) rather
     * than the project-wide page canvas. Switches the popover into
     * component-mode: the breakpoint presets pick which screen size the
     * component is shown and edited at without resizing its canvas, plus
     * width + height inputs for the canvas itself.
     */
    componentName?: string;
    /** A view's artboard defaults to the page width instead of the component size. */
    componentKind?: ComponentKind;
};
/**
 * Toolbar control for the canvas viewport size + active breakpoint.
 *
 * The button's label reflects the active breakpoint (or a custom-
 * width readout when no preset matches). Clicking opens a popover
 * with:
 *   - A segmented list of the project's breakpoints. Clicking one
 *     sets canvas width AND active breakpoint — so subsequent
 *     property-panel edits land inside that breakpoint's @media
 *     block.
 *   - A custom-width input. Typing a value that doesn't match any
 *     breakpoint drops the active breakpoint to `desktop` so edits
 *     apply to the base CSS.
 *   - A "Clip content" toggle (per breakpoint for pages) and a
 *     "Fixed height" toggle + input. All viewport-frame preview
 *     helpers — never written to CSS.
 */
export declare const CanvasSizeControl: ({ config, onChange, componentName, componentKind, }: Props) => JSX.Element;
export {};
