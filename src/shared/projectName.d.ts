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
export type ValidationResult = {
    ok: true;
    value: string;
} | {
    ok: false;
    error: string;
};
export declare const validateProjectName: (raw: unknown) => ValidationResult;
/**
 * Best-effort suggestion: take a free-form string and produce a candidate
 * project name that satisfies the validator. Used to seed the input field
 * when the user starts typing.
 */
export declare const suggestProjectName: (raw: string) => string;
/**
 * A name that always validates, made from someone else's — a React app's
 * `package.json` name. `@scope/riq_frontend` → `riq-frontend`. Unlike
 * `suggestProjectName`, never empty and never ending on a hyphen.
 */
export declare const projectNameFrom: (raw: string) => string;
