import { app } from 'electron';
import { resolve } from 'path';
import * as Sentry from '@sentry/electron/main';
/**
 * The open project's root, scrubbed from crash payloads. The username
 * regexes below only catch `/Users/<name>` / `/home/<name>` — a project
 * at `/opt/work/secret-client/...` would otherwise leak its full path.
 * Set when a project opens (`setSentryProjectRoot`), cleared on close.
 */
let projectRootToScrub = null;
/**
 * Register (or clear, with `null`) the project root to strip from Sentry
 * events. Stored resolved so it matches the absolute paths in stack
 * frames and breadcrumbs.
 */
export const setSentryProjectRoot = (root) => {
    projectRootToScrub = root === null ? null : resolve(root);
};
/**
 * Replace every occurrence of `root` in `s` with `<project>`. Literal
 * (not regex) match so path characters need no escaping. Pure — exported
 * for tests.
 */
export const scrubRoot = (s, root) => (root ? s.split(root).join('<project>') : s);
/**
 * Sentry crash-reporting init for Scamp's main process.
 *
 * The user's opt-in choice lives in `settings.json` (the same
 * file as the default-projects-folder preference). On startup
 * `src/main/index.ts` reads it synchronously and calls
 * `initSentryIfOptedIn` BEFORE anything else can throw — so a
 * crash during the rest of init is still captured.
 *
 * The renderer's Privacy toggle in Settings flips the value
 * mid-session; an IPC channel re-runs this init (when
 * toggled on) or `closeSentry` (when toggled off) so the
 * change takes effect immediately without restart.
 */
/**
 * Scrub absolute paths from a string. Same regexes used by the
 * `beforeSend` hook and the renderer init. Exported for tests.
 */
export const scrubPaths = (s) => {
    if (s === undefined)
        return undefined;
    // Scrub the project root FIRST — it usually contains the home prefix
    // (`/Users/alice/projects/secret`), so redacting the username first
    // would stop the literal root match below.
    return scrubRoot(s, projectRootToScrub)
        .replace(/\/Users\/[^/]+/g, '/Users/[redacted]')
        .replace(/\/home\/[^/]+/g, '/home/[redacted]')
        .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[redacted]');
};
/**
 * Set (or clear, with `null`) the anonymous install id on the Sentry scope.
 *
 * ONLY `id` is set — never `username`, `email`, or `ip_address`. Those are
 * the fields that would turn a counter into an identity.
 */
const applyInstallId = (installId) => {
    Sentry.setUser(installId === null ? null : { id: installId });
};
/**
 * Tracks whether Sentry.init has been called this session. The SDK
 * itself enforces "before-ready" timing — we can only call init
 * once and only before Electron's 'ready' event fires. After that
 * the SDK is stuck with whichever config was passed, and toggling
 * the user's opt-in mid-session has to mutate the client's
 * `enabled` flag rather than re-initialise.
 */
let isInitialised = false;
/**
 * Initialise the Sentry SDK. Called once at module-load time from
 * `src/main/index.ts`, BEFORE `app.whenReady()` — Sentry's
 * Electron SDK hooks into protocol / IPC during init and that
 * has to happen before Electron locks those layers down at the
 * 'ready' event.
 *
 * `optedIn === true` enables transmission; `false` (or `null` from
 * a fresh install with no decision yet) initialises the SDK but
 * leaves `enabled: false` so events are captured locally and
 * dropped rather than sent. The user's opt-in flips
 * `enabled` at runtime via `setSentryEnabled` below.
 *
 * No-ops cleanly when the DSN env var is missing — typical dev
 * setup without a key. The first-launch prompt and Settings
 * toggle both still work; toggle changes just have no
 * transmission target.
 */
