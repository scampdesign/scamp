import { type InspectorCommand } from '@shared/embedded';
import type { EmbeddedContentField, EmbeddedContentOrigin, EmbeddedGitResult, EmbeddedPseudoState } from '@shared/types';
import { type EmbeddedSelection } from './embeddedStore';
/** How long editing pauses before an edit goes to the agent's queue. */
export declare const ENQUEUE_DELAY_MS = 900;
type WebviewLike = HTMLElement & {
    executeJavaScript: (code: string) => Promise<unknown>;
};
export declare const runInspector: (cmd?: InspectorCommand) => Promise<void>;
/** Install the inspector in a freshly loaded page, with the window's current modes. */
export declare const installInPage: () => Promise<void>;
/** Find the app's routes: from its files once (Next.js), and from its router and links on every page. */
export declare const discoverRoutes: () => Promise<void>;
/** Ask the page for its element tree, for the layers panel. */
export declare const refreshTree: () => Promise<void>;
export declare const selectTreeNode: (id: string) => void;
export declare const hoverTreeNode: (id: string | null) => void;
/** Move a layer next to a sibling; the page answers with `moved`, which queues it. */
export declare const moveTreeNode: (id: string, targetId: string, position: "before" | "after") => void;
/** Take an item out of the queue with ✕: its preview goes, and so does its undo step. */
export declare const removeQueued: (id: string) => Promise<void>;
/** Accept or Discard ends what runs undo can reach: from there it's the history. */
export declare const dropRunEntries: () => void;
export declare const undo: () => Promise<void>;
export declare const redo: () => Promise<void>;
export declare const refreshHistory: () => Promise<void>;
/** Move the project to a point in its history; the result says why when it can't. */
export declare const goToHistory: (sha: string) => Promise<EmbeddedGitResult>;
/** Read the widths the app's stylesheets break at. */
export declare const refreshBreakpoints: () => Promise<void>;
/** Size the app as a phone, a tablet, a width of your own, or the window (null). */
export declare const setViewport: (width: number | null) => void;
/** Force a pseudo-class on the selection; later edits style that state. */
export declare const setPseudo: (state: EmbeddedPseudoState) => void;
/** Let go of every held state: freeze and the forced pseudo-class. */
export declare const releaseHeld: () => void;
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
/** The selection's content fields: text when it's only text, an image's source and alt, a link's target. */
export declare const contentFields: (selection: EmbeddedSelection) => EmbeddedContentField[];
/** Why a field can't be edited here, or null when it can (or Scamp is still looking). */
export declare const notEditableReason: (origin: EmbeddedContentOrigin | undefined) => string | null;
/** Pick an image from disk: Scamp copies it into `public/` and points the selected image at it. */
export declare const chooseImage: () => Promise<void>;
/** Show new content on the page at once, and queue it for the agent. */
export declare const commitContent: (field: EmbeddedContentField, value: string) => Promise<void>;
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
