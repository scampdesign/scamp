import type { Locator, Page } from '@playwright/test';
/**
 * Centralized query helpers. Everything the specs look up goes
 * through here so renaming an id / restructuring the DOM only
 * touches this file.
 *
 * Specs should prefer role/text/placeholder queries first and reach
 * for `data-testid` only where role queries are ambiguous.
 */
/**
 * The root `<div data-scamp-id="root">` of the ACTIVE target (page or
 * component being edited). Scoped by `data-element-id="root"` so we
 * don't match a component instance's inner root that's also rendered
 * inline on the canvas.
 */
export declare const pageRoot: (page: Page) => Locator;
/** A drawn element on the canvas, by its CSS class name (e.g. `rect_a1b2`). */
export declare const canvasElement: (page: Page, className: string) => Locator;
/** The scaled frame the canvas renders inside. */
export declare const canvasFrame: (page: Page) => Locator;
/** The toolbar button for a given tool (exposed via role=button + accessible name). */
export declare const toolButton: (page: Page, label: string) => Locator;
/** The save-status indicator in the header. */
export declare const saveStatus: (page: Page) => Locator;
/** A row in the layers panel, by its visible label. */
export declare const layersRow: (page: Page, label: string) => Locator;
/** A resize handle on the current selection overlay (nw, n, ne, e, se, s, sw, w). */
export declare const resizeHandle: (page: Page, handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w") => Locator;
/** Selectors for canvas elements whose class name begins with `prefix`. */
export declare const canvasElementsByPrefix: (page: Page, prefix: string) => Locator;
/** Sidebar component button by PascalCase name. Scoped to the components list. */
export declare const componentSidebarItem: (page: Page, name: string) => Locator;
/** "+ Add Component" sidebar button. Scoped to the components section. */
export declare const addComponentButton: (page: Page) => Locator;
/** The Pages list: legacy pages and views together, by route slug. */
export declare const pagesList: (page: Page) => Locator;
/** Sidebar page button by route slug (a legacy page or a view). */
export declare const pageSidebarItem: (page: Page, slug: string) => Locator;
/** The Pages header's Add page (+) button. */
export declare const addPageButton: (page: Page) => Locator;
/** Currently-open context menu surface (PageContextMenu / ElementContextMenu). */
export declare const contextMenu: (page: Page) => Locator;
/**
 * A specific item inside the open context menu, by visible label.
 *
 * Pass `exact` when the label is a prefix of another item's — "Copy"
 * also matches "Copy context for agent", which reads as a menu bug
 * rather than a locator one when the click fails.
 */
export declare const contextMenuItem: (page: Page, label: string, exact?: boolean) => Locator;
/**
 * The canvas toolbar's terminal toggle. Selected by `data-action` rather
 * than accessible name: the button is icon-only, so its name comes from an
 * aria-label that could be reworded without changing behaviour.
 */
export declare const terminalToggle: (page: Page) => Locator;
/** The canvas toolbar's code-panel toggle. */
export declare const codeToggle: (page: Page) => Locator;
/**
 * A token swatch in the colour picker's Tokens tab, by FULL token name.
 *
 * The picker strips the `--color-` prefix for display (`--color-primary`
 * reads as `primary`), so matching on accessible name binds a test to a
 * label that is free to change. `data-token` carries the real name.
 */
export declare const tokenSwatch: (page: Page, tokenName: string) => Locator;
/**
 * The theme panel's mapping trigger for a semantic token. Scope it to a
 * theme block when a spec cares which block it edits.
 */
export declare const mappingTrigger: (scope: Page | Locator, tokenName: string) => Locator;
/**
 * A primitive in the open mapping picker, keyed `palette:500` — the same
 * value the control used when it was a `<select>`, kept so specs read the
 * same across the control's several rewrites. The row now uses the shared
 * ColorInput, whose token items carry the full token name.
 *
 * Queried from the page, not from the trigger's block: the popover is
 * positioned absolutely and does not render inside it.
 */
export declare const mappingOption: (page: Page, key: string) => Locator;
