import { ipcMain } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { listImportSources, readImportSource } from './importSourceStore';
import { readRecord, sourceFor } from './reactImport/record';
import { listRoutes } from './ipc/routeOps';
import { getProjectFormat } from './ipc/projectFormatCache';
import { createQueryRegistry } from './mcp/pendingQueries';
import { createToolInvoker, IMPORT_SOURCE_REPLY_LIMIT } from './mcp/tools';
/**
 * The bridge from main to the canvas: ask the renderer a question about
 * what is on screen, and get an answer back.
 *
 * Two callers share it — the MCP server, for an agent in the user's
 * terminal, and the built-in Scamp Agent. It lives outside the MCP
 * lifecycle on purpose: the MCP server can fail to start (a port in use)
 * and the built-in agent must not go down with it.
 * see docs/plans/builtin-agent-plan.md
 */
let mainWindow = null;
const send = (payload) => {
    const win = mainWindow;
    // Guard both: the window can be destroyed between a tool call arriving and
    // this send, and a destroyed window's webContents throws on send.
    if (win === null || win.isDestroyed()) {
        throw new Error('The Scamp window is not available.');
    }
    win.webContents.send(IPC.McpQuery, payload);
};
const registry = createQueryRegistry({ send });
/**
 * The agent's edits go on their own channel with a longer wait: a read
 * answers from memory, but an edit regenerates and reparses the page.
 */
const EDIT_TIMEOUT_MS = 15_000;
const editRegistry = createQueryRegistry({
    timeoutMs: EDIT_TIMEOUT_MS,
    send: ({ requestId, tool, args }) => {
        const win = mainWindow;
        if (win === null || win.isDestroyed())
            throw new Error('The Scamp window is not available.');
        const turnId = typeof args['turnId'] === 'string' ? args['turnId'] : '';
        const input = args['input'];
        const payload = {
            requestId,
            tool,
            args: {
                turnId,
                input: input !== null && typeof input === 'object' ? input : {},
            },
        };
        win.webContents.send(IPC.AgentToolCall, payload);
    },
});
const isAgentEditAnswer = (value) => value !== null &&
    typeof value === 'object' &&
    typeof value.ok === 'boolean' &&
    typeof value.text === 'string';
/** Ask the renderer to make one edit for the agent's turn `turnId`. */
export const runAgentEdit = async (tool, input, turnId) => {
    const answer = await editRegistry.query(tool, { turnId, input });
    if (!isAgentEditAnswer(answer))
        throw new Error('The canvas sent back an answer Scamp didn’t understand.');
    return answer;
};
/** Register the reply listener once, at app start. */
export const initCanvasQueries = (win) => {
    mainWindow = win;
    ipcMain.removeAllListeners(IPC.McpQueryResult);
    ipcMain.on(IPC.McpQueryResult, (_e, result) => {
        registry.resolve(result);
    });
    ipcMain.removeAllListeners(IPC.AgentToolResult);
    ipcMain.on(IPC.AgentToolResult, (_e, result) => {
        editRegistry.resolve(result);
    });
};
/** Fail every question still waiting — the project is closing. */
export const rejectCanvasQueries = (reason) => {
    registry.rejectAll(reason);
    editRegistry.rejectAll(reason);
};
/**
 * The read tools, answered about `projectPath`. Most go to the renderer;
 * routes and imported originals are read from disk here.
 */
export const canvasToolInvoker = (projectPath) => createToolInvoker((tool, args) => registry.query(tool, args), {
    listRoutes: async () => (await getProjectFormat(projectPath)) === 'scamp' ? listRoutes(projectPath) : [],
    listImportSources: () => listImportSources(projectPath),
    readImportSource: async (view, part) => {
        const found = await readImportSource(projectPath, view, part, IMPORT_SOURCE_REPLY_LIMIT);
        if (found === null)
            return null;
        return {
            text: found.text,
            truncated: found.truncated,
            path: part === 'html' ? found.stored.htmlPath : found.stored.cssPath,
            url: found.stored.url,
        };
    },
    reactSource: async (target, element) => sourceFor(await readRecord(projectPath), target, element),
    // The renderer builds the view's export and main lays it out; no turn,
    // so an omitted `view` is the one open on the canvas.
    findOverflow: (args) => runAgentEdit('scamp_find_overflow', args, ''),
});
