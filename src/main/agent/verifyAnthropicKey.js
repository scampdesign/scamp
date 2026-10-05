import Anthropic from '@anthropic-ai/sdk';
import { AGENT_MODEL } from './config';
import { describeProviderError } from './providerErrors';
/**
 * Check a key against the provider before storing it.
 *
 * Retrieving the agent's model costs no tokens, proves the key
 * authenticates, and proves it can use the model the agent runs on — a
 * key from a workspace without access would otherwise pass here and fail
 * on the first message.
 */
export const verifyAnthropicKey = async (key) => {
    const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 15_000 });
    try {
        await client.models.retrieve(AGENT_MODEL);
        return { ok: true };
    }
    catch (err) {
        return { ok: false, ...describeProviderError(err) };
    }
};
