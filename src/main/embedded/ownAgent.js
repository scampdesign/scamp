import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join, relative, sep } from 'path';
import { buildAgentPrompt } from '@shared/embedded';
import { errorResult, textResult } from '../mcp/protocol';
import { git, parseStatus } from './git';
import { describeIdioms } from './idiom';
/**
 * The user's own agent (Claude Code, Cursor, Gemini CLI, Kiro) working
 * Embedded Scamp's queue over MCP, signed in however it already is. Scamp
 * never touches its credentials. The agent asks for work, writes it with
 * its own tools, and says when it's done; Scamp finds what it changed from
 * git, so Accept and Discard still cover exactly the agent's files.
 * see docs/plans/embedded-agent-connection-plan.md
 */
/** The longest a wait for edits holds the call open, under clients' tool timeouts. */
export const MAX_WAIT_SECONDS = 50;
const NO_ARGS = { type: 'object', properties: {}, additionalProperties: false };
export const OWN_AGENT_TOOLS = [
    {
        name: 'scamp_embedded_wait_for_edits',
        description: 'Wait for the next batch of edits the user makes visually in Scamp on their running app, and take it. Returns the edits and how to write them, or "No edits yet" after the wait. Call it again whenever it returns, to keep working the queue for as long as the user asks. After writing a batch, call scamp_embedded_done before waiting again.',
        inputSchema: {
            type: 'object',
            properties: {
                waitSeconds: { type: 'number', minimum: 0, maximum: MAX_WAIT_SECONDS, description: `How long to wait for edits, up to ${MAX_WAIT_SECONDS}. Default ${MAX_WAIT_SECONDS}.` },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'scamp_embedded_done',
        description: 'Tell Scamp you finished writing the batch you took with scamp_embedded_wait_for_edits. Scamp reloads the app, shows the diff, and the user accepts or discards it. Call it even when you could not make some edits, and say which in the summary.',
        inputSchema: {
            type: 'object',
            properties: { summary: { type: 'string', description: 'One or two plain sentences: what you changed and in which files, and anything you could not do.' } },
            required: ['summary'],
            additionalProperties: false,
        },
    },
    {
        name: 'scamp_embedded_get_selection',
        description: 'The element the user has selected on their running app in Scamp: its tag, classes, text, source file and line, and components. Use it when the user refers to "this" or "the selected element".',
        inputSchema: NO_ARGS,
    },
];
/** The rules Scamp's own agent gets as its system prompt, for an agent that has its own. */
export const ownAgentBrief = (folder, idioms, items) => [
    'The user made these changes visually on their running app in Scamp. Write each into the project’s source, so it holds after a reload and reads as if a careful developer on the team wrote it.',
    '',
    `The project is at ${folder}. It writes styles with: ${describeIdioms(idioms)}.`,
    '',
    'Rules:',
    '- Read a file before you edit it. Make the smallest edit that produces each change. No refactors, renames or reformatting.',
    '- Use the project’s own tokens, variables or scale when one matches a value; otherwise write the value as given.',
    '- Don’t edit node_modules, lockfiles, env files or build config, don’t run git commands (Scamp manages the branch and commits), and don’t start or restart the dev server (Scamp runs it).',
    '- If a change can’t be made safely (the element comes from a library or from data), don’t guess: leave it and say why.',
    '- When you finish, call scamp_embedded_done with a one- or two-sentence summary.',
    '',
    buildAgentPrompt(items, idioms),
].join('\n');
/** Each changed file's content hash, from git status: what's different from HEAD right now. */
export const changedFiles = async (folder) => {
    const [status, top] = await Promise.all([
        git(folder, ['status', '--porcelain=v1', '--untracked-files=all']),
        git(folder, ['rev-parse', '--show-toplevel']),
    ]);
    const root = top.stdout.trim() || folder;
    // git answers with the real path (`/private/var/…` on macOS for `/var/…`).
    const base = await fs.realpath(folder).catch(() => folder);
    const out = new Map();
    for (const file of parseStatus(status.stdout).changed) {
        // Porcelain paths are from the repository root; the queue's are from the project folder.
        const absolute = join(root, file.path);
        const rel = relative(base, absolute).split(sep).join('/');
        if (rel.startsWith('..'))
            continue;
        const content = await fs.readFile(absolute).catch(() => null);
        out.set(rel, content === null ? 'deleted' : createHash('sha1').update(content).digest('hex'));
    }
    return out;
};
/** Files that changed between two snapshots: new, edited again, deleted, or put back. */
export const changedBetween = (before, after) => {
    const paths = new Set([...before.keys(), ...after.keys()]);
    return [...paths].filter((p) => before.get(p) !== after.get(p)).sort();
};
/** Answers the user's agent's tool calls against the session's queue. */
export const ownAgentInvoker = (deps) => {
    let before = null;
    return async (name, args) => {
        deps.onSeen();
        const agent = deps.agent();
        if (agent === null)
            return errorResult('No project is running in Scamp. Ask the user to start it in the Edit React Project window.');
        if (name === 'scamp_embedded_get_selection') {
            const selected = deps.selection();
            return textResult(selected === null ? 'Nothing is selected.' : JSON.stringify(selected, null, 2));
        }
        if (name === 'scamp_embedded_wait_for_edits') {
            if (agent.worker() !== 'own')
                return errorResult('Scamp’s own agent is writing changes for this project. To use yours, choose My agent in the Changes tab.');
            if (agent.heldBatch() !== null)
                return errorResult('You already have a batch. Write it, then call scamp_embedded_done.');
            const raw = typeof args['waitSeconds'] === 'number' ? args['waitSeconds'] : MAX_WAIT_SECONDS;
            const seconds = Math.max(0, Math.min(MAX_WAIT_SECONDS, raw));
            const items = await agent.takeBatch(seconds * 1000);
            if (items === null)
                return textResult('No edits yet. Call scamp_embedded_wait_for_edits again to keep waiting.');
            before = await changedFiles(deps.folder);
            return textResult(ownAgentBrief(deps.folder, deps.idioms(), items));
        }
        if (name === 'scamp_embedded_done') {
            if (agent.heldBatch() === null)
                return errorResult('You have no batch to finish. Call scamp_embedded_wait_for_edits to take one.');
            const files = before === null ? [] : changedBetween(before, await changedFiles(deps.folder));
            before = null;
            await agent.finishBatch(typeof args['summary'] === 'string' ? args['summary'] : '', files);
            return textResult(files.length === 0 ? 'Done. Scamp saw no file changes.' : `Done. Scamp sees changes in: ${files.join(', ')}.`);
        }
        return errorResult(`Unknown tool: ${name}`);
    };
};
