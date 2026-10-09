export const E2E_USER = {
    id: 'e2e-user',
    name: 'E2E User',
    email: 'e2e@scamp.test',
    emailVerified: true,
};
export const readE2eSeams = (env, isPackaged) => {
    const active = env['SCAMP_E2E'] === '1' && !isPackaged;
    const verify = env['SCAMP_E2E_AGENT_VERIFY'];
    const script = env['SCAMP_E2E_AGENT_SCRIPT'];
    return {
        signedIn: active && env['SCAMP_E2E_SIGNED_IN'] === '1',
        agentKeyVerify: active && (verify === 'accept' || verify === 'reject') ? verify : null,
        agentScript: active && script !== undefined && script.length > 0 ? script : null,
    };
};
