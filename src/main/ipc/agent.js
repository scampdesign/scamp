import { promises as fs } from 'fs';
import { app, ipcMain, safeStorage } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { currentAuthToken } from '../auth/authService';
import { canvasToolInvoker, runAgentEdit } from '../canvasQueries';
import { agentToolsFrom } from '../agent/agentTools';
import { createAnthropicProvider } from '../agent/anthropicProvider';
import { createProviderKey } from '../agent/providerKey';
import { createScriptedProvider } from '../agent/scriptedProvider';
import { createAgentSession } from '../agent/session';
import { AGENT_SYSTEM_PROMPT } from '../agent/systemPrompt';
import { verifyAnthropicKey } from '../agent/verifyAnthropicKey';
import { readE2eSeams } from '../e2eSeams';
import { TOOL_DESCRIPTORS } from '../mcp/tools';
import { WRITE_TOOLS, WRITE_TOOL_NAMES } from '../agent/writeTools';
import { deleteComponent } from './componentOps';
import { restoreSnapshotAndReload } from './snapshot';
import { createSnapshot } from './snapshotOps';
import { getProjectFormat } from './projectFormatCache';
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
// Reads first, then edits — both in a fixed order, since the tool list
// heads the cached prefix.
const AGENT_TOOLS = [
    ...agentToolsFrom(TOOL_DESCRIPTORS),
    ...[...WRITE_TOOLS].sort((a, b) => a.name.localeCompare(b.name)),
];
let session = null;
/** Forget the restore point: a new conversation, or one just undone. */
const forgetRestorePoint = () => {
    if (session === null)
        return;
    session.snapshotTaken = false;
    session.snapshotId = null;
    session.createdComponents = [];
};
const sessionFor = (projectPath, target) => {
    if (session !== null && session.projectPath === projectPath) {
        session.target = target;
        return session.agent;
    }
    session?.agent.reset();
    const script = seams().agentScript;
    let scripted = null;
    const read = canvasToolInvoker(projectPath);
    const holder = {
        projectPath,
        target,
        snapshotTaken: false,
        snapshotId: null,
        createdComponents: [],
        agent: createAgentSession({
            getProvider: async () => {
                if (script !== null)
                    return (scripted ??= scriptedProvider(script));
                const key = await getProviderKey().current();
                return key === null ? null : createAnthropicProvider(key);
            },
            invoke: async (name, args, turnId) => {
                if (!WRITE_TOOL_NAMES.has(name))
                    return read(name, args);
                // A restore point before the conversation's first edit, taken
                // while disk still holds the pre-agent design. Best-effort: a
                // failed snapshot logs and doesn't block the edit.
                if (!holder.snapshotTaken) {
                    holder.snapshotTaken = true;
                    const snapshot = await createSnapshot(projectPath, await getProjectFormat(projectPath), 'agent_session');
                    holder.snapshotId = snapshot?.id ?? null;
                }
                try {
                    const answer = await runAgentEdit(name, args, turnId);
                    return {
                        content: [{ type: 'text', text: answer.text }],
                        ...(answer.ok ? {} : { isError: true }),
                        ...(answer.summary !== undefined ? { summary: answer.summary } : {}),
                    };
                }
                catch (err) {
                    return {
                        content: [{ type: 'text', text: `${name} failed: ${err instanceof Error ? err.message : String(err)}` }],
                        isError: true,
                    };
                }
            },
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
        // A new conversation gets its own restore point.
        forgetRestorePoint();
    });
    ipcMain.handle(IPC.AgentConfirm, async (_e, args) => {
        session?.agent.answer(args.confirmId, args.approved === true);
    });
    ipcMain.handle(IPC.AgentUndoSession, async (_e, args) => {
        const current = session;
        if (current === null || current.projectPath !== args.projectPath || current.snapshotId === null) {
            return { ok: false, error: 'There are no agent changes to undo in this conversation.' };
        }
        if (current.agent.isBusy()) {
            return { ok: false, error: 'Stop the agent before undoing its changes.' };
        }
        const restored = await restoreSnapshotAndReload(current.projectPath, current.snapshotId, {
            reloadOpenPage: true,
        });
        if (!restored.ok)
            return { ok: false, error: restored.error };
        const format = await getProjectFormat(current.projectPath);
        for (const componentName of current.createdComponents) {
            await deleteComponent({ projectPath: current.projectPath, componentName }, format).catch(() => {
                // Best-effort: a component the user already removed is fine.
            });
        }
        forgetRestorePoint();
        // The model still remembers making those edits. Tell it, once, so it
        // doesn't describe a canvas that no longer exists.
        current.agent.noteNextTurn('The user undid every change you made in this conversation. The canvas is back to how it was before your first edit.');
        return { ok: true };
    });
};
