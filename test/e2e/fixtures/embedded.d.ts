import type { ElectronApplication, Page } from '@playwright/test';
/**
 * Embedded Scamp in e2e: the fixture app as a git repo, the window opened
 * from the app, and the running page reached through its webview.
 * see docs/plans/embedded-scamp-plan.md
 */
/** `test/fixtures/embedded-app`, copied, with one commit on `main`. The caller removes it. */
export declare const copyEmbeddedApp: () => Promise<string>;
export declare const gitIn: (dir: string, ...args: string[]) => string;
/** Open the Embedded Scamp window from the app window, pointed at `dir`. */
export declare const openEmbedded: (app: ElectronApplication, window: Page, dir: string) => Promise<Page>;
/** Start the project and wait for the inspector in its page. */
export declare const startEmbedded: (embedded: Page) => Promise<void>;
/** Run code in the project's page and return its result. */
export declare const inPage: <T = unknown>(embedded: Page, code: string) => Promise<T>;
/**
 * A real click on an element of the page, through the webview: at its
 * centre, or just inside its top-left corner to hit it rather than a child.
 */
export declare const clickInPage: (embedded: Page, selector: string, at?: "center" | "corner") => Promise<void>;
