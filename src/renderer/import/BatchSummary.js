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
/** `Removed 3 pages and 2 components.` */
const removedText = (removed, pageNames) => {
    const pages = removed.filter((name) => pageNames.includes(name)).length;
    const components = removed.length - pages;
    const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
    return `Removed ${plural(pages, 'page')}${components > 0 ? ` and ${plural(components, 'component')}` : ''}.`;
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
                            : batch.finishing === true
                                ? 'Looking for components across the pages…'
                                : batch.undone !== undefined
                                    ? batch.undone.removed.length > 0
                                        ? removedText(batch.undone.removed, imported.map((i) => i.viewName ?? ''))
                                        : (batch.undone.error ?? 'Nothing to remove.')
                                    : `Imported ${imported.length} of ${batch.items.length} pages` +
                                        (notImported.length > 0 ? ` — ${notImported.length} didn’t come across` : '') }), _jsx("span", { className: styles.batchActions, children: batch.running ? (_jsx("button", { type: "button", className: styles.reportToggle, onClick: onStop, children: "Stop after this page" })) : (_jsxs(_Fragment, { children: [batch.undone === undefined && batch.finishing !== true && imported.length > 0 && (_jsx("button", { type: "button", className: styles.reportToggle, onClick: onUndo, children: "Remove these pages" })), _jsx("button", { type: "button", className: styles.reportToggle, onClick: onDismiss, children: "Close" })] })) })] }), batch.undone === undefined && batch.components !== undefined && batch.components.length > 0 && (_jsxs("p", { className: styles.batchComponents, "data-testid": "import-batch-components", children: [`Made ${batch.components.length} ${batch.components.length === 1 ? 'component' : 'components'}: `, batch.components.map((c) => `${c.name} (${c.instances} ${c.instances === 1 ? 'copy' : 'copies'})`).join(', ')] })), batch.finishError !== undefined && _jsx("p", { className: styles.batchComponents, children: batch.finishError }), batch.undone === undefined && (batch.notes?.length ?? 0) > 0 && (_jsxs("details", { className: styles.batchNotes, children: [_jsx("summary", { children: `${batch.notes?.length} things kept as copies or simplified` }), _jsx("ul", { children: batch.notes?.map((note) => _jsx("li", { children: note }, note)) })] })), _jsx("ul", { className: styles.batchList, children: batch.items.map((item) => (_jsxs("li", { className: styles.batchItem, "data-status": item.status, children: [_jsx("code", { children: item.path }), _jsxs("span", { className: styles.batchStatus, children: [STATUS_LABEL[item.status], item.viewName !== undefined && ` as ${item.viewName}`, item.status === 'redirected' && item.detail !== undefined && ` (to ${item.detail})`, item.status === 'failed' && item.detail !== undefined && `: ${item.detail}`] })] }, item.path))) })] }));
};
