import { HISTORY_LOG_FORMAT, parseHistoryLog } from '@shared/embedded';
import { git } from './git';
/**
 * The session's history: the commits on its `scamp/` branch, as a timeline
 * like the canvas's History panel. Going back moves the branch to an older
 * commit (`git reset --keep`, which keeps the user's own uncommitted changes
 * and refuses rather than overwrite them); the newer commits stay reachable
 * from `tip`, so going forward again is the same move. A new commit makes
 * itself the tip, dropping the steps that were gone back past.
 * see docs/plans/embedded-canvas-gaps.md (P3)
 */
/** Branches a `scamp/` branch is usually made from, for where its history starts. */
const PARENTS = ['main', 'master', 'develop', 'origin/main', 'origin/master'];
export const headSha = async (folder) => {
    const run = await git(folder, ['rev-parse', 'HEAD']);
    return run.ok ? run.stdout.trim() : null;
};
export const isAncestor = async (folder, ancestor, of) => (await git(folder, ['merge-base', '--is-ancestor', ancestor, of])).ok;
/** Where the history starts: the fork point from the usual parent branch, or HEAD now. */
export const historyBase = async (folder) => {
    const head = await headSha(folder);
    if (head === null)
        return null;
    for (const parent of PARENTS) {
        const base = await git(folder, ['merge-base', 'HEAD', parent]);
        if (base.ok && base.stdout.trim().length > 0)
            return base.stdout.trim();
    }
    return head;
};
/** The newest commit the timeline reaches: `tip`, unless the branch has moved on without it. */
export const currentTip = async (folder, tip) => {
    const head = await headSha(folder);
    if (head === null)
        return null;
    return tip !== null && (await isAncestor(folder, head, tip)) ? tip : head;
};
export const readHistory = async (folder, base, tip) => {
    const head = await headSha(folder);
    const top = await currentTip(folder, tip);
    if (head === null || top === null)
        return { entries: [], base, atBase: true };
    const range = base === null ? ['-n', '50', top] : [`${base}..${top}`];
    const log = await git(folder, ['log', `--format=${HISTORY_LOG_FORMAT}`, '--name-only', ...range]);
    const done = new Set((await git(folder, ['rev-list', base === null ? head : `${base}..${head}`])).stdout.split('\n').filter((l) => l.length > 0));
    const entries = parseHistoryLog(log.stdout).map((e) => ({ ...e, undone: !done.has(e.sha), current: e.sha === head }));
    return { entries, base, atBase: head === base };
};
/**
 * Move the branch to `sha`: an entry of the timeline, or its base. Refuses
 * with a code when it can't: unaccepted agent changes (`pending`), commits
 * already pushed past it (`pushed`), or the user's changes in the way
 * (`changed`).
 */
export const goToCommit = async (folder, sha, history) => {
    if (!/^[0-9a-f]{7,40}$/.test(sha))
        return { ok: false, error: 'That isn’t a commit.' };
    if (history.pendingAgentFiles > 0) {
        return { ok: false, code: 'pending', error: 'Accept or discard the agent’s changes first.' };
    }
    const top = await currentTip(folder, history.tip);
    const onLine = top !== null && (await isAncestor(folder, sha, top)) && (history.base === null || (await isAncestor(folder, history.base, sha)));
    if (!onLine)
        return { ok: false, error: 'That change isn’t in this session’s history.' };
    const upstream = await git(folder, ['rev-parse', '--verify', '--quiet', '@{u}']);
    if (upstream.ok && !(await isAncestor(folder, upstream.stdout.trim(), sha))) {
        return { ok: false, code: 'pushed', error: 'This branch was pushed past that point, so going back would rewrite what you pushed. Revert the change instead.' };
    }
    const reset = await git(folder, ['reset', '--keep', sha]);
    if (reset.ok)
        return { ok: true };
    return { ok: false, code: 'changed', error: 'Your own uncommitted changes are in files that step changes. Commit or put them aside, then try again.' };
};
