/**
 * The limits on the resizable panels around the canvas, and the clamps
 * that keep the canvas usable whatever the window size.
 * see docs/plans/resizable-sidebar-plan.md
 */
export declare const SIDEBAR_DEFAULT = 240;
export declare const SIDEBAR_MIN = 200;
export declare const SIDEBAR_MAX = 480;
/** A drag that ends narrower than this closes the panel instead. */
export declare const SIDEBAR_COLLAPSE_BELOW = 120;
/** The agent's chat needs more room than a layer list. */
export declare const AGENT_MIN = 320;
export declare const BOTTOM_DEFAULT = 280;
export declare const BOTTOM_MIN = 120;
/** A sidebar width within its limits that leaves the canvas its minimum. */
export declare const clampSidebarWidth: (width: number, windowWidth: number) => number;
/** What the sidebar draws at: its width, or the agent's floor when the agent is open. */
export declare const drawnSidebarWidth: (width: number, windowWidth: number, agentOpen: boolean) => number;
/** A bottom panel height within its limits that leaves the canvas its minimum. */
export declare const clampBottomHeight: (height: number, windowHeight: number) => number;
/** A stored size read back: a positive finite number, or `fallback`. */
export declare const parseStoredSize: (raw: unknown, fallback: number) => number;
