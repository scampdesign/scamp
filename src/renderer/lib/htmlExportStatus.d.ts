/**
 * Presentation state for the Export HTML button.
 *
 * Split out of the hook and kept pure because the whole point of this
 * state is that the user can see what happened: an export that succeeds
 * silently and one that fails silently look identical, which is the
 * failure this exists to prevent. Testing it needs no React.
 *
 * see docs/archive/2026-08-27-html-export-plan.md
 */
export type HtmlExportStatus = 'idle' | 'exporting' | 'done' | 'error';
/**
 * How long a finished state stays on the button before it returns to idle.
 *
 * Success is brief — the folder opening is the real confirmation. A failure
 * lingers, because it's the only place the reason is shown and the user
 * needs time to read it.
 */
export declare const DONE_VISIBLE_MS = 4000;
export declare const ERROR_VISIBLE_MS = 10000;
export declare const resetDelayFor: (status: HtmlExportStatus) => number | null;
/** Button text for each state. `detail` is the success summary, if any. */
export declare const exportButtonLabel: (status: HtmlExportStatus, detail?: string | null) => string;
/**
 * Tooltip for each state.
 *
 * On failure this carries the actual reason — the button only has room to
 * say that something went wrong. On success it names the folder, which
 * matters because Scamp chooses that name: the user picked a location, not
 * a destination, so "where did it go" is a real question.
 */
export declare const exportButtonTooltip: (status: HtmlExportStatus, message?: string | null, location?: string | null) => string;
/** A short success summary: "12 files, 3 images". */
export declare const exportSummary: (fileCount: number, assetCount: number) => string;
