/**
 * Pure validation for project (and folder) names.
 *
 * Rules:
 *   - 1–64 characters
 *   - lowercase letters, digits, and hyphens only
 *   - cannot start or end with a hyphen
 *   - cannot be a single dot or double dot (would resolve to current/parent dir)
 *
 * Returning a structured result instead of throwing keeps both the renderer
 * (which wants to show the message inline) and the main process (which
 * wants to throw on bad input from the IPC) happy.
 */
const PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const validateProjectName = (raw) => {
    if (typeof raw !== 'string') {
        return { ok: false, error: 'Project name is required.' };
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return { ok: false, error: 'Project name is required.' };
    }
    if (trimmed.length > 64) {
        return { ok: false, error: 'Project name must be 64 characters or fewer.' };
    }
    if (trimmed === '.' || trimmed === '..') {
        return { ok: false, error: 'Project name is reserved.' };
    }
    if (!PATTERN.test(trimmed)) {
        return {
            ok: false,
            error: 'Use lowercase letters, numbers, and hyphens only. Cannot start or end with a hyphen.',
        };
    }
    return { ok: true, value: trimmed };
};
/**
 * Best-effort suggestion: take a free-form string and produce a candidate
 * project name that satisfies the validator. Used to seed the input field
 * when the user starts typing.
 */
export const suggestProjectName = (raw) => {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
};
/**
 * A name that always validates, made from someone else's — a React app's
 * `package.json` name. `@scope/riq_frontend` → `riq-frontend`. Unlike
 * `suggestProjectName`, never empty and never ending on a hyphen.
 */
export const projectNameFrom = (raw) => {
    const slug = suggestProjectName(raw.replace(/^@[^/]+\//, '')).replace(/-+$/, '');
    return validateProjectName(slug).ok ? slug : 'react-app';
};
