import type { BatchItemStatus, BatchState } from './useImportBatch';
import styles from './ImportApp.module.css';

type Props = {
  batch: BatchState;
  onStop: () => void;
  onUndo: () => void;
  onDismiss: () => void;
};

const STATUS_LABEL: Readonly<Record<BatchItemStatus, string>> = {
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
export const BatchSummary = ({ batch, onStop, onUndo, onDismiss }: Props): JSX.Element => {
  const imported = batch.items.filter((i) => i.status === 'imported');
  const notImported = batch.items.filter((i) => i.status === 'redirected' || i.status === 'failed');
  const done = batch.items.filter((i) => i.status !== 'waiting' && i.status !== 'running').length;

  return (
    <div className={`${styles.banner} ${styles.batch}`} data-testid="import-batch" role="status">
      <div className={styles.bannerHead}>
        <span>
          {batch.running
            ? `Importing ${done + 1} of ${batch.items.length}…`
            : batch.undone !== undefined
              ? batch.undone.removed.length > 0
                ? `Removed ${batch.undone.removed.length} ${batch.undone.removed.length === 1 ? 'page' : 'pages'}.`
                : (batch.undone.error ?? 'Nothing to remove.')
              : `Imported ${imported.length} of ${batch.items.length} pages` +
                (notImported.length > 0 ? ` — ${notImported.length} didn’t come across` : '')}
        </span>
        <span className={styles.batchActions}>
          {batch.running ? (
            <button type="button" className={styles.reportToggle} onClick={onStop}>
              Stop after this page
            </button>
          ) : (
            <>
              {batch.undone === undefined && imported.length > 0 && (
                <button type="button" className={styles.reportToggle} onClick={onUndo}>
                  Remove these pages
                </button>
              )}
              <button type="button" className={styles.reportToggle} onClick={onDismiss}>
                Close
              </button>
            </>
          )}
        </span>
      </div>
      <ul className={styles.batchList}>
        {batch.items.map((item) => (
          <li key={item.path} className={styles.batchItem} data-status={item.status}>
            <code>{item.path}</code>
            <span className={styles.batchStatus}>
              {STATUS_LABEL[item.status]}
              {item.viewName !== undefined && ` as ${item.viewName}`}
              {item.status === 'redirected' && item.detail !== undefined && ` (to ${item.detail})`}
              {item.status === 'failed' && item.detail !== undefined && `: ${item.detail}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
