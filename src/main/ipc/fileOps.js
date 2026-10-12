import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, basename, join } from 'path';
// Windows can fail `rename` over an existing file with a transient lock
// error when another process (chokidar's watch handle, Defender scanning
// the fresh .tmp, the Search indexer) momentarily holds the target or the
// tmp. These codes are retryable; everything else is a real failure.
// see docs/notes/windows-atomic-write.md
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'EEXIST']);
const renameWithRetry = async (tmp, dest) => {
    // Only Windows needs the retry; POSIX rename-over-existing is atomic and
    // reliable, so a single attempt keeps behaviour there identical.
    const maxAttempts = process.platform === 'win32' ? 10 : 1;
    for (let attempt = 1;; attempt++) {
        try {
            await fs.rename(tmp, dest);
            return;
        }
        catch (err) {
            const code = err.code ?? '';
            if (attempt >= maxAttempts || !TRANSIENT_RENAME_CODES.has(code)) {
                // Don't leak the orphan .tmp when the rename ultimately fails.
                await fs.rm(tmp, { force: true }).catch(() => { });
                throw err;
            }
            // Linear backoff: 20, 40, … ms. A few hundred ms total clears
            // virtually every AV / indexer / watcher lock.
            await new Promise((resolve) => setTimeout(resolve, attempt * 20));
        }
    }
};
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
export const atomicWrite = async (path, content) => {
    const suffix = randomBytes(4).toString('hex');
    const tmp = join(dirname(path), `.${basename(path)}.${suffix}.tmp`);
    await fs.writeFile(tmp, content, 'utf-8');
    await renameWithRetry(tmp, path);
};
const queues = new Map();
/**
 * Run `job` once every earlier job with the same `key` has settled, so two
 * read-modify-writes of one file (or one index) can't interleave and drop
 * each other's change. Keys are usually absolute paths.
 */
export const serializeByKey = (key, job) => {
    const prev = queues.get(key) ?? Promise.resolve();
    const next = prev.then(job);
    const tail = next.then(() => undefined, () => undefined);
    queues.set(key, tail);
    void tail.then(() => {
        if (queues.get(key) === tail)
            queues.delete(key);
    });
    return next;
};
