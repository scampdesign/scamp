/**
 * Offer to reload inline SVG elements when their source `.svg` file changed
 * on disk (external edit). Reloading re-runs `prepareSvgForInsert` and
 * replaces every matching element's `svgSource` — a clear warning that
 * in-Scamp colour edits are lost. see docs/archive/2026-07-14-svg-color-editing-plan.md
 */
export declare const SvgReloadBanner: () => JSX.Element | null;
