import { type InspectorCommand } from '@shared/embedded';
/** How long editing pauses before an edit goes to the agent's queue. */
export declare const ENQUEUE_DELAY_MS = 900;
type WebviewLike = HTMLElement & {
    executeJavaScript: (code: string) => Promise<unknown>;
};
export declare const runInspector: (cmd?: InspectorCommand) => Promise<void>;
/** Install the inspector in a freshly loaded page, with the window's current modes. */
export declare const installInPage: () => Promise<void>;
export declare const attachWebview: (el: WebviewLike | null) => void;
/** Back, forward or reload in the page. */
export declare const navigatePage: (kind: "back" | "forward" | "reload") => void;
/** Go to a path of the running app, never somewhere else. */
export declare const openPath: (path: string) => void;
/** Edit mode and freeze, in the window and in the page. */
export declare const setModes: (patch: {
    edit?: boolean;
    frozen?: boolean;
}) => void;
/** A console line from the page. Returns true when it was the inspector's. */
export declare const handleConsoleLine: (line: string) => boolean;
/** Send the edit in progress to the agent now. */
export declare const flushPending: () => void;
/** Switch between this instance and all of them, moving the page's preview with it. */
export declare const setScope: (scope: "instance" | "all") => void;
/** An instruction for the agent, about the selection or the whole page. */
export declare const sendInstruction: (text: string) => Promise<void>;
export declare const refreshGit: () => Promise<void>;
/** Wire the window's subscriptions once. */
export declare const startSession: () => void;
export {};
