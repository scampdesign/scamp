/**
 * The limits on the resizable panels around the canvas, and the clamps
 * that keep the canvas usable whatever the window size.
 * see docs/plans/resizable-sidebar-plan.md
 */

export const SIDEBAR_DEFAULT = 240;
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 480;
/** A drag that ends narrower than this closes the panel instead. */
export const SIDEBAR_COLLAPSE_BELOW = 120;
/** The agent's chat needs more room than a layer list. */
export const AGENT_MIN = 320;

export const BOTTOM_DEFAULT = 280;
export const BOTTOM_MIN = 120;
const BOTTOM_MAX_FRACTION = 0.7;

const RAIL_WIDTH = 48;
const PROPERTIES_WIDTH = 260;
const CANVAS_MIN_WIDTH = 320;
/** The toolbar above the canvas, plus the canvas's own minimum. */
const ABOVE_BOTTOM_MIN = 48 + 200;

const clamp = (value: number, min: number, max: number): number =>
  Math.round(Math.max(min, Math.min(max, value)));

/** A sidebar width within its limits that leaves the canvas its minimum. */
export const clampSidebarWidth = (width: number, windowWidth: number): number =>
  clamp(width, SIDEBAR_MIN, Math.min(SIDEBAR_MAX, windowWidth - RAIL_WIDTH - PROPERTIES_WIDTH - CANVAS_MIN_WIDTH));

/** What the sidebar draws at: its width, or the agent's floor when the agent is open. */
export const drawnSidebarWidth = (width: number, windowWidth: number, agentOpen: boolean): number => {
  const fitted = clampSidebarWidth(width, windowWidth);
  return agentOpen ? Math.max(fitted, AGENT_MIN) : fitted;
};

/** A bottom panel height within its limits that leaves the canvas its minimum. */
export const clampBottomHeight = (height: number, windowHeight: number): number =>
  clamp(height, BOTTOM_MIN, Math.min(windowHeight * BOTTOM_MAX_FRACTION, windowHeight - ABOVE_BOTTOM_MIN));

/** A stored size read back: a positive finite number, or `fallback`. */
export const parseStoredSize = (raw: unknown, fallback: number): number => {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
};
