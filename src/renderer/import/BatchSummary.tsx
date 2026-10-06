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

/** `Removed 3 pages and 2 components.` */
const removedText = (removed: ReadonlyArray<string>, pageNames: ReadonlyArray<string>): string => {
  const pages = removed.filter((name) => pageNames.includes(name)).length;
  const components = removed.length - pages;
  const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;
  return `Removed ${plural(pages, 'page')}${components > 0 ? ` and ${plural(components, 'component')}` : ''}.`;
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
            : batch.finishing === true
              ? 'Looking for components across the pages…'
            : batch.undone !== undefined
              ? batch.undone.removed.length > 0
                ? removedText(batch.undone.removed, imported.map((i) => i.viewName ?? ''))
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
              {batch.undone === undefined && batch.finishing !== true && imported.length > 0 && (
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
      {batch.undone === undefined && batch.components !== undefined && batch.components.length > 0 && (
        <p className={styles.batchComponents} data-testid="import-batch-components">
          {`Made ${batch.components.length} ${batch.components.length === 1 ? 'component' : 'components'}: `}
          {batch.components.map((c) => `${c.name} (${c.instances} ${c.instances === 1 ? 'copy' : 'copies'})`).join(', ')}
        </p>
      )}
      {batch.undone === undefined && (batch.repeats?.length ?? 0) > 0 && (
        <p className={styles.batchComponents} data-testid="import-batch-repeats">
          {`Made ${batch.repeats?.length} ${batch.repeats?.length === 1 ? 'list' : 'lists'} into repeating elements: `}
          {batch.repeats?.map((r) => `${r.list} (${r.rows} rows)`).join(', ')}
        </p>
      )}
      {batch.finishError !== undefined && <p className={styles.batchComponents}>{batch.finishError}</p>}
      {batch.undone === undefined && (batch.notes?.length ?? 0) > 0 && (
        <details className={styles.batchNotes}>
          <summary>{`${batch.notes?.length} things kept as copies or simplified`}</summary>
          <ul>
            {batch.notes?.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </details>
      )}
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
