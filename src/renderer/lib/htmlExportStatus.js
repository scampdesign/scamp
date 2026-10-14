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
/**
 * How long a finished state stays on the button before it returns to idle.
 *
 * Success is brief — the folder opening is the real confirmation. A failure
 * lingers, because it's the only place the reason is shown and the user
 * needs time to read it.
 */
export const DONE_VISIBLE_MS = 4000;
export const ERROR_VISIBLE_MS = 10000;
export const resetDelayFor = (status) => {
    if (status === 'done')
        return DONE_VISIBLE_MS;
    if (status === 'error')
        return ERROR_VISIBLE_MS;
    return null;
};
/** Button text for each state. `detail` is the success summary, if any. */
export const exportButtonLabel = (status, detail) => {
    switch (status) {
        case 'exporting':
            return 'Exporting…';
        case 'done':
            return detail && detail.length > 0 ? detail : 'Exported';
        case 'error':
            return 'Export failed';
        default:
            return 'Export HTML';
    }
};
/**
 * Tooltip for each state.
 *
 * On failure this carries the actual reason — the button only has room to
 * say that something went wrong. On success it names the folder, which
 * matters because Scamp chooses that name: the user picked a location, not
 * a destination, so "where did it go" is a real question.
 */
export const exportButtonTooltip = (status, message, location) => {
    if (status === 'exporting')
        return 'Writing HTML and CSS files…';
    if (status === 'error') {
        return message && message.length > 0
            ? message
            : 'The export failed. Check the app log for details.';
    }
    if (status === 'done') {
        if (location && location.length > 0)
            return `Exported to ${location}`;
        return message && message.length > 0
            ? message
            : 'Export finished. The folder should have opened.';
    }
    return 'Export this project into a new folder of plain HTML and CSS files';
};
/** A short success summary: "12 files, 3 images". */
export const exportSummary = (fileCount, assetCount) => {
    const files = `${fileCount} file${fileCount === 1 ? '' : 's'}`;
    if (assetCount <= 0)
        return `Exported ${files}`;
    return `Exported ${files}, ${assetCount} image${assetCount === 1 ? '' : 's'}`;
};
