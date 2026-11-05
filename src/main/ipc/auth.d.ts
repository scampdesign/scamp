import type { AppFeatures } from '@shared/types';
/**
 * Activity reporting. Without it the app is invisible to the product's
 * active-user numbers: it talks to the API at sign-in and then, until
 * cloud sync ships, essentially never again.
 * see docs/notes/desktop-heartbeat.md
 */
/** The flags the app acts on: the website's answer, or the e2e seam's. */
export declare const appFeatures: () => AppFeatures;
export declare const registerAuthIpc: () => void;
/** Stop the repeat at shutdown. The timer is unref'ed, so this is tidiness
 *  rather than a requirement for the process to exit. */
export declare const disposeAuth: () => void;
