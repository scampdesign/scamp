import type { EmbeddedWorker } from '@shared/types';
export declare const readWorker: () => Promise<EmbeddedWorker>;
export declare const openEmbeddedWindow: () => Promise<void>;
export declare const registerEmbeddedIpc: () => void;
