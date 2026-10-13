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
export const pageRoot = (page) => page.locator('[data-element-id="root"][data-scamp-id="root"]');
/** A drawn element on the canvas, by its CSS class name (e.g. `rect_a1b2`). */
export const canvasElement = (page, className) => page.locator(`[data-scamp-id="${className}"]`);
/** The scaled frame the canvas renders inside. */
export const canvasFrame = (page) => page.locator('[data-testid="canvas-frame"]');
/** The toolbar button for a given tool (exposed via role=button + accessible name). */
export const toolButton = (page, label) => page.getByRole('button', { name: new RegExp(`^${label}\\s`) });
/** The save-status indicator in the header. */
export const saveStatus = (page) => page.locator('[data-testid="save-status"]');
/** A row in the layers panel, by its visible label. */
export const layersRow = (page, label) => page.locator('nav, aside').getByRole('button', { name: label }).first();
/** A resize handle on the current selection overlay (nw, n, ne, e, se, s, sw, w). */
export const resizeHandle = (page, handle) => page.locator(`[data-handle="${handle}"]`);
/** Selectors for canvas elements whose class name begins with `prefix`. */
export const canvasElementsByPrefix = (page, prefix) => page.locator(`[data-scamp-id^="${prefix}"]`);
/**
 * The components-section list in the sidebar — the `<ul>` immediately
 * following the "Components" heading. Scoping our queries here keeps
 * us from accidentally matching the canvas breadcrumb button which
 * also carries the component name when an editor is open.
 */
const componentsList = (page) => page.locator('h2:has-text("Components") + ul');
/** Sidebar component button by PascalCase name. Scoped to the components list. */
export const componentSidebarItem = (page, name) => componentsList(page).getByRole('button', { name, exact: true });
/** "+ Add Component" sidebar button. Scoped to the components section. */
export const addComponentButton = (page) => page.getByRole('button', { name: /Add Component/i });
/** The Pages list: legacy pages and views together, by route slug. */
export const pagesList = (page) => page.getByTestId('pages-list');
/** Sidebar page button by route slug (a legacy page or a view). */
export const pageSidebarItem = (page, slug) => pagesList(page).getByRole('button', { name: slug, exact: true });
/** The Pages header's Add page (+) button. */
export const addPageButton = (page) => page.getByRole('button', { name: 'Add page', exact: true });
/** Currently-open context menu surface (PageContextMenu / ElementContextMenu). */
export const contextMenu = (page) => page.getByRole('menu');
/**
 * A specific item inside the open context menu, by visible label.
 *
 * Pass `exact` when the label is a prefix of another item's — "Copy"
 * also matches "Copy context for agent", which reads as a menu bug
 * rather than a locator one when the click fails.
 */
export const contextMenuItem = (page, label, exact = false) => contextMenu(page).getByRole('menuitem', { name: label, exact });
/**
 * The canvas toolbar's terminal toggle. Selected by `data-action` rather
 * than accessible name: the button is icon-only, so its name comes from an
 * aria-label that could be reworded without changing behaviour.
 */
export const terminalToggle = (page) => page.locator('[data-action="toggle-terminal"]');
/** The canvas toolbar's code-panel toggle. */
export const codeToggle = (page) => page.locator('[data-action="toggle-code"]');
/**
 * A token swatch in the colour picker's Tokens tab, by FULL token name.
 *
 * The picker strips the `--color-` prefix for display (`--color-primary`
 * reads as `primary`), so matching on accessible name binds a test to a
 * label that is free to change. `data-token` carries the real name.
 */
export const tokenSwatch = (page, tokenName) => page.locator(`[data-token="${tokenName}"]`);
/**
 * The theme panel's mapping trigger for a semantic token. Scope it to a
 * theme block when a spec cares which block it edits.
 */
export const mappingTrigger = (scope, tokenName) => scope.locator(`[aria-label="Mapping for ${tokenName}"]`);
/**
 * A primitive in the open mapping picker, keyed `palette:500` — the same
 * value the control used when it was a `<select>`, kept so specs read the
 * same across the control's several rewrites. The row now uses the shared
 * ColorInput, whose token items carry the full token name.
 *
 * Queried from the page, not from the trigger's block: the popover is
 * positioned absolutely and does not render inside it.
 */
export const mappingOption = (page, key) => {
    const [palette, shade] = key.split(':');
    return page.locator(`[data-token="--color-${palette}-${shade}"]`);
};
