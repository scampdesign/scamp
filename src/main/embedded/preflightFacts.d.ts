import type { PreflightFacts } from './preflight';
/** Keys an env file sets: `KEY=value`, comments and blanks skipped. */
export declare const envKeys: (text: string) => string[];
/** `import.meta.env.VITE_X` names a source file reads. */
export declare const viteEnvReads: (text: string) => string[];
export declare const gatherPreflightFacts: (folder: string, accounts: {
    signedIn: boolean;
    agentConnected: boolean;
}) => Promise<PreflightFacts>;