export const initSentryIfOptedIn = (optedIn, installId = null) => {
    if (isInitialised) {
        // Subsequent calls can't re-init, but they CAN flip the
        // transmission gate — that's the live-toggle path.
        setSentryEnabled(optedIn, installId);
        return;
    }
    // Dot notation — matches the `define` substitution pattern in
    // `electron.vite.config.ts`, which replaces `process.env.SENTRY_DSN`
    // (this exact form) with the literal DSN string at build time.
    // Bracket access (`process.env['SENTRY_DSN']`) would NOT be
    // substituted and only work in dev, not in packaged builds.
    const dsn = process.env.SENTRY_DSN;
    if (!dsn || dsn.trim().length === 0) {
        // eslint-disable-next-line no-console
        console.warn('[sentry] SENTRY_DSN env var not set — crash reporting disabled');
        return;
    }
    try {
        Sentry.init({
            dsn,
            release: `scamp@${app.getVersion()}`,
            environment: app.isPackaged ? 'production' : 'development',
            // Start with transmission gated on the user's opt-in. We
            // ALWAYS call init (the SDK requires pre-ready timing); the
            // `enabled` flag is what actually controls whether events
            // leave the process. Flipping it at runtime takes effect
            // immediately — no re-init needed.
            enabled: optedIn,
            // Privacy — explicitly disable PII collection. The SDK
            // defaults this to false on @sentry/electron, but we set
            // it inline so the intent is visible to anyone reading the
            // source. Combined with `delete event.user` in beforeSend
            // (defence in depth in case a future integration adds
            // user tagging without our knowledge).
            sendDefaultPii: false,
            // Native Electron / Chromium crash capture (Crashpad /
            // Breakpad). Without this, a renderer GPU crash or a main
            // process segfault wouldn't be caught — only thrown
            // JavaScript errors would.
            // (Enabled by default in @sentry/electron; spelled out
            // here for visibility.)
            beforeSend(event) {
                // Strip every plausible PII surface before transmit.
                delete event.user;
                delete event.server_name;
                delete event.request;
                // Scrub absolute paths from breadcrumbs. Drop the
                // breadcrumb `data` payload entirely — we don't add any
                // ourselves, and the SDK's default integrations may
                // capture data we don't want to surface.
                if (event.breadcrumbs) {
                    event.breadcrumbs = event.breadcrumbs.map((b) => ({
                        ...b,
                        message: scrubPaths(b.message),
                        data: undefined,
                    }));
                }
                // Scrub paths from the exception value + stack frames'
                // `filename` fields. Drop `abs_path` since it's the
                // absolute on-disk path of the source file — useless on
                // a developer's symbolicator without a source-map upload,
                // and a privacy hazard if the user's home dir leaks.
                if (event.exception?.values) {
                    for (const ex of event.exception.values) {
                        ex.value = scrubPaths(ex.value);
                        if (ex.stacktrace?.frames) {
                            for (const f of ex.stacktrace.frames) {
                                f.filename = scrubPaths(f.filename);
                                delete f.abs_path;
                            }
                        }
                    }
                }
                return event;
            },
        });
        isInitialised = true;
        // Attach the anonymous install id so Release Health can resolve
        // sessions into unique users. Safe AFTER init even though the
        // session already started during it: `Scope.setUser` calls
        // `updateSession(session, { user })`, which back-fills the session's
        // distinct id. See docs/archive/2026-08-11-dau-tracking-plan.md.
        applyInstallId(optedIn ? installId : null);
        // eslint-disable-next-line no-console
        console.log(`[sentry] initialised — release scamp@${app.getVersion()}, env ${app.isPackaged ? 'production' : 'development'}, enabled=${optedIn}`);
    }
    catch (err) {
        // Sentry.init throwing is unlikely (the SDK is defensive),
        // but if it does we don't want to take the whole app down
        // with it. Log and continue.
        // eslint-disable-next-line no-console
        console.error('[sentry] init failed:', err);
    }
};
/**
 * Flip the transmission gate at runtime — used when the user
 * toggles the Privacy switch in Settings or answers the
 * first-launch opt-in prompt. The SDK is already running from
 * the module-load init; this just enables or disables
 * transmission going forward.
 *
 * No-op when the SDK never initialised (missing DSN, init
 * exception). Safe to call any number of times.
 */
export const setSentryEnabled = (enabled, installId = null) => {
    if (!isInitialised)
        return;
    // Clearing the user on opt-out is what makes the choice real: the id
    // stops riding on sessions immediately, and the caller drops the stored
    // value so opting back in mints a new one.
    applyInstallId(enabled ? installId : null);
    const client = Sentry.getClient();
    if (!client)
        return;
    // Mutate the client's options in place. Capture paths inside
    // the SDK check this flag before transmitting, so the change
    // takes effect on the next event without a re-init.
    client.getOptions().enabled = enabled;
    // eslint-disable-next-line no-console
    console.log(`[sentry] enabled=${enabled}`);
};
/**
 * Tear down Sentry. Used by the test suite — production paths
 * use `setSentryEnabled(false)` to gate transmission instead.
 * Calling `Sentry.close()` and trying to re-init from scratch
 * mid-session would hit the pre-ready check and fail.
 *
 * Returns a promise so callers can await the flush.
 */
export const closeSentry = async () => {
    if (!isInitialised)
        return;
    try {
        await Sentry.close(2000);
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error('[sentry] close failed:', err);
    }
    finally {
        isInitialised = false;
    }
};
/**
 * True when Sentry is currently running. Exposed for tests and
 * for diagnostic UI.
 */
export const isSentryInitialised = () => isInitialised;
