import { promises as fs } from 'fs';
import path from 'path';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import { settleTranscript, type TranscriptEntry } from '@shared/agentTranscript';
import type { AgentConversationKey, AgentSkillRequest } from '@shared/types';

/**
 * Each page's, view's and component's conversation with the agent, on
 * disk in `.scamp/agent-history/` — kept in version control by every
 * scaffold, so coworkers sharing a repo share the conversations, and
 * ignored by the watcher.
 *
 * A file holds both sides: `model` is the history the model sees, kept
 * whole (thinking blocks are bound to it, so it is never trimmed or
 * edited); `transcript` is what the panel draws.
 * see docs/plans/builtin-agent-plan.md
 */

export type StoredConversation = {
  version: 1;
  model: BetaMessageParam[];
  transcript: TranscriptEntry[];
  skill: AgentSkillRequest | null;
};

export const AGENT_HISTORY_DIR = path.join('.scamp', 'agent-history');

const KINDS: ReadonlySet<string> = new Set(['page', 'view', 'component']);

/** A key from the renderer, checked — null if it isn't one. */
export const asConversationKey = (value: unknown): AgentConversationKey | null => {
  if (value === null || typeof value !== 'object') return null;
  const { kind, name } = value as Record<string, unknown>;
  if (typeof kind !== 'string' || !KINDS.has(kind) || typeof name !== 'string' || name.length === 0) return null;
  return { kind: kind as AgentConversationKey['kind'], name };
};

/** Encoded, so a name can never reach outside the folder. */
export const conversationFileName = (key: AgentConversationKey): string =>
  `${key.kind}-${encodeURIComponent(key.name)}.json`;

export const conversationPath = (projectPath: string, key: AgentConversationKey): string =>
  path.join(projectPath, AGENT_HISTORY_DIR, conversationFileName(key));

const isStored = (value: unknown): value is StoredConversation => {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v['version'] === 1 && Array.isArray(v['model']) && Array.isArray(v['transcript']);
};

const isMissing = (err: unknown): boolean =>
  err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';

/**
 * The saved conversation, or null when there isn't one. A file Scamp
 * can't read is moved aside rather than overwritten, so nothing is lost.
 */
export const loadConversation = async (
  projectPath: string,
  key: AgentConversationKey
): Promise<StoredConversation | null> => {
  const file = conversationPath(projectPath, key);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf-8');
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!isStored(parsed)) {
    await fs.rename(file, file.replace(/\.json$/, `.unreadable-${Date.now()}.json`)).catch(() => {});
    return null;
  }
  return {
    version: 1,
    model: parsed.model,
    transcript: settleTranscript(parsed.transcript),
    skill: parsed.skill ?? null,
  };
};

/** Written whole, through a temp file, so a crash never leaves half a file. */
export const saveConversation = async (
  projectPath: string,
  key: AgentConversationKey,
  conversation: Omit<StoredConversation, 'version'>
): Promise<void> => {
  const file = conversationPath(projectPath, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ version: 1, ...conversation }), 'utf-8');
  await fs.rename(temp, file);
};

export const deleteConversation = async (projectPath: string, key: AgentConversationKey): Promise<void> => {
  await fs.rm(conversationPath(projectPath, key), { force: true });
};
