import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipcChannels';
/**
 * Minimal API surface exposed to the renderer. Keep this small — every
 * function here is a potential attack surface and a contract that must
 * stay stable.
 */
const api = {
    chooseFolder: () => ipcRenderer.invoke(IPC.ProjectChooseFolder),
    createProject: (args) => ipcRenderer.invoke(IPC.ProjectCreate, args),
    openProject: (args) => ipcRenderer.invoke(IPC.ProjectOpen, args),
    readProject: (args) => ipcRenderer.invoke(IPC.ProjectRead, args),
    migrateProject: (args) => ipcRenderer.invoke(IPC.ProjectMigrate, args),
    // Routes in a Scamp-framework project: the framework owns them, the
    // app lists and lightly edits them. see docs/notes/routes-in-the-app.md
    listRoutes: (args) => ipcRenderer.invoke(IPC.RoutesList, args),
    readRoute: (args) => ipcRenderer.invoke(IPC.RoutesRead, args),
    renameRouteView: (args) => ipcRenderer.invoke(IPC.RoutesRenameView, args),
    setRouteRender: (args) => ipcRenderer.invoke(IPC.RoutesSetRender, args),
    writeRoute: (args) => ipcRenderer.invoke(IPC.RoutesWrite, args),
    /** `.dev.vars` keys only; the values never reach the renderer. */
    readDevVars: (args) => ipcRenderer.invoke(IPC.DevVarsRead, args),
    openDevVars: (args) => ipcRenderer.invoke(IPC.DevVarsOpen, args),
    onRoutesChanged: (handler) => {
        const listener = () => handler();
        ipcRenderer.on(IPC.RoutesChanged, listener);
        return () => ipcRenderer.removeListener(IPC.RoutesChanged, listener);
    },
    onDevServerLog: (handler) => {
        const listener = (_e, payload) => handler(payload);
        ipcRenderer.on(IPC.DevServerLog, listener);
        return () => ipcRenderer.removeListener(IPC.DevServerLog, listener);
    },
    /**
     * Open (or focus + navigate) the preview window for the project.
     * Returns the window id so callers can correlate; main spawns the
     * dev server in parallel as the window opens.
     */
    // Website import. see docs/plans/website-import-plan.md
    openImport: (args) => ipcRenderer.invoke(IPC.ImportOpen, args),
    /** A captured page arriving from the import window. */
    onImportDeliver: (listener) => {
        const handler = (_e, args) => listener(args);
        ipcRenderer.on(IPC.ImportDeliver, handler);
        return () => ipcRenderer.removeListener(IPC.ImportDeliver, handler);
    },
    /** Download one remote image into the project's assets. */
    fetchImportImage: (args) => ipcRenderer.invoke(IPC.ImportFetchImage, args),
    /** Which of these families does Google Fonts serve? */
    resolveImportFonts: (args) => ipcRenderer.invoke(IPC.ImportResolveFonts, args),
    /** Tell the import window how it went. */
    /** The import window asks to finish or undo one multi-page import. */
    onImportBatchAction: (listener) => {
        const handler = (_e, args) => listener(args);
        ipcRenderer.on(IPC.ImportBatchActionDeliver, handler);
        return () => ipcRenderer.removeListener(IPC.ImportBatchActionDeliver, handler);
    },
    reportImportBatch: (payload) => ipcRenderer.invoke(IPC.ImportBatchReport, payload),
    reportImportResult: (payload) => ipcRenderer.invoke(IPC.ImportResultReport, payload),
    /**
     * Keep the page's original beside the view it became, in a temp
     * directory the MCP can read. see docs/notes/import-source-store.md
     */
    saveImportSource: (args) => ipcRenderer.invoke(IPC.ImportSaveSource, args),
    openPreview: (args) => ipcRenderer.invoke(IPC.PreviewOpen, args),
    /**
     * Push an updated active page + page list to an already-open
     * preview window. No-op if no preview is open for the project
     * (won't spawn one). Used so the URL-bar dropdown stays accurate
     * when the user adds / renames / deletes a page in the canvas.
     */
    updatePreview: (args) => ipcRenderer.invoke(IPC.PreviewUpdate, args),
    /**
     * Close the preview window AND stop its dev server for a project.
     * Called when the user closes the project — preview shouldn't
     * outlive the project that's editing it.
     */
    closePreview: (projectPath) => ipcRenderer.invoke(IPC.PreviewClose, { projectPath }),
    writeFile: (args) => ipcRenderer.invoke(IPC.FileWrite, args),
    patchFile: (args) => ipcRenderer.invoke(IPC.FilePatch, args),
    createPage: (args) => ipcRenderer.invoke(IPC.PageCreate, args),
    deletePage: (args) => ipcRenderer.invoke(IPC.PageDelete, args),
    duplicatePage: (args) => ipcRenderer.invoke(IPC.PageDuplicate, args),
    renamePage: (args) => ipcRenderer.invoke(IPC.PageRename, args),
    createComponent: (args) => ipcRenderer.invoke(IPC.ComponentCreate, args),
    deleteComponent: (args) => ipcRenderer.invoke(IPC.ComponentDelete, args),
    readComponent: (args) => ipcRenderer.invoke(IPC.ComponentRead, args),
    /** Fire-and-forget: resolves once written, rejects never. */
    writeContext: (args) => ipcRenderer.invoke(IPC.ContextWrite, args),
    /**
     * MCP tool calls arriving from the main process. The renderer answers from
     * live store state via `sendMcpQueryResult` — main is waiting on a timeout,
     * so every query must get exactly one reply.
     */
    onMcpQuery: (handler) => {
        const listener = (_e, args) => handler(args);
        ipcRenderer.on(IPC.McpQuery, listener);
        return () => ipcRenderer.removeListener(IPC.McpQuery, listener);
    },
    sendMcpQueryResult: (result) => {
        ipcRenderer.send(IPC.McpQueryResult, result);
    },
    /** The Scamp Agent's edits — answered by `agentToolResponder`, one reply each. */
    onAgentToolCall: (handler) => {
        const listener = (_e, args) => handler(args);
        ipcRenderer.on(IPC.AgentToolCall, listener);
        return () => ipcRenderer.removeListener(IPC.AgentToolCall, listener);
    },
    sendAgentToolResult: (result) => {
        ipcRenderer.send(IPC.AgentToolResult, result);
    },
    getMcpStatus: () => ipcRenderer.invoke(IPC.McpStatus),
    writeComponentThumbnail: (args) => ipcRenderer.invoke(IPC.ComponentWriteThumbnail, args),
    readComponentThumbnail: (args) => ipcRenderer.invoke(IPC.ComponentReadThumbnail, args),
    // Start-screen project thumbnails.
    writeProjectThumbnail: (args) => ipcRenderer.invoke(IPC.ProjectWriteThumbnail, args),
    readProjectThumbnail: (args) => ipcRenderer.invoke(IPC.ProjectReadThumbnail, args),
    // Project snapshots (persistent `.scamp/` point-in-time copies).
    createSnapshot: (args) => ipcRenderer.invoke(IPC.SnapshotCreate, args),
    listSnapshots: (args) => ipcRenderer.invoke(IPC.SnapshotList, args),
    restoreSnapshot: (args) => ipcRenderer.invoke(IPC.SnapshotRestore, args),
    deleteSnapshot: (args) => ipcRenderer.invoke(IPC.SnapshotDelete, args),
    readSnapshotPage: (args) => ipcRenderer.invoke(IPC.SnapshotReadPage, args),
    /**
     * Every project in the default folder, merged with recently-opened
     * projects (deduped, most-recent first). See IPC.ProjectsList.
     */
    getStartScreenProjects: () => ipcRenderer.invoke(IPC.ProjectsList),
    removeRecentProject: (path) => ipcRenderer.invoke(IPC.RecentProjectsRemove, { path }),
    // Settings
    getSettings: () => ipcRenderer.invoke(IPC.SettingsGet),
    setDefaultProjectsFolder: (path) => ipcRenderer.invoke(IPC.SettingsSetDefaultFolder, { path }),
    updateSettings: (patch) => ipcRenderer.invoke(IPC.SettingsUpdate, patch),
    /** Trigger the main process to (re-)initialise or shut down Sentry
     *  in response to the Privacy toggle changing or the first-launch
     *  opt-in prompt being answered. */
    reinitSentry: (optedIn) => ipcRenderer.invoke(IPC.AppReinitSentry, optedIn),
    /** The Scamp app version (from package.json) — useful in any
     *  diagnostic UI that wants to surface it. */
    getAppVersion: () => ipcRenderer.invoke(IPC.AppGetVersion),
    /** Recolor the native title-bar overlay (Windows/Linux window
     *  controls) to match the app theme. Fire-and-forget. */
    setTitleBarOverlayColors: (colors) => ipcRenderer.send(IPC.WindowSetTitleBarOverlay, colors),
    readProjectConfig: (args) => ipcRenderer.invoke(IPC.ProjectConfigRead, args),
    writeProjectConfig: (args) => ipcRenderer.invoke(IPC.ProjectConfigWrite, args),
    onFileChanged: (handler) => {
        const listener = (_e, payload) => handler(payload);
        ipcRenderer.on(IPC.FileChanged, listener);
        return () => ipcRenderer.removeListener(IPC.FileChanged, listener);
    },
    onProjectPagesChanged: (handler) => {
        const listener = () => handler();
        ipcRenderer.on(IPC.ProjectPagesChanged, listener);
        return () => ipcRenderer.removeListener(IPC.ProjectPagesChanged, listener);
    },
    onFileWriteAck: (handler) => {
        const listener = (_e, payload) => handler(payload);
        ipcRenderer.on(IPC.FileWriteAck, listener);
        return () => ipcRenderer.removeListener(IPC.FileWriteAck, listener);
    },
    // Clipboard (paste from OS)
    readClipboard: () => ipcRenderer.invoke(IPC.ClipboardRead),
    writeClipboard: (args) => ipcRenderer.invoke(IPC.ClipboardWrite, args),
    saveClipboardImage: (args) => ipcRenderer.invoke(IPC.ClipboardSaveImage, args),
    // Images
    copyImage: (args) => ipcRenderer.invoke(IPC.FileCopyImage, args),
    chooseImage: (args) => ipcRenderer.invoke(IPC.FileChooseImage, args),
    /** Read a `.svg` file's UTF-8 text (inline import + reload). */
    readFileText: (path) => ipcRenderer.invoke(IPC.FileReadText, path),
    // Export (page or element)
    exportChooseSavePath: (args) => ipcRenderer.invoke(IPC.ExportChooseSavePath, args),
    exportPng: (args) => ipcRenderer.invoke(IPC.ExportPng, args),
    exportSvg: (args) => ipcRenderer.invoke(IPC.ExportSvg, args),
    chooseHtmlExportFolder: () => ipcRenderer.invoke(IPC.ExportHtmlChooseFolder),
    exportHtml: (args) => ipcRenderer.invoke(IPC.ExportHtmlWrite, args),
    // Account. The session token never crosses this boundary — the renderer
    // only ever learns who is signed in.
    authSignIn: () => ipcRenderer.invoke(IPC.AuthStart),
    authCancelSignIn: () => ipcRenderer.invoke(IPC.AuthCancel),
    authStatus: () => ipcRenderer.invoke(IPC.AuthStatus),
    authSignOut: () => ipcRenderer.invoke(IPC.AuthSignOut),
    onAuthChanged: (handler) => {
        const listener = (_e, status) => handler(status);
        ipcRenderer.on(IPC.AuthComplete, listener);
        return () => ipcRenderer.removeListener(IPC.AuthComplete, listener);
    },
    // Scamp Agent provider key. Write-only from here: the key goes in, and
    // only a status ever comes back. see docs/plans/builtin-agent-plan.md
    // React app import. see docs/plans/react-import-plan.md
    reactImportInspect: () => ipcRenderer.invoke(IPC.ReactImportInspect),
    reactImportStart: (args) => ipcRenderer.invoke(IPC.ReactImportStart, args),
    reactImportListNames: (args) => ipcRenderer.invoke(IPC.ReactImportListNames, args),
    onReactImportProgress: (handler) => {
        const listener = (_e, event) => handler(event);
        ipcRenderer.on(IPC.ReactImportProgress, listener);
        return () => ipcRenderer.removeListener(IPC.ReactImportProgress, listener);
    },
    agentKeySet: (key) => ipcRenderer.invoke(IPC.AgentKeySet, { key }),
    agentKeyStatus: () => ipcRenderer.invoke(IPC.AgentKeyStatus),
    agentKeyClear: () => ipcRenderer.invoke(IPC.AgentKeyClear),
    agentSend: (args) => ipcRenderer.invoke(IPC.AgentSend, args),
    agentCancel: () => ipcRenderer.invoke(IPC.AgentCancel),
    agentReset: (args) => ipcRenderer.invoke(IPC.AgentReset, args),
    agentLoad: (args) => ipcRenderer.invoke(IPC.AgentLoad, args),
    agentUndoSession: (args) => ipcRenderer.invoke(IPC.AgentUndoSession, args),
    agentConfirm: (args) => ipcRenderer.invoke(IPC.AgentConfirm, args),
    /** The import window asked for a cleanup of the view it just imported. */
    onAgentStartCleanup: (handler) => {
        const listener = (_e, args) => handler(args);
        ipcRenderer.on(IPC.AgentStartCleanup, listener);
        return () => ipcRenderer.removeListener(IPC.AgentStartCleanup, listener);
    },
    onAgentEvent: (handler) => {
        const listener = (_e, event) => handler(event);
        ipcRenderer.on(IPC.AgentEvent, listener);
        return () => ipcRenderer.removeListener(IPC.AgentEvent, listener);
    },
    // Theme
    readTheme: (args) => ipcRenderer.invoke(IPC.ThemeRead, args),
    writeTheme: (args) => ipcRenderer.invoke(IPC.ThemeWrite, args),
    onThemeChanged: (handler) => {
        const listener = (_e, content) => handler(content);
        ipcRenderer.on(IPC.ThemeChanged, listener);
        return () => ipcRenderer.removeListener(IPC.ThemeChanged, listener);
    },
    // DESIGN.md (project-root design-system doc)
    readDesignMd: (args) => ipcRenderer.invoke(IPC.DesignMdRead, args),
    writeDesignMd: (args) => ipcRenderer.invoke(IPC.DesignMdWrite, args),
    onDesignMdChanged: (handler) => {
        const listener = (_e, content) => handler(content);
        ipcRenderer.on(IPC.DesignMdChanged, listener);
        return () => ipcRenderer.removeListener(IPC.DesignMdChanged, listener);
    },
    onSvgAssetChanged: (handler) => {
        const listener = (_e, payload) => handler(payload);
        ipcRenderer.on(IPC.SvgAssetChanged, listener);
        return () => ipcRenderer.removeListener(IPC.SvgAssetChanged, listener);
    },
    // Terminal
    createTerminal: (args) => ipcRenderer.invoke(IPC.TerminalCreate, args),
    writeTerminal: (args) => ipcRenderer.invoke(IPC.TerminalWrite, args),
    resizeTerminal: (args) => ipcRenderer.invoke(IPC.TerminalResize, args),
    killTerminal: (args) => ipcRenderer.invoke(IPC.TerminalKill, args),
    onTerminalData: (handler) => {
        const listener = (_e, payload) => handler(payload);
        ipcRenderer.on(IPC.TerminalData, listener);
        return () => ipcRenderer.removeListener(IPC.TerminalData, listener);
    },
    onTerminalExit: (handler) => {
        const listener = (_e, payload) => handler(payload);
        ipcRenderer.on(IPC.TerminalExit, listener);
        return () => ipcRenderer.removeListener(IPC.TerminalExit, listener);
    },
    onTerminalForegroundProcess: (handler) => {
        const listener = (_e, payload) => handler(payload);
        ipcRenderer.on(IPC.TerminalForegroundProcess, listener);
        return () => ipcRenderer.removeListener(IPC.TerminalForegroundProcess, listener);
    },
    // Auto-update. The renderer subscribes to status events to drive the
    // update banner; `installUpdateNow` triggers quit-and-install.
    installUpdateNow: () => ipcRenderer.invoke(IPC.UpdaterInstallNow),
    onUpdaterAvailable: (handler) => {
        const listener = (_e, info) => handler(info);
        ipcRenderer.on(IPC.UpdaterAvailable, listener);
        return () => ipcRenderer.removeListener(IPC.UpdaterAvailable, listener);
    },
    onUpdaterProgress: (handler) => {
        const listener = (_e, progress) => handler(progress);
        ipcRenderer.on(IPC.UpdaterProgress, listener);
        return () => ipcRenderer.removeListener(IPC.UpdaterProgress, listener);
    },
    onUpdaterDownloaded: (handler) => {
        const listener = (_e, info) => handler(info);
        ipcRenderer.on(IPC.UpdaterDownloaded, listener);
        return () => ipcRenderer.removeListener(IPC.UpdaterDownloaded, listener);
    },
    onUpdaterError: (handler) => {
        const listener = (_e, message) => handler(message);
        ipcRenderer.on(IPC.UpdaterError, listener);
        return () => ipcRenderer.removeListener(IPC.UpdaterError, listener);
    },
    // E2E test bootstrap. Returns { e2e: false, autoOpenProjectPath: null }
    // in normal use; only populated when the main process was launched
    // with SCAMP_E2E=1.
    getTestBootstrap: () => ipcRenderer.invoke(IPC.TestGetBootstrap),
};
contextBridge.exposeInMainWorld('scamp', api);
