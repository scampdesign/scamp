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
};
export declare const E2E_USER: {
    readonly id: "e2e-user";
    readonly name: "E2E User";
    readonly email: "e2e@scamp.test";
    readonly emailVerified: true;
};
export declare const readE2eSeams: (env: Record<string, string | undefined>, isPackaged: boolean) => E2eSeams;
