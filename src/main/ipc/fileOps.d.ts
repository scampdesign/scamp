/**
 * Atomic write: write to a sibling .tmp file then rename. Prevents readers
 * (chokidar / external editors) from seeing a half-written file.
 *
 * Each write uses a unique tmp filename so concurrent writes to the same
 * target don't collide (one rename consuming the other's tmp → ENOENT).
 *
 * The rename is retried on Windows where transient OS-level locks make it
 * fail with EPERM/EBUSY intermittently — see `renameWithRetry`.
 *
 * Pure with respect to app state (no watcher / active-project coupling) so
 * it can be unit-tested against a temp dir; the handler owns the
 * containment checks and pending-write bookkeeping around it.
 */
export declare const atomicWrite: (path: string, content: string) => Promise<void>;
/**
 * Write a page's TSX then its CSS, as one change: if the CSS can't be
 * written (a full disk, a permissions error), the TSX goes back to what it
 * was, or away if it's new, before the error is rethrown. A new TSX beside
 * the old CSS would load with its new elements unstyled.
 */
export declare const writePagePair: (tsxPath: string, tsxContent: string, cssPath: string, cssContent: string) => Promise<void>;
/**
 * Run `job` once every earlier job with the same `key` has settled, so two
 * read-modify-writes of one file (or one index) can't interleave and drop
 * each other's change. Keys are usually absolute paths.
 */
export declare const serializeByKey: <T>(key: string, job: () => Promise<T>) => Promise<T>;
