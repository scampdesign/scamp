import { type DetectResult } from './detect';
/**
 * The dev server of a React app being imported. Not the preview's
 * `devServerManager`: that one runs Scamp's own projects and knows their
 * formats; this runs someone else's app, which Scamp only reads from.
 *
 * Electron-free. The IPC layer asks the user before anything here runs —
 * starting a dev server runs the project's own scripts.
 * see docs/plans/react-import-plan.md
 */
export type ReactAppEvent = {
    kind: 'log';
    text: string;
} | {
    kind: 'phase';
    phase: 'installing' | 'starting';
};
/** The folder read the way the import will: package.json and what's beside it. */
export declare const inspectReactFolder: (dir: string) => Promise<DetectResult>;
/**
 * Install if needed, then start the app's dev server on a free port.
 * One per key (the Scamp project importing it); a second call while one
 * runs returns the same URL.
 */
export declare const startReactApp: (key: string, dir: string, onEvent: (event: ReactAppEvent) => void) => Promise<{
    ok: true;
    url: string;
} | {
    ok: false;
    error: string;
}>;
export declare const stopReactApp: (key: string) => void;
/** Stop the server at this address, if Scamp started it. */
export declare const stopReactAppAt: (url: string) => void;
export declare const stopAllReactApps: () => void;
