/**
 * The Design System documentation forms — the authored prose that Scamp
 * writes into DESIGN.md alongside the auto-generated token YAML. Bound
 * directly to the store's `designProse`; the debounced `useDesignMdSync`
 * coalesces edits into DESIGN.md writes, and reflects external edits back.
 * Only this component subscribes to `designProse`, so per-keystroke updates
 * don't re-render the rest of the panel. see docs/archive/2026-07-23-design-system-plan.md
 */
export declare const DesignDocSection: () => JSX.Element;
