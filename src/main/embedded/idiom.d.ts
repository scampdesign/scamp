import type { EmbeddedIdiom } from '@shared/types';
export declare const detectIdioms: (dependencies: ReadonlyArray<string>, files: ReadonlyArray<string>) => EmbeddedIdiom[];
/** The idioms, as the agent's instructions name them. */
export declare const describeIdioms: (idioms: ReadonlyArray<EmbeddedIdiom>) => string;
