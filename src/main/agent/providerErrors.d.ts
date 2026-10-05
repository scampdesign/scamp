import type { AgentKeyRejection } from '@shared/types';
/**
 * A provider failure in words a designer can act on.
 *
 * The SDK's typed classes, most specific first — every one of them is
 * also an `APIError`, so order decides. Never the error message: its
 * wording is the provider's, and changes.
 */
export declare const describeProviderError: (err: unknown) => {
    reason: AgentKeyRejection;
    message: string;
};
