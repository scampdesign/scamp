import { app, ipcMain, safeStorage } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { currentAuthToken } from '../auth/authService';
import { createProviderKey } from '../agent/providerKey';
import { verifyAnthropicKey } from '../agent/verifyAnthropicKey';
import { readE2eSeams } from '../e2eSeams';
/**
 * Scamp Agent handlers. The key arrives once, on `agent:key-set`, and is
 * never sent back — every reply is a status.
 * see docs/plans/builtin-agent-plan.md
 */
let providerKey = null;
/** The one provider key, for the harness. */
export const getProviderKey = () => {
    const seams = readE2eSeams(process.env, app.isPackaged);
    providerKey ??= createProviderKey({
        safeStorage,
        userDataDir: app.getPath('userData'),
        verify: seams.agentKeyVerify === null
            ? verifyAnthropicKey
            : async () => seams.agentKeyVerify === 'accept'
                ? { ok: true }
                : { ok: false, reason: 'invalid-key', message: 'Anthropic didn’t accept that key. Check it was copied in full.' },
        isSignedIn: () => seams.signedIn || currentAuthToken() !== null,
    });
    return providerKey;
};
export const registerAgentIpc = () => {
    ipcMain.handle(IPC.AgentKeyStatus, async () => ({
        status: await getProviderKey().status(),
    }));
    ipcMain.handle(IPC.AgentKeySet, async (_e, args) => getProviderKey().set(typeof args?.key === 'string' ? args.key : ''));
    ipcMain.handle(IPC.AgentKeyClear, async () => getProviderKey().clear());
};
