import type { WebContents } from 'electron';
/** Force on each marked element the states it's marked with, and release the rest. One sync at a time per page. */
export declare const syncPseudo: (guest: WebContents) => Promise<boolean>;
