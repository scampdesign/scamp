import { promises as fs } from 'fs';
import { app, ipcMain, safeStorage, type WebContents } from 'electron';

import { IPC } from '@shared/ipcChannels';
import { applyAgentEvent, startTurn, type TranscriptEntry } from '@shared/agentTranscript';
import type {
  AgentConversationArgs,
  AgentConversationKey,
  AgentConversationState,
  AgentEvent,
  AgentSkillRequest,
  AgentKeySetResult,
  AgentKeyStatusResult,
  AgentSendArgs,
  AgentSendResult,
  AgentUndoSessionResult,
} from '@shared/types';

import { currentAuthToken } from '../auth/authService';
import { canvasToolInvoker, runAgentEdit } from '../canvasQueries';
import { agentToolsFrom } from '../agent/agentTools';
import { createAnthropicProvider } from '../agent/anthropicProvider';
import type { AgentProvider } from '../agent/provider';
import { createProviderKey, type ProviderKey } from '../agent/providerKey';
import { createScriptedProvider, type ScriptedTurn } from '../agent/scriptedProvider';
import {
  asConversationKey,
  deleteConversation,
  loadConversation,
  saveConversation,
} from '../agent/conversationStore';
import { createAgentSession, type AgentSession } from '../agent/session';
import { AGENT_SYSTEM_PROMPT } from '../agent/systemPrompt';
import { skillFor } from '../agent/skills';
import { verifyAnthropicKey } from '../agent/verifyAnthropicKey';
import { readE2eSeams } from '../e2eSeams';
import { notifyPagesChanged } from '../watcher';
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

const seams = (): ReturnType<typeof readE2eSeams> => readE2eSeams(process.env, app.isPackaged);

const isSignedIn = (): boolean => seams().signedIn || currentAuthToken() !== null;

let providerKey: ProviderKey | null = null;

/** The one provider key, for the harness. */
export const getProviderKey = (): ProviderKey => {
  const { agentKeyVerify } = seams();
  providerKey ??= createProviderKey({
    safeStorage,
    userDataDir: app.getPath('userData'),
    verify:
      agentKeyVerify === null
        ? verifyAnthropicKey
        : async () =>
            agentKeyVerify === 'accept'
              ? { ok: true }
              : { ok: false, reason: 'invalid-key', message: 'Anthropic didn’t accept that key. Check it was copied in full.' },
    isSignedIn,
  });
  return providerKey;
};

/** The e2e suite's scripted provider, read once per session. */
const scriptedProvider = async (path: string): Promise<AgentProvider> => {
  const script = JSON.parse(await fs.readFile(path, 'utf-8')) as ScriptedTurn[];
  return createScriptedProvider(script);
};

// Reads first, then edits — both in a fixed order, since the tool list
// heads the cached prefix.
const AGENT_TOOLS = [
  ...agentToolsFrom(TOOL_DESCRIPTORS),
  ...[...WRITE_TOOLS].sort((a, b) => a.name.localeCompare(b.name)),
];

type Conversation = {
  key: AgentConversationKey;
  agent: AgentSession;
  /** What the panel draws, folded from the same events it receives. */
  transcript: TranscriptEntry[];
  /** The skill this conversation runs under, to restore it after a restart. */
  skill: AgentSkillRequest | null;
  /** Whether this conversation's pre-edit snapshot has been taken. */
  snapshotTaken: boolean;
  /** That snapshot, for Undo AI session. Null if it couldn't be taken. */
  snapshotId: string | null;
  /** Components the agent created since — a restore copies files back but never removes new ones. */
  createdComponents: string[];
  /** Saves in order, one after another. */
  saving: Promise<void>;
};

/** The open project's conversations — one per page, view and component. */
let project: {
  projectPath: string;
  target: WebContents;
  conversations: Map<string, Promise<Conversation>>;
  /** The e2e suite's scripted provider: one script across the project's conversations. */
  scripted: Promise<AgentProvider> | null;
} | null = null;

const keyId = (key: AgentConversationKey): string => `${key.kind}:${key.name}`;

/** Forget the restore point: a new conversation, or one just undone. */
const forgetRestorePoint = (conversation: Conversation): void => {
  conversation.snapshotTaken = false;
  conversation.snapshotId = null;
  conversation.createdComponents = [];
};

