import type { VerifyOutcome } from './providerKey';
/**
 * Check a key against the provider before storing it.
 *
 * Retrieving the agent's model costs no tokens, proves the key
 * authenticates, and proves it can use the model the agent runs on — a
 * key from a workspace without access would otherwise pass here and fail
 * on the first message.
 */
export declare const verifyAnthropicKey: (key: string) => Promise<VerifyOutcome>;
