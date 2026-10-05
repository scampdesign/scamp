import { homedir } from 'os';
import { basename } from 'path';
import { ipcMain } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { detectDisabledAgents, writeAgentConfigs } from './agentConfig';
import { ensureToken, markMcpStopped, writeMcpConfig } from './mcpOps';
import { startMcpServer } from './server';
import { TOOL_DESCRIPTORS } from './tools';
import { canvasToolInvoker, initCanvasQueries, rejectCanvasQueries } from '../canvasQueries';
/**
 * The Electron glue: owns the running server. Questions to the canvas go
 * through `canvasQueries`, which the built-in agent shares.
 *
 * Everything testable lives in its neighbours — this file exists so
 * `server.ts`, `tools.ts`, and `pendingQueries.ts` never import Electron and
 * can be unit tested without an app.
 * see docs/plans/mcp-server-plan.md
 */
let running = null;
let activeProject = null;
let activeToken = null;
let registered = [];
let agentSeen = false;
/** Register the reply listener once, at app start. */
export const initMcp = (win) => {
    initCanvasQueries(win);
    ipcMain.removeHandler(IPC.McpStatus);
    ipcMain.handle(IPC.McpStatus, () => mcpStatus());
};
/**
 * Start (or restart) the server for a project.
 *
 * Called wherever `watchProject` is — opening a different project must move
 * the server with it, since every tool answers about whatever is on canvas.
 * Best-effort: a failure here must never block opening a project.
 */
export const startMcpForProject = async (projectPath) => {
    await stopMcp();
    try {
        const token = await ensureToken(projectPath);
        agentSeen = false;
        running = await startMcpServer({
            token,
            onAuthenticatedRequest: () => {
                agentSeen = true;
            },
            deps: {
                tools: TOOL_DESCRIPTORS,
                invoke: canvasToolInvoker(projectPath),
            },
        });
        activeProject = projectPath;
        activeToken = token;
        await writeMcpConfig(projectPath, {
            url: running.url,
            token,
            running: true,
            started_at: new Date().toISOString(),
            project: basename(projectPath),
        });
        // Register with every installed agent so the user runs no command.
        // Failures here are reported, never thrown: a config we couldn't merge
        // must not stop the server the user can still connect to by hand.
        const report = await writeAgentConfigs({
            projectPath,
            homeDir: homedir(),
            url: running.url,
            token,
        });
        registered = [...report.written];
        for (const skip of report.skipped) {
            console.warn(`[mcp] skipped ${skip.path}: ${skip.reason}`);
        }
    }
    catch (err) {
        // A port collision or unwritable `.scamp/` should degrade to "no MCP",
        // not to "the project won't open".
        console.error('[mcp] failed to start:', err);
        await stopMcp();
    }
};
export const stopMcp = async () => {
    // Fail in-flight queries before closing the socket, so a waiting agent gets
    // a reason rather than a timeout.
    rejectCanvasQueries('The Scamp MCP server is shutting down.');
    const server = running;
    running = null;
    if (server !== null)
        await server.close();
    const project = activeProject;
    activeProject = null;
    activeToken = null;
    registered = [];
    agentSeen = false;
    if (project !== null)
        await markMcpStopped(project);
};
/** Drives the terminal indicator. */
export const mcpStatus = async () => ({
    running: running !== null,
    url: running?.url ?? null,
    token: activeToken,
    registered: [...registered],
    agentConnected: agentSeen,
    disabledIn: activeProject === null ? [] : await detectDisabledAgents(activeProject),
});
