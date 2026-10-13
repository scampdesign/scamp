import { addComponentButton, addPageButton, componentSidebarItem, contextMenuItem, pageSidebarItem, } from './selectors';
/**
 * Higher-level interactions for the components sidebar and the
 * convert-to-component / detach context menus. Specs use these so
 * they don't repeat the same right-click → menu-item → confirm
 * dialog sequence in every file.
 */
/**
 * Activate the Components section in the icon sidebar rail. The rail
 * shows one section at a time and defaults to Pages, so every
 * components-sidebar interaction needs this section open first.
 * Idempotent — safe to call when Components is already active.
 */
export const openComponentsSection = async (page) => {
    await page.locator('[data-section="components"]').click();
    await addComponentButton(page).waitFor({ state: 'visible' });
};
/**
 * Activate the Pages section in the icon sidebar rail — where the page
 * list and the Layers panel live. Needed to switch back after a
 * component interaction opened the Components section. Idempotent.
 */
export const openPagesSection = async (page) => {
    await page.locator('[data-section="pages"]').click();
    await page
        .getByRole('button', { name: 'Add page', exact: true })
        .waitFor({ state: 'visible' });
};
/** Click "+ Add Component", type a name, press Enter. */
export const createComponentFromSidebar = async (page, name) => {
    await openComponentsSection(page);
    await addComponentButton(page).click();
    // The inline name input mounts focused. The button's component-edit
    // state flips to 'new' on click; the next tick renders the input.
    const input = page.getByPlaceholder('ComponentName');
    await input.fill(name);
    await input.press('Enter');
};
/** Right-click a component in the sidebar; open the context menu. */
/**
 * Add page (+) → type the slug → Enter. In a Next.js project this creates
 * a view (views/<Name>/) plus its route wrapper, and opens it.
 */
export const createPageFromSidebar = async (page, slug) => {
    await openPagesSection(page);
    await addPageButton(page).click();
    const input = page.getByPlaceholder('page-name');
    await input.fill(slug);
    await input.press('Enter');
};
/** Right-click a page (legacy or view) in the Pages list. */
export const openPageContextMenu = async (page, slug) => {
    await openPagesSection(page);
    await pageSidebarItem(page, slug).click({ button: 'right' });
};
export const openComponentContextMenu = async (page, componentName) => {
    await openComponentsSection(page);
    await componentSidebarItem(page, componentName).click({ button: 'right' });
};
/** Right-click an element on the canvas (frame-local coords). */
export const openElementContextMenu = async (page, clientX, clientY) => {
    await page.mouse.click(clientX, clientY, { button: 'right' });
};
/** Click a menu item by label inside the currently-open context menu. */
export const clickContextMenuItem = async (page, label, exact = false) => {
    await contextMenuItem(page, label, exact).click();
};
/**
 * Drag a component from the sidebar onto the canvas. Uses the HTML5
 * DnD evaluate pattern because pointer events alone don't fire
 * `dragstart`/`drop` — same approach as `layers-panel/reorder-dnd`.
 */
export const dragComponentToCanvas = async (page, componentName, clientX, clientY) => {
    await openComponentsSection(page);
    await page.evaluate(({ name, x, y }) => {
        // querySelector doesn't support `:has-text`; iterate buttons and
        // match by trimmed text content to find the draggable sidebar
        // row for this component.
        const buttons = Array.from(document.querySelectorAll('button'));
        const sourceEl = buttons.find((b) => b.textContent?.trim() === name && b.draggable);
        if (!sourceEl)
            throw new Error(`source not found for component: ${name}`);
        const frame = document.querySelector('[data-testid="canvas-frame"]');
        if (!frame)
            throw new Error('canvas frame not mounted');
        // Dispatch at the drop POINT, the way the browser would. The drop
        // handlers live on the canvas interaction layer (a child of the
        // frame), and a synthetic event dispatched on the frame only
        // bubbles upward — it would never reach them.
        const target = document.elementFromPoint(x, y) ?? frame;
        const dt = new DataTransfer();
        dt.setData('application/x-scamp-component', name);
        dt.effectAllowed = 'copy';
        const start = new DragEvent('dragstart', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
        });
        sourceEl.dispatchEvent(start);
        const over = new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y,
        });
        target.dispatchEvent(over);
        const drop = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y,
        });
        target.dispatchEvent(drop);
        const end = new DragEvent('dragend', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
        });
        sourceEl.dispatchEvent(end);
    }, { name: componentName, x: clientX, y: clientY });
};
/** Wait for a ConfirmDialog to appear by its title text. */
export const waitForConfirmDialog = async (page, titleText) => {
    await page
        .getByRole('dialog')
        .filter({ has: page.getByText(titleText) })
        .waitFor({ state: 'visible' });
};
/** Click the primary confirm button inside the currently-open ConfirmDialog. */
export const confirmDialog = async (page, label) => {
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: label }).click();
};
/** The Pages header's Import (download) button, then one of its menu items. */
export const importFrom = async (page, from) => {
    await page.locator('button[aria-label="Import"][aria-haspopup="menu"]').click();
    await page
        .getByRole('menuitem', { name: from === 'website' ? 'Import from website…' : 'Import from React app…' })
        .click();
};
