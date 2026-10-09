import { promises as fs } from 'fs';
import path from 'path';
import { settleTranscript } from '@shared/agentTranscript';
export const AGENT_HISTORY_DIR = path.join('.scamp', 'agent-history');
const KINDS = new Set(['page', 'view', 'component']);
/** A key from the renderer, checked — null if it isn't one. */
export const asConversationKey = (value) => {
    if (value === null || typeof value !== 'object')
        return null;
    const { kind, name } = value;
    if (typeof kind !== 'string' || !KINDS.has(kind) || typeof name !== 'string' || name.length === 0)
        return null;
    return { kind: kind, name };
};
/** Encoded, so a name can never reach outside the folder. */
export const conversationFileName = (key) => `${key.kind}-${encodeURIComponent(key.name)}.json`;
export const conversationPath = (projectPath, key) => path.join(projectPath, AGENT_HISTORY_DIR, conversationFileName(key));
const isStored = (value) => {
    if (value === null || typeof value !== 'object')
        return false;
    const v = value;
    return v['version'] === 1 && Array.isArray(v['model']) && Array.isArray(v['transcript']);
};
const isMissing = (err) => err instanceof Error && 'code' in err && err.code === 'ENOENT';
/**
 * The saved conversation, or null when there isn't one. A file Scamp
 * can't read is moved aside rather than overwritten, so nothing is lost.
 */
export const loadConversation = async (projectPath, key) => {
    const file = conversationPath(projectPath, key);
    let raw;
    try {
        raw = await fs.readFile(file, 'utf-8');
    }
    catch (err) {
        if (isMissing(err))
            return null;
        throw err;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        parsed = null;
    }
    if (!isStored(parsed)) {
        await fs.rename(file, file.replace(/\.json$/, `.unreadable-${Date.now()}.json`)).catch(() => { });
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
export const saveConversation = async (projectPath, key, conversation) => {
    const file = conversationPath(projectPath, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify({ version: 1, ...conversation }), 'utf-8');
    await fs.rename(temp, file);
};
export const deleteConversation = async (projectPath, key) => {
    await fs.rm(conversationPath(projectPath, key), { force: true });
};