const persist = (projectPath: string, conversation: Conversation): void => {
  const { key } = conversation;
  // A turn stopped by New conversation ends after the reset; nothing to keep.
  if (conversation.transcript.length === 0) return;
  conversation.saving = conversation.saving
    .then(() =>
      saveConversation(projectPath, key, {
        model: [...conversation.agent.history()],
        transcript: conversation.transcript,
        skill: conversation.skill,
      })
    )
    .catch((err: unknown) => {
      // Losing the saved copy is bad but not worth stopping the agent for.
      console.warn(`[agent] couldn't save the ${keyId(key)} conversation:`, err);
    });
};

/** All of the open project's conversations that have been opened. */
const openConversations = async (): Promise<Conversation[]> =>
  project === null ? [] : Promise.all(project.conversations.values());

const busyConversation = async (): Promise<Conversation | null> =>
  (await openConversations()).find((c) => c.agent.isBusy()) ?? null;

const createConversation = async (
  projectPath: string,
  key: AgentConversationKey,
  holder: NonNullable<typeof project>
): Promise<Conversation> => {
  const stored = await loadConversation(projectPath, key).catch(() => null);
  const script = seams().agentScript;
  const read = canvasToolInvoker(projectPath);
  const conversation: Conversation = {
    key,
    transcript: stored?.transcript ?? [],
    skill: stored?.skill ?? null,
    snapshotTaken: false,
    snapshotId: null,
    createdComponents: [],
    saving: Promise.resolve(),
    agent: createAgentSession({
      getProvider: async () => {
        if (script !== null) return (holder.scripted ??= scriptedProvider(script));
        const providerKey = await getProviderKey().current();
        return providerKey === null ? null : createAnthropicProvider(providerKey);
      },
      invoke: async (name, args, turnId) => {
        if (!WRITE_TOOL_NAMES.has(name)) return read(name, args);
        // A restore point before the conversation's first edit, taken
        // while disk still holds the pre-agent design. Best-effort: a
        // failed snapshot logs and doesn't block the edit.
        if (!conversation.snapshotTaken) {
          conversation.snapshotTaken = true;
          const snapshot = await createSnapshot(projectPath, await getProjectFormat(projectPath), 'agent_session');
          conversation.snapshotId = snapshot?.id ?? null;
        }
        try {
          const answer = await runAgentEdit(name, args, turnId);
          if (answer.ok && typeof answer.createdComponent === 'string') {
            // Undo AI session removes it; and the project re-read puts it
            // in the sidebar (the create itself is silent at the watcher).
            conversation.createdComponents.push(answer.createdComponent);
            notifyPagesChanged();
          }
          return {
            content: [{ type: 'text', text: answer.text }],
            ...(answer.ok ? {} : { isError: true }),
            ...(answer.summary !== undefined ? { summary: answer.summary } : {}),
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `${name} failed: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      },
      system: AGENT_SYSTEM_PROMPT,
      tools: AGENT_TOOLS,
      emit: (event: AgentEvent) => {
        conversation.transcript = applyAgentEvent(conversation.transcript, event);
        if (event.kind === 'turn-end') persist(projectPath, conversation);
        if (!holder.target.isDestroyed()) holder.target.send(IPC.AgentEvent, event);
      },
      onKeyRejected: () => getProviderKey().markInvalid(),
      ...(stored !== null
        ? { initial: { history: stored.model, skill: stored.skill !== null ? skillFor(stored.skill) : null } }
        : {}),
    }),
  };
  return conversation;
};

/** The conversation for a page, view or component — read from disk the first time. */
const conversationFor = (
  projectPath: string,
  key: AgentConversationKey,
  target: WebContents
): Promise<Conversation> => {
  if (project === null || project.projectPath !== projectPath) {
    // Another project: its conversations stop, and stay saved on disk.
    void openConversations().then((all) => all.forEach((c) => c.agent.reset()));
    project = { projectPath, target, conversations: new Map(), scripted: null };
  }
  project.target = target;
  const holder = project;
  const id = keyId(key);
  const existing = holder.conversations.get(id);
  if (existing !== undefined) return existing;
  const created = createConversation(projectPath, key, holder);
  holder.conversations.set(id, created);
  return created;
};

export const registerAgentIpc = (): void => {
  ipcMain.handle(IPC.AgentKeyStatus, async (): Promise<AgentKeyStatusResult> => ({
    status: await getProviderKey().status(),
  }));
  ipcMain.handle(
    IPC.AgentKeySet,
    async (_e, args: { key: string }): Promise<AgentKeySetResult> =>
      getProviderKey().set(typeof args?.key === 'string' ? args.key : '')
  );
  ipcMain.handle(IPC.AgentKeyClear, async (): Promise<void> => getProviderKey().clear());

  ipcMain.handle(IPC.AgentSend, async (e, args: AgentSendArgs): Promise<AgentSendResult> => {
    if (!isSignedIn()) {
      return { ok: false, reason: 'signed-out', message: 'Sign in to Scamp to use the agent.' };
    }
    const key = asConversationKey(args.conversation);
    if (key === null) return { ok: false, reason: 'busy', message: 'Open a page to talk to the agent about it.' };
    const conversation = await conversationFor(args.projectPath, key, e.sender);
    // One turn at a time across the project: edits go to whatever is open.
    const busy = await busyConversation();
    if (busy !== null) {
      return {
        ok: false,
        reason: 'busy',
        message:
          busy === conversation
            ? 'The agent is still working on your last message.'
            : `The agent is still working on ${busy.key.name}. Wait for it to finish, or go back and stop it.`,
      };
    }
    const skill = args.skill?.id === 'import-cleanup' ? skillFor(args.skill) : undefined;
    const startsSkill = skill !== undefined && conversation.agent.skill() === null;
    const before = conversation.transcript;
    conversation.transcript = startTurn(before, args.turnId, args.text.trim(), args.context);
    const result = await conversation.agent.send(args.text, args.context, args.turnId, {
      ...(skill !== undefined ? { skill } : {}),
    });
    if (!result.ok) conversation.transcript = before;
    else if (startsSkill && args.skill !== undefined) conversation.skill = args.skill;
    return result;
  });

  ipcMain.handle(IPC.AgentLoad, async (e, args: AgentConversationArgs): Promise<AgentConversationState> => {
    const key = asConversationKey(args?.conversation);
    if (key === null || !isSignedIn()) return { entries: [], busy: false, canUndo: false };
    const conversation = await conversationFor(args.projectPath, key, e.sender);
    return {
      entries: conversation.transcript,
      busy: (await busyConversation()) !== null,
      canUndo: conversation.snapshotId !== null,
    };
  });

  ipcMain.handle(IPC.AgentCancel, async (): Promise<void> => {
    for (const conversation of await openConversations()) conversation.agent.cancel();
  });

  ipcMain.handle(IPC.AgentReset, async (e, args: AgentConversationArgs): Promise<void> => {
    const key = asConversationKey(args?.conversation);
    if (key === null) return;
    const conversation = await conversationFor(args.projectPath, key, e.sender);
    conversation.agent.reset();
    conversation.transcript = [];
    conversation.skill = null;
    // A new conversation gets its own restore point.
    forgetRestorePoint(conversation);
    conversation.saving = conversation.saving.then(() => deleteConversation(args.projectPath, key)).catch(() => {});
    await conversation.saving;
  });

  ipcMain.handle(IPC.AgentConfirm, async (_e, args: { confirmId: string; approved: boolean }): Promise<void> => {
    for (const conversation of await openConversations()) conversation.agent.answer(args.confirmId, args.approved === true);
  });

  ipcMain.handle(
    IPC.AgentUndoSession,
    async (e, args: AgentConversationArgs & { note: string }): Promise<AgentUndoSessionResult> => {
      const key = asConversationKey(args?.conversation);
      const current = key === null ? null : await conversationFor(args.projectPath, key, e.sender);
      if (current === null || current.snapshotId === null) {
        return { ok: false, error: 'There are no agent changes to undo in this conversation.' };
      }
      if ((await busyConversation()) !== null) {
        return { ok: false, error: 'Stop the agent before undoing its changes.' };
      }
      const restored = await restoreSnapshotAndReload(args.projectPath, current.snapshotId, {
        reloadOpenPage: true,
      });
      if (!restored.ok) return { ok: false, error: restored.error };
      const format = await getProjectFormat(args.projectPath);
      for (const componentName of current.createdComponents) {
        await deleteComponent({ projectPath: args.projectPath, componentName }, format).catch(() => {
          // Best-effort: a component the user already removed is fine.
        });
      }
      forgetRestorePoint(current);
      if (typeof args.note === 'string') {
        current.transcript = [...current.transcript, { role: 'note', id: `note_${Date.now().toString(36)}`, text: args.note }];
        persist(args.projectPath, current);
      }
      // The model still remembers making those edits. Tell it, once, so it
      // doesn't describe a canvas that no longer exists.
      current.agent.noteNextTurn(
        'The user undid every change you made in this conversation. The canvas is back to how it was before your first edit.'
      );
      return { ok: true };
    }
  );
};
