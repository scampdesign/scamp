/**
 * Switches the end-to-end suite uses to reach signed-in and agent paths
 * without a real account or a real provider.
 *
 * Inert unless BOTH the e2e flag is set and the app is unpackaged, so a
 * shipped build ignores the environment entirely — setting variables
 * cannot sign anyone in or bypass a key check there.
 * see docs/plans/builtin-agent-plan.md
 */
export type E2eSeams = {
  /** Report a signed-in user without a session token. */
  signedIn: boolean;
  /** Answer the provider-key check without calling the provider. */
  agentKeyVerify: 'accept' | 'reject' | null;
  /**
   * A JSON file of scripted agent turns. When set, the agent runs on the
   * scripted provider and needs no key.
   */
  agentScript: string | null;
};

export const E2E_USER = {
  id: 'e2e-user',
  name: 'E2E User',
  email: 'e2e@scamp.test',
  emailVerified: true,
} as const;

export const readE2eSeams = (
  env: Record<string, string | undefined>,
  isPackaged: boolean
): E2eSeams => {
  const active = env['SCAMP_E2E'] === '1' && !isPackaged;
  const verify = env['SCAMP_E2E_AGENT_VERIFY'];
  const script = env['SCAMP_E2E_AGENT_SCRIPT'];
  return {
    signedIn: active && env['SCAMP_E2E_SIGNED_IN'] === '1',
    agentKeyVerify: active && (verify === 'accept' || verify === 'reject') ? verify : null,
    agentScript: active && script !== undefined && script.length > 0 ? script : null,
  };
};
