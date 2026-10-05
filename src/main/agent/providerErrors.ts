import Anthropic from '@anthropic-ai/sdk';

import type { AgentKeyRejection } from '@shared/types';

import { AGENT_MODEL } from './config';

/**
 * A provider failure in words a designer can act on.
 *
 * The SDK's typed classes, most specific first — every one of them is
 * also an `APIError`, so order decides. Never the error message: its
 * wording is the provider's, and changes.
 */
export const describeProviderError = (
  err: unknown
): { reason: AgentKeyRejection; message: string } => {
  if (err instanceof Anthropic.AuthenticationError) {
    return { reason: 'invalid-key', message: 'Anthropic didn’t accept that key. Check it was copied in full.' };
  }
  if (err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.NotFoundError) {
    return {
      reason: 'no-model-access',
      message: `That key works, but its workspace can’t use ${AGENT_MODEL}, the model the Scamp Agent runs on.`,
    };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { reason: 'rate-limited', message: 'Anthropic is rate-limiting this key. Try again in a minute.' };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { reason: 'network', message: 'Couldn’t reach Anthropic. Check your connection and try again.' };
  }
  const status = err instanceof Anthropic.APIError && err.status !== undefined ? ` (${err.status})` : '';
  return { reason: 'unknown', message: `Anthropic returned an unexpected error${status}. Try again.` };
};
