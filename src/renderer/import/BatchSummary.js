import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import styles from './ImportApp.module.css';
const STATUS_LABEL = {
    waiting: 'Waiting',
    running: 'Reading…',
    imported: 'Imported',
    redirected: 'Went elsewhere',
    failed: 'Failed',
    skipped: 'Skipped',
};
/**
 * Where a multi-page import is, route by route, and the one-step undo
 * once it has finished.
 * see docs/plans/react-import-plan.md
 */
export const BatchSummary = ({ batch, onStop, onUndo, onDismiss }) => {
    const imported = batch.items.filter((i) => i.status === 'imported');
    const notImported = batch.items.filter((i) => i.status === 'redirected' || i.status === 'failed');
    const done = batch.items.filter((i) => i.status !== 'waiting' && i.status !== 'running').length;
    return (_jsxs("div", { className: `${styles.banner} ${styles.batch}`, "data-testid": "import-batch", role: "status", children: [_jsxs("div", { className: styles.bannerHead, children: [_jsx("span", { children: batch.running
                            ? `Importing ${done + 1} of ${batch.items.length}…`
                            : batch.undone !== undefined
                                ? batch.undone.removed.length > 0
                                    ? `Removed ${batch.undone.removed.length} ${batch.undone.removed.length === 1 ? 'page' : 'pages'}.`
                                    : (batch.undone.error ?? 'Nothing to remove.')
                                : `Imported ${imported.length} of ${batch.items.length} pages` +
                                    (notImported.length > 0 ? ` — ${notImported.length} didn’t come across` : '') }), _jsx("span", { className: styles.batchActions, children: batch.running ? (_jsx("button", { type: "button", className: styles.reportToggle, onClick: onStop, children: "Stop after this page" })) : (_jsxs(_Fragment, { children: [batch.undone === undefined && imported.length > 0 && (_jsx("button", { type: "button", className: styles.reportToggle, onClick: onUndo, children: "Remove these pages" })), _jsx("button", { type: "button", className: styles.reportToggle, onClick: onDismiss, children: "Close" })] })) })] }), _jsx("ul", { className: styles.batchList, children: batch.items.map((item) => (_jsxs("li", { className: styles.batchItem, "data-status": item.status, children: [_jsx("code", { children: item.path }), _jsxs("span", { className: styles.batchStatus, children: [STATUS_LABEL[item.status], item.viewName !== undefined && ` as ${item.viewName}`, item.status === 'redirected' && item.detail !== undefined && ` (to ${item.detail})`, item.status === 'failed' && item.detail !== undefined && `: ${item.detail}`] })] }, item.path))) })] }));
};
