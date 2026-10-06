import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { AGENT_HISTORY_DIR, asConversationKey, conversationFileName, deleteConversation, loadConversation, saveConversation, } from '../../src/main/agent/conversationStore';
/**
 * Each page's agent conversation, on a real disk.
 * see docs/plans/builtin-agent-plan.md
 */
const HOME = { kind: 'page', name: 'home' };
const USAGE = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
const TRANSCRIPT = [
    { role: 'user', id: 't1:user', text: 'Center the card', context: 'Page: home' },
    {
        role: 'assistant',
        id: 't1',
        parts: [{ kind: 'text', text: 'Done.' }],
        progress: '',
        status: 'done',
        usage: USAGE,
    },
];
describe('agent conversation store', () => {
    let projectPath;
    beforeEach(async () => {
        projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'scamp-agent-history-'));
    });
    afterEach(async () => {
        await fs.rm(projectPath, { recursive: true, force: true });
    });
    it('reads back what it saved, model history and transcript both', async () => {
        const model = [
            { role: 'user', content: 'Center the card' },
            { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
        ];
        await saveConversation(projectPath, HOME, { model, transcript: TRANSCRIPT, skill: null });
        expect(await loadConversation(projectPath, HOME)).toEqual({
            version: 1,
            model,
            transcript: TRANSCRIPT,
            skill: null,
        });
        const files = await fs.readdir(path.join(projectPath, AGENT_HISTORY_DIR));
        expect(files).toEqual(['page-home.json']);
    });
    it('keeps the skill a conversation runs under', async () => {
        const skill = { id: 'import-cleanup', tokenMode: 'keep-literal' };
        await saveConversation(projectPath, { kind: 'view', name: 'lobby' }, { model: [], transcript: [], skill });
        expect((await loadConversation(projectPath, { kind: 'view', name: 'lobby' }))?.skill).toEqual(skill);
    });
    it('keeps a page, a view and a component of the same name apart', async () => {
        await saveConversation(projectPath, HOME, { model: [], transcript: TRANSCRIPT, skill: null });
        expect(await loadConversation(projectPath, { kind: 'view', name: 'home' })).toBeNull();
        expect(await loadConversation(projectPath, { kind: 'component', name: 'home' })).toBeNull();
    });
    it('returns null when a page has no conversation yet', async () => {
        expect(await loadConversation(projectPath, HOME)).toBeNull();
    });
    it('moves an unreadable file aside rather than losing it', async () => {
        const dir = path.join(projectPath, AGENT_HISTORY_DIR);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'page-home.json'), '{"version": 1, "model": [', 'utf-8');
        expect(await loadConversation(projectPath, HOME)).toBeNull();
        const files = await fs.readdir(dir);
        expect(files).toHaveLength(1);
        expect(files[0]).toMatch(/^page-home\.unreadable-\d+\.json$/);
    });
    it('treats a file of the wrong shape as unreadable', async () => {
        const dir = path.join(projectPath, AGENT_HISTORY_DIR);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'page-home.json'), '{"version": 2}', 'utf-8');
        expect(await loadConversation(projectPath, HOME)).toBeNull();
    });
    it('settles a reply that was still working when it was saved', async () => {
        const working = [
            {
                role: 'assistant',
                id: 't1',
                parts: [{ kind: 'confirm', id: 't1:confirm_1', items: ['Delete the card'], state: 'pending' }],
                progress: 'Deleting…',
                status: 'working',
            },
        ];
        await saveConversation(projectPath, HOME, { model: [], transcript: working, skill: null });
        const [entry] = (await loadConversation(projectPath, HOME))?.transcript ?? [];
        expect(entry).toMatchObject({
            status: 'cancelled',
            progress: '',
            parts: [{ kind: 'confirm', state: 'declined' }],
        });
    });
    it('deletes a conversation, and deleting one that isn’t there is fine', async () => {
        await saveConversation(projectPath, HOME, { model: [], transcript: TRANSCRIPT, skill: null });
        await deleteConversation(projectPath, HOME);
        expect(await loadConversation(projectPath, HOME)).toBeNull();
        await expect(deleteConversation(projectPath, HOME)).resolves.toBeUndefined();
    });
    it('keeps a nested route name inside the history folder', async () => {
        const key = { kind: 'page', name: '../../escape/me' };
        await saveConversation(projectPath, key, { model: [], transcript: TRANSCRIPT, skill: null });
        expect(await fs.readdir(path.join(projectPath, AGENT_HISTORY_DIR))).toEqual([conversationFileName(key)]);
        expect(conversationFileName(key)).not.toContain('/');
    });
});
describe('asConversationKey', () => {
    it('accepts a page, a view or a component with a name', () => {
        expect(asConversationKey({ kind: 'view', name: 'lobby' })).toEqual({ kind: 'view', name: 'lobby' });
    });
    it('rejects anything else', () => {
        expect(asConversationKey(null)).toBeNull();
        expect(asConversationKey('page:home')).toBeNull();
        expect(asConversationKey({ kind: 'theme', name: 'home' })).toBeNull();
        expect(asConversationKey({ kind: 'page', name: '' })).toBeNull();
        expect(asConversationKey({ kind: 'page' })).toBeNull();
    });
});
