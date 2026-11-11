export declare const allowTerminalRoot: (webContentsId: number, folder: string) => void;
export declare const forgetTerminalRoot: (webContentsId: number) => void;
/**
 * Kill every live pty and wait for the OS to release its file
 * descriptors. Awaiting this is what lets the Electron process exit
 * cleanly on quit — see the `before-quit` handler in `src/main/index.ts`.
 * Calling twice is safe: the map is cleared synchronously up front.
 */
export declare const disposeAllTerminals: () => Promise<void>;
/** Kill the shells one window opened, when it closes or reloads; other windows' shells keep running. */
export declare const disposeTerminalsOf: (ownerId: number) => Promise<void>;
export declare const registerTerminalIpc: () => void;
