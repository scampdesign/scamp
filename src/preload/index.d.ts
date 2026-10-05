import type { CapturedSource } from '@shared/importCapture';
import type { TitleBarColors } from '@shared/titleBarColors';
import type { FetchImageArgs, FetchImageResult, ImportCapturedArgs, ImportOpenArgs, ImportResultPayload, ResolveFontsArgs, ResolveFontsResult, ChooseFolderResult, ChooseImageArgs, ChooseImageResult, ClipboardReadResult, ClipboardWriteArgs, ClipboardSaveImageArgs, CopyImageArgs, CopyImageResult, CreateProjectArgs, ExportChooseSavePathArgs, ExportChooseSavePathResult, AgentEvent, AgentKeySetResult, AgentKeyStatusResult, AgentSendArgs, AgentSendResult, AuthSignInResult, AuthStatusResult, ExportHtmlArgs, ExportHtmlChooseFolderResult, ExportHtmlResult, ExportPngArgs, ExportResult, ExportSvgArgs, FileChangedPayload, DevServerLogPayload, DevVarsReadArgs, DevVarsReadResult, RouteFile, RouteReadArgs, RouteSetRenderArgs, RouteRenameViewArgs, RouteWriteArgs, RoutesListArgs, SvgAssetChangedPayload, FilePatchArgs, FilePatchResult, FileWriteAckPayload, FileWriteArgs, FileWriteResult, OpenProjectArgs, ComponentCreateArgs, ComponentDeleteArgs, ComponentFile, ComponentReadArgs, ComponentReadThumbnailArgs, ComponentReadThumbnailResult, ComponentWriteThumbnailArgs, ProjectReadThumbnailArgs, ProjectReadThumbnailResult, ProjectWriteThumbnailArgs, ProjectWriteThumbnailResult, ContextWriteArgs, McpQueryArgs, McpQueryResultArgs, McpStatusResult, ComponentWriteThumbnailResult, PageCreateArgs, PageDeleteArgs, PageDuplicateArgs, PageFile, PageRenameArgs, ProjectConfig, ProjectConfigReadArgs, ProjectConfigWriteArgs, ProjectData, PreviewOpenArgs, ProjectMigrateArgs, ProjectMigrateResult, Settings, SnapshotCreateArgs, SnapshotCreateResult, SnapshotDeleteArgs, SnapshotDeleteResult, SnapshotListArgs, SnapshotListResult, SnapshotReadPageArgs, SnapshotReadPageResult, SnapshotRestoreArgs, SnapshotRestoreResult, StartScreenProject, TerminalCreateArgs, TerminalCreateResult, TerminalDataPayload, TerminalExitPayload, TerminalForegroundProcessPayload, TerminalKillArgs, TerminalResizeArgs, TerminalWriteArgs, TestBootstrap, UpdaterInfoPayload, UpdaterProgressPayload } from '@shared/types';
/**
 * Minimal API surface exposed to the renderer. Keep this small — every
 * function here is a potential attack surface and a contract that must
 * stay stable.
 */
