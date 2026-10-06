import type { AgentKeyRejection } from '@shared/types';
export declare const describeProviderError: (err: unknown) => {
    reason: AgentKeyRejection;
    message: string;
};
