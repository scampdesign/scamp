/**
 * Listen for external changes to imported SVG asset files and, when one
 * is referenced by an inline SVG element on the current canvas, stage a
 * reload offer (consumed by `SvgReloadBanner`). Mounted once by
 * ProjectShell. see docs/archive/2026-07-14-svg-color-editing-plan.md
 */
export declare const useSvgAssetReload: () => void;
