import '@xterm/xterm/css/xterm.css';
/** The bridge to main's ptys: the main window's, or a window's own with the same calls. */
export type TerminalApi = Pick<Window['scamp'], 'createTerminal' | 'writeTerminal' | 'resizeTerminal' | 'killTerminal' | 'onTerminalData' | 'onTerminalExit'>;
type Props = {
    cwd: string;
    /** Notifies parent when the spawned terminal exits so the tab can be removed. */
    onExit?: (id: string) => void;
    /** Defaults to the main window's preload. */
    api?: TerminalApi;
    /** Called once the pty is up, with a way to type into it. */
    onReady?: (write: (data: string) => void) => void;
};
/**
 * One xterm.js terminal bound to a node-pty process in the main process.
 *
 * Lifecycle:
 *  - On mount: spin up xterm + ask main to spawn a pty in the project cwd.
 *  - User keystrokes → ipc write → pty stdin.
 *  - Pty stdout → ipc data event → xterm.write.
 *  - Container resize → fit addon → ipc resize → pty resize.
 *  - On unmount: kill the pty and dispose xterm.
 */
export declare const TerminalView: ({ cwd, onExit, api, onReady }: Props) => JSX.Element;
export {};
