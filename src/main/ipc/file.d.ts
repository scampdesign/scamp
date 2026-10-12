/** Resolves once every page write main has started is on disk (or failed). Quit waits on it. */
export declare const settleFileWrites: () => Promise<void>;
export declare const registerFileIpc: () => void;
