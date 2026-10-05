import { promises as fs } from 'fs';
import { app, ipcMain, safeStorage } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { currentAuthToken } from '../auth/authService';
import { canvasToolInvoker } from '../canvasQueries';
import { agentToolsFrom } from '../agent/agentTools';
import { createAnthropicProvider } from '../agent/anthropicProvider';
import { createProviderKey } from '../agent/providerKey';
import { createScriptedProvider } from '../agent/scriptedProvider';
import { createAgentSession } from '../agent/session';
import { AGENT_SYSTEM_PROMPT } from '../agent/systemPrompt';
import { verifyAnthropicKey } from '../agent/verifyAnthropicKey';
import { readE2eSeams } from '../e2eSeams';
import { TOOL_DESCRIPTORS } from '../mcp/tools';
/**
 * Scamp Agent handlers. The key arrives once, on `agent:key-set`, and is
 * never sent back — every reply is a status. A message goes in on
 * `agent:send` and the turn streams back on `agent:event`.
 * see docs/plans/builtin-agent-plan.md
 */
const seams = () => readE2eSeams(process.env, app.isPackaged);
const isSignedIn = () => seams().signedIn || currentAuthToken() !== null;
let providerKey = null;
/** The one provider key, for the harness. */
export const getProviderKey = () => {
    const { agentKeyVerify } = seams();
    providerKey ??= createProviderKey({
        safeStorage,
        userDataDir: app.getPath('userData'),
        verify: agentKeyVerify === null
            ? verifyAnthropicKey
            : async () => agentKeyVerify === 'accept'
                ? { ok: true }
                : { ok: false, reason: 'invalid-key', message: 'Anthropic didn’t accept that key. Check it was copied in full.' },
        isSignedIn,
    });
    return providerKey;
};
/** The e2e suite's scripted provider, read once per session. */
const scriptedProvider = async (path) => {
    const script = JSON.parse(await fs.readFile(path, 'utf-8'));
    return createScriptedProvider(script);
};
const AGENT_TOOLS = agentToolsFrom(TOOL_DESCRIPTORS);
let session = null;
const sessionFor = (projectPath, target) => {
    if (session !== null && session.projectPath === projectPath) {
        session.target = target;
        return session.agent;
    }
    session?.agent.reset();
    const script = seams().agentScript;
    let scripted = null;
    const holder = {
        projectPath,
        target,
        agent: createAgentSession({
            getProvider: async () => {
                if (script !== null)
                    return (scripted ??= scriptedProvider(script));
                const key = await getProviderKey().current();
                return key === null ? null : createAnthropicProvider(key);
            },
            invoke: canvasToolInvoker(projectPath),
            system: AGENT_SYSTEM_PROMPT,
            tools: AGENT_TOOLS,
            emit: (event) => {
                if (!holder.target.isDestroyed())
                    holder.target.send(IPC.AgentEvent, event);
            },
            onKeyRejected: () => getProviderKey().markInvalid(),
        }),
    };
    session = holder;
    return holder.agent;
};
export const registerAgentIpc = () => {
    ipcMain.handle(IPC.AgentKeyStatus, async () => ({
        status: await getProviderKey().status(),
    }));
    ipcMain.handle(IPC.AgentKeySet, async (_e, args) => getProviderKey().set(typeof args?.key === 'string' ? args.key : ''));
    ipcMain.handle(IPC.AgentKeyClear, async () => getProviderKey().clear());
    ipcMain.handle(IPC.AgentSend, async (e, args) => {
        if (!isSignedIn()) {
            return { ok: false, reason: 'signed-out', message: 'Sign in to Scamp to use the agent.' };
        }
        return sessionFor(args.projectPath, e.sender).send(args.text, args.context, args.turnId);
    });
    ipcMain.handle(IPC.AgentCancel, async () => {
        session?.agent.cancel();
    });
    ipcMain.handle(IPC.AgentReset, async () => {
        session?.agent.reset();
    });
};
