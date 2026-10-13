import type { Page } from '@playwright/test';
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
export declare const openComponentsSection: (page: Page) => Promise<void>;
/**
 * Activate the Pages section in the icon sidebar rail — where the page
 * list and the Layers panel live. Needed to switch back after a
 * component interaction opened the Components section. Idempotent.
 */
export declare const openPagesSection: (page: Page) => Promise<void>;
/** Click "+ Add Component", type a name, press Enter. */
export declare const createComponentFromSidebar: (page: Page, name: string) => Promise<void>;
/** Right-click a component in the sidebar; open the context menu. */
/**
 * Add page (+) → type the slug → Enter. In a Next.js project this creates
 * a view (views/<Name>/) plus its route wrapper, and opens it.
 */
export declare const createPageFromSidebar: (page: Page, slug: string) => Promise<void>;
/** Right-click a page (legacy or view) in the Pages list. */
export declare const openPageContextMenu: (page: Page, slug: string) => Promise<void>;
export declare const openComponentContextMenu: (page: Page, componentName: string) => Promise<void>;
/** Right-click an element on the canvas (frame-local coords). */
export declare const openElementContextMenu: (page: Page, clientX: number, clientY: number) => Promise<void>;
/** Click a menu item by label inside the currently-open context menu. */
export declare const clickContextMenuItem: (page: Page, label: string, exact?: boolean) => Promise<void>;
/**
 * Drag a component from the sidebar onto the canvas. Uses the HTML5
 * DnD evaluate pattern because pointer events alone don't fire
 * `dragstart`/`drop` — same approach as `layers-panel/reorder-dnd`.
 */
export declare const dragComponentToCanvas: (page: Page, componentName: string, clientX: number, clientY: number) => Promise<void>;
/** Wait for a ConfirmDialog to appear by its title text. */
export declare const waitForConfirmDialog: (page: Page, titleText: string | RegExp) => Promise<void>;
/** Click the primary confirm button inside the currently-open ConfirmDialog. */
export declare const confirmDialog: (page: Page, label: string | RegExp) => Promise<void>;
/** The Pages header's Import (download) button, then one of its menu items. */
export declare const importFrom: (page: Page, from: "website" | "react") => Promise<void>;
