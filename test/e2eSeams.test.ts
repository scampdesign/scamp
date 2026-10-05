import { describe, it, expect } from 'vitest';

import { readE2eSeams } from '../src/main/e2eSeams';

describe('readE2eSeams', () => {
  const ON = { SCAMP_E2E: '1', SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_VERIFY: 'accept' };

  it('applies the switches in an unpackaged e2e run', () => {
    expect(readE2eSeams(ON, false)).toEqual({ signedIn: true, agentKeyVerify: 'accept' });
  });

  it('ignores every switch in a packaged build', () => {
    // A shipped app must not be signed in, or skip a key check, by an
    // environment variable.
    expect(readE2eSeams(ON, true)).toEqual({ signedIn: false, agentKeyVerify: null });
  });

  it('ignores the switches without the e2e flag', () => {
    const { SCAMP_E2E: _flag, ...rest } = ON;
    expect(readE2eSeams(rest, false)).toEqual({ signedIn: false, agentKeyVerify: null });
  });

  it('ignores a verify value it does not know', () => {
    expect(readE2eSeams({ SCAMP_E2E: '1', SCAMP_E2E_AGENT_VERIFY: 'yes' }, false).agentKeyVerify).toBeNull();
  });
});