declare const api: {
    chooseFolder: () => Promise<ChooseFolderResult>;
    createProject: (args: CreateProjectArgs) => Promise<ProjectData>;
    openProject: (args: OpenProjectArgs) => Promise<ProjectData>;
    readProject: (args: OpenProjectArgs) => Promise<ProjectData>;
    migrateProject: (args: ProjectMigrateArgs) => Promise<ProjectMigrateResult>;
    listRoutes: (args: RoutesListArgs) => Promise<RouteFile[]>;
    readRoute: (args: RouteReadArgs) => Promise<string>;
    renameRouteView: (args: RouteRenameViewArgs) => Promise<string | null>;
    setRouteRender: (args: RouteSetRenderArgs) => Promise<void>;
    writeRoute: (args: RouteWriteArgs) => Promise<void>;
    /** `.dev.vars` keys only; the values never reach the renderer. */
    readDevVars: (args: DevVarsReadArgs) => Promise<DevVarsReadResult>;
    openDevVars: (args: DevVarsReadArgs) => Promise<void>;
    onRoutesChanged: (handler: () => void) => (() => void);
    onDevServerLog: (handler: (payload: DevServerLogPayload) => void) => (() => void);
    /**
     * Open (or focus + navigate) the preview window for the project.
     * Returns the window id so callers can correlate; main spawns the
     * dev server in parallel as the window opens.
     */
    openImport: (args: ImportOpenArgs) => Promise<{
        id: number;
    }>;
    /** A captured page arriving from the import window. */
    onImportDeliver: (listener: (args: ImportCapturedArgs) => void) => (() => void);
    /** Download one remote image into the project's assets. */
    fetchImportImage: (args: FetchImageArgs) => Promise<FetchImageResult>;
    /** Which of these families does Google Fonts serve? */
    resolveImportFonts: (args: ResolveFontsArgs) => Promise<ResolveFontsResult>;
    /** Tell the import window how it went. */
    reportImportResult: (payload: ImportResultPayload) => Promise<void>;
    /**
     * Keep the page's original beside the view it became, in a temp
     * directory the MCP can read. see docs/notes/import-source-store.md
     */
    saveImportSource: (args: {
        projectPath: string;
        view: string;
        url: string;
        source: CapturedSource;
    }) => Promise<{
        ok: boolean;
        error?: string;
    }>;
    openPreview: (args: PreviewOpenArgs) => Promise<{
        windowId: number;
    }>;
    /**
     * Push an updated active page + page list to an already-open
     * preview window. No-op if no preview is open for the project
     * (won't spawn one). Used so the URL-bar dropdown stays accurate
     * when the user adds / renames / deletes a page in the canvas.
     */
    updatePreview: (args: PreviewOpenArgs) => Promise<void>;
    /**
     * Close the preview window AND stop its dev server for a project.
     * Called when the user closes the project — preview shouldn't
     * outlive the project that's editing it.
     */
    closePreview: (projectPath: string) => Promise<void>;
    writeFile: (args: FileWriteArgs) => Promise<FileWriteResult>;
    patchFile: (args: FilePatchArgs) => Promise<FilePatchResult>;
    createPage: (args: PageCreateArgs) => Promise<PageFile>;
    deletePage: (args: PageDeleteArgs) => Promise<void>;
    duplicatePage: (args: PageDuplicateArgs) => Promise<PageFile>;
    renamePage: (args: PageRenameArgs) => Promise<PageFile>;
    createComponent: (args: ComponentCreateArgs) => Promise<ComponentFile>;
    deleteComponent: (args: ComponentDeleteArgs) => Promise<void>;
    readComponent: (args: ComponentReadArgs) => Promise<ComponentFile | null>;
    /** Fire-and-forget: resolves once written, rejects never. */
    writeContext: (args: ContextWriteArgs) => Promise<void>;
    /**
     * MCP tool calls arriving from the main process. The renderer answers from
     * live store state via `sendMcpQueryResult` — main is waiting on a timeout,
     * so every query must get exactly one reply.
     */
    onMcpQuery: (handler: (args: McpQueryArgs) => void) => (() => void);
    sendMcpQueryResult: (result: McpQueryResultArgs) => void;
    getMcpStatus: () => Promise<McpStatusResult>;
    writeComponentThumbnail: (args: ComponentWriteThumbnailArgs) => Promise<ComponentWriteThumbnailResult>;
    readComponentThumbnail: (args: ComponentReadThumbnailArgs) => Promise<ComponentReadThumbnailResult>;
    writeProjectThumbnail: (args: ProjectWriteThumbnailArgs) => Promise<ProjectWriteThumbnailResult>;
    readProjectThumbnail: (args: ProjectReadThumbnailArgs) => Promise<ProjectReadThumbnailResult>;
    createSnapshot: (args: SnapshotCreateArgs) => Promise<SnapshotCreateResult>;
    listSnapshots: (args: SnapshotListArgs) => Promise<SnapshotListResult>;
    restoreSnapshot: (args: SnapshotRestoreArgs) => Promise<SnapshotRestoreResult>;
    deleteSnapshot: (args: SnapshotDeleteArgs) => Promise<SnapshotDeleteResult>;
    readSnapshotPage: (args: SnapshotReadPageArgs) => Promise<SnapshotReadPageResult>;
    /**
     * Every project in the default folder, merged with recently-opened
     * projects (deduped, most-recent first). See IPC.ProjectsList.
     */
    getStartScreenProjects: () => Promise<StartScreenProject[]>;
    removeRecentProject: (path: string) => Promise<void>;
    getSettings: () => Promise<Settings>;
    setDefaultProjectsFolder: (path: string | null) => Promise<Settings>;
    updateSettings: (patch: Partial<Settings>) => Promise<Settings>;
    /** Trigger the main process to (re-)initialise or shut down Sentry
     *  in response to the Privacy toggle changing or the first-launch
     *  opt-in prompt being answered. */
    reinitSentry: (optedIn: boolean) => Promise<void>;
    /** The Scamp app version (from package.json) — useful in any
     *  diagnostic UI that wants to surface it. */
    getAppVersion: () => Promise<string>;
    /** Recolor the native title-bar overlay (Windows/Linux window
     *  controls) to match the app theme. Fire-and-forget. */
    setTitleBarOverlayColors: (colors: TitleBarColors) => void;
    readProjectConfig: (args: ProjectConfigReadArgs) => Promise<ProjectConfig>;
    writeProjectConfig: (args: ProjectConfigWriteArgs) => Promise<ProjectConfig>;
    onFileChanged: (handler: (payload: FileChangedPayload) => void) => (() => void);
    onProjectPagesChanged: (handler: () => void) => (() => void);
    onFileWriteAck: (handler: (payload: FileWriteAckPayload) => void) => (() => void);
    readClipboard: () => Promise<ClipboardReadResult>;
    writeClipboard: (args: ClipboardWriteArgs) => Promise<void>;
    saveClipboardImage: (args: ClipboardSaveImageArgs) => Promise<CopyImageResult>;
    copyImage: (args: CopyImageArgs) => Promise<CopyImageResult>;
    chooseImage: (args?: ChooseImageArgs) => Promise<ChooseImageResult>;
    /** Read a `.svg` file's UTF-8 text (inline import + reload). */
    readFileText: (path: string) => Promise<string>;
    exportChooseSavePath: (args: ExportChooseSavePathArgs) => Promise<ExportChooseSavePathResult>;
    exportPng: (args: ExportPngArgs) => Promise<ExportResult>;
    exportSvg: (args: ExportSvgArgs) => Promise<ExportResult>;
    chooseHtmlExportFolder: () => Promise<ExportHtmlChooseFolderResult>;
    exportHtml: (args: ExportHtmlArgs) => Promise<ExportHtmlResult>;
    authSignIn: () => Promise<AuthSignInResult>;
    authCancelSignIn: () => Promise<void>;
    authStatus: () => Promise<AuthStatusResult>;
    authSignOut: () => Promise<void>;
    onAuthChanged: (handler: (status: AuthStatusResult) => void) => (() => void);
    agentKeySet: (key: string) => Promise<AgentKeySetResult>;
    agentKeyStatus: () => Promise<AgentKeyStatusResult>;
    agentKeyClear: () => Promise<void>;
    agentSend: (args: AgentSendArgs) => Promise<AgentSendResult>;
    agentCancel: () => Promise<void>;
    agentReset: () => Promise<void>;
    onAgentEvent: (handler: (event: AgentEvent) => void) => (() => void);
    readTheme: (args: {
        projectPath: string;
    }) => Promise<string>;
    writeTheme: (args: {
        projectPath: string;
        content: string;
    }) => Promise<void>;
    onThemeChanged: (handler: (content: string) => void) => (() => void);
    readDesignMd: (args: {
        projectPath: string;
    }) => Promise<string>;
    writeDesignMd: (args: {
        projectPath: string;
        content: string;
    }) => Promise<void>;
    onDesignMdChanged: (handler: (content: string) => void) => (() => void);
    onSvgAssetChanged: (handler: (payload: SvgAssetChangedPayload) => void) => (() => void);
    createTerminal: (args: TerminalCreateArgs) => Promise<TerminalCreateResult>;
    writeTerminal: (args: TerminalWriteArgs) => Promise<void>;
    resizeTerminal: (args: TerminalResizeArgs) => Promise<void>;
    killTerminal: (args: TerminalKillArgs) => Promise<void>;
    onTerminalData: (handler: (payload: TerminalDataPayload) => void) => (() => void);
    onTerminalExit: (handler: (payload: TerminalExitPayload) => void) => (() => void);
    onTerminalForegroundProcess: (handler: (payload: TerminalForegroundProcessPayload) => void) => (() => void);
    installUpdateNow: () => Promise<void>;
    onUpdaterAvailable: (handler: (info: UpdaterInfoPayload) => void) => (() => void);
    onUpdaterProgress: (handler: (progress: UpdaterProgressPayload) => void) => (() => void);
    onUpdaterDownloaded: (handler: (info: UpdaterInfoPayload) => void) => (() => void);
    onUpdaterError: (handler: (message: string) => void) => (() => void);
    getTestBootstrap: () => Promise<TestBootstrap>;
};
export type ScampApi = typeof api;
export {};
