import Anthropic from '@anthropic-ai/sdk';

import type { AgentKeyRejection } from '@shared/types';

import { AGENT_MODEL } from './config';

/**
 * A provider failure in words a designer can act on.
 *
 * The SDK's typed classes and the API's `error.type`, most specific
 * first — every class is also an `APIError`, so order decides. Never the
 * error message: its wording is the provider's, and changes.
 */

/** `retry-after`, in seconds, when the provider sent one worth quoting. */
const retryAfterSeconds = (err: InstanceType<typeof Anthropic.APIError>): number | null => {
  const value = Number(err.headers?.get('retry-after'));
  return Number.isFinite(value) && value > 0 && value <= 3600 ? Math.ceil(value) : null;
};

const inAWhile = (seconds: number | null): string =>
  seconds === null ? 'in a minute' : seconds < 120 ? `in ${seconds} seconds` : `in ${Math.ceil(seconds / 60)} minutes`;

export const describeProviderError = (
  err: unknown
): { reason: AgentKeyRejection; message: string } => {
  if (err instanceof Anthropic.AuthenticationError) {
    return { reason: 'invalid-key', message: 'Anthropic didn’t accept that key. Check it was copied in full.' };
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return { reason: 'network', message: 'Anthropic took too long to answer. Try again.' };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { reason: 'network', message: 'Couldn’t reach Anthropic. Check your connection and try again.' };
  }
  if (!(err instanceof Anthropic.APIError)) {
    return { reason: 'unknown', message: 'Anthropic returned an unexpected error. Try again.' };
  }
  if (err.type === 'billing_error') {
    return {
      reason: 'billing',
      message: 'Anthropic couldn’t bill the account this key belongs to. Check its credit balance in the Claude Console.',
    };
  }
  if (err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.NotFoundError) {
    return {
      reason: 'no-model-access',
      message: `That key works, but its workspace can’t use ${AGENT_MODEL}, the model the Scamp Agent runs on.`,
    };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return {
      reason: 'rate-limited',
      message: `Anthropic is rate-limiting this key. Try again ${inAWhile(retryAfterSeconds(err))}.`,
    };
  }
  if (err.type === 'overloaded_error' || err.status === 529) {
    return { reason: 'overloaded', message: 'Anthropic is overloaded right now. Try again in a minute.' };
  }
  if (err.status === 413) {
    return {
      reason: 'too-long',
      message: 'This conversation is too long to send. Start a new conversation to keep going.',
    };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return {
      reason: 'unknown',
      message: 'Anthropic couldn’t accept this conversation. Start a new conversation and try again.',
    };
  }
  const status = err.status !== undefined ? ` (${err.status})` : '';
  return { reason: 'unknown', message: `Anthropic returned an unexpected error${status}. Try again.` };
};
