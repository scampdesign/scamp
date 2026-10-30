// Re-exported so main-side callers have one import for settings concerns.
export { CONSENT_VERSION, hasCurrentConsent, isOptedIn } from '@shared/consent';
export const DEFAULT_SETTINGS = {
    defaultProjectsFolder: null,
    artboardBackground: '#0f0f0f',
    sentryOptIn: null,
    consentVersion: 0,
    installId: null,
    theme: 'dark',
    onboarding: { offered: false, hidden: true, completed: [] },
};
/** Keep only the two themes we ship; anything else falls back to dark. */
const parseTheme = (value) => value === 'light' ? 'light' : 'dark';
/**
 * Missing (any install from before the tutorial) reads as hidden: only
 * the first-run screen offers it, so existing users never see it unasked.
 */
const parseOnboarding = (value) => {
    if (!value || typeof value !== 'object')
        return { ...DEFAULT_SETTINGS.onboarding, completed: [] };
    const obj = value;
    const completed = Array.isArray(obj['completed'])
        ? obj['completed'].filter((id) => typeof id === 'string')
        : [];
    return {
        offered: obj['offered'] === true,
        hidden: obj['hidden'] !== false,
        completed: [...new Set(completed)],
    };
};
/**
 * Parse a Settings JSON blob with migration / defaulting. Pure so the
 * sync startup read and the async IPC read share one source of truth,
 * and so it can be unit-tested without touching Electron's userData
 * path. Any structural surprise falls back to a default.
 */
export const parseSettingsBlob = (raw) => {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object')
        return { ...DEFAULT_SETTINGS };
    const obj = parsed;
    const folder = obj['defaultProjectsFolder'];
    const artboard = obj['artboardBackground'];
    // Migrate: old `canvasBackground` key mapped to the same concept.
    const legacy = obj['canvasBackground'];
    const artboardValue = typeof artboard === 'string'
        ? artboard
        : typeof legacy === 'string'
            ? legacy
            : DEFAULT_SETTINGS.artboardBackground;
    const optIn = obj['sentryOptIn'];
    const version = obj['consentVersion'];
    const installId = obj['installId'];
    return {
        defaultProjectsFolder: typeof folder === 'string' ? folder : null,
        artboardBackground: artboardValue,
        sentryOptIn: typeof optIn === 'boolean' ? optIn : null,
        // Missing = an install that predates versioning, so version 0.
        consentVersion: typeof version === 'number' ? version : 0,
        installId: typeof installId === 'string' && installId.length > 0
            ? installId
            : null,
        theme: parseTheme(obj['theme']),
        onboarding: parseOnboarding(obj['onboarding']),
    };
};
