import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';

import { describeProviderError } from '../src/main/agent/providerErrors';

/** Real SDK error instances, built the way the SDK builds them from a response. */
const statusError = (
  status: number,
  type = 'x',
  headers: Record<string, string> = {}
): InstanceType<typeof Anthropic.APIError> =>
  Anthropic.APIError.generate(status, { type: 'error', error: { type, message: 'x' } }, 'x', new Headers(headers));

describe('describeProviderError', () => {
  it('reads a 401 as a key the provider rejected', () => {
    expect(describeProviderError(statusError(401)).reason).toBe('invalid-key');
  });

  it('reads a 403 or 404 as a key without access to the model', () => {
    expect(describeProviderError(statusError(403)).reason).toBe('no-model-access');
    expect(describeProviderError(statusError(404)).reason).toBe('no-model-access');
    expect(describeProviderError(statusError(404)).message).toContain('claude-opus-5-5');
  });

  it('reads a 429 as rate limiting', () => {
    expect(describeProviderError(statusError(429)).reason).toBe('rate-limited');
    expect(describeProviderError(statusError(429)).message).toContain('in a minute');
  });

  it('says when to try again, from retry-after', () => {
    expect(describeProviderError(statusError(429, 'rate_limit_error', { 'retry-after': '30' })).message).toBe(
      'Anthropic is rate-limiting this key. Try again in 30 seconds.'
    );
    expect(describeProviderError(statusError(429, 'rate_limit_error', { 'retry-after': '300' })).message).toContain(
      'in 5 minutes'
    );
  });

  it('ignores a retry-after it can’t read', () => {
    expect(describeProviderError(statusError(429, 'rate_limit_error', { 'retry-after': 'soon' })).message).toContain(
      'in a minute'
    );
  });

  it('reads an overloaded API as overloaded, by status or by type', () => {
    expect(describeProviderError(statusError(529)).reason).toBe('overloaded');
    expect(describeProviderError(statusError(500, 'overloaded_error')).reason).toBe('overloaded');
  });

  it('reads a billing error as billing, whatever the status', () => {
    const described = describeProviderError(statusError(400, 'billing_error'));
    expect(described.reason).toBe('billing');
    expect(described.message).toContain('Claude Console');
  });

  it('reads a 413 as a conversation too long to send', () => {
    expect(describeProviderError(statusError(413, 'request_too_large')).reason).toBe('too-long');
  });

  it('reads any other 400 as a conversation to start over', () => {
    expect(describeProviderError(statusError(400, 'invalid_request_error')).message).toContain(
      'Start a new conversation'
    );
  });

  it('reads a timeout as the network, and says it was slow', () => {
    const described = describeProviderError(new Anthropic.APIConnectionTimeoutError());
    expect(described).toEqual({ reason: 'network', message: 'Anthropic took too long to answer. Try again.' });
  });

  it('reads a connection failure as the network', () => {
    expect(describeProviderError(new Anthropic.APIConnectionError({ message: 'down' })).reason).toBe(
      'network'
    );
  });

  it('reads a 500 as unknown and says the status', () => {
    const described = describeProviderError(statusError(500));
    expect(described.reason).toBe('unknown');
    expect(described.message).toContain('(500)');
  });

  it('reads something that is not a provider error as unknown, without a status', () => {
    const described = describeProviderError(new Error('boom'));
    expect(described).toEqual({
      reason: 'unknown',
      message: 'Anthropic returned an unexpected error. Try again.',
    });
  });
});
