import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';

import { describeProviderError } from '../src/main/agent/providerErrors';

/** Real SDK error instances, built the way the SDK builds them from a response. */
const statusError = (status: number): InstanceType<typeof Anthropic.APIError> =>
  Anthropic.APIError.generate(status, { type: 'error', error: { type: 'x', message: 'x' } }, 'x', new Headers());

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
