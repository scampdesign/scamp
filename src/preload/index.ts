import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC } from '@shared/ipcChannels';
import type { CapturedSource } from '@shared/importCapture';
import type { TitleBarColors } from '@shared/titleBarColors';
import type {
  FetchImageArgs,
  FetchImageResult,
  ImportCapturedArgs,
  ImportOpenArgs,
  ImportResultPayload,
  ResolveFontsArgs,
  ResolveFontsResult,
  ChooseFolderResult,
  ChooseImageArgs,
  ChooseImageResult,
  ClipboardReadResult,
  ClipboardWriteArgs,
  ClipboardSaveImageArgs,
  CopyImageArgs,
  CopyImageResult,
  CreateProjectArgs,
  ExportChooseSavePathArgs,
  ExportChooseSavePathResult,
  AgentConversationArgs,
  ImportBatchActionArgs,
  ImportBatchReport,
  ReactImportInspectResult,
  ReactImportListNamesArgs,
  ReactImportListNamesResult,
  ReactImportRecordArgs,
  ReactImportProgress,
  ReactImportStartArgs,
  ReactImportStartResult,
  AgentConversationState,
  AgentEvent,
  AgentKeySetResult,
  AgentKeyStatusResult,
  AgentSendArgs,
  AgentStartCleanupArgs,
  AgentToolCallArgs,
  AgentUndoSessionResult,
  AgentMeasureOverflowArgs,
  AgentMeasureOverflowResult,
  AgentSendResult,
  AuthSignInResult,
  AuthStatusResult,
  ExportHtmlArgs,
  ExportHtmlChooseFolderResult,
  ExportHtmlResult,
  ExportPngArgs,
  ExportResult,
  ExportSvgArgs,
  FileChangedPayload,
  DevServerLogPayload,
  DevVarsReadArgs,
  DevVarsReadResult,
  RouteFile,
  RouteReadArgs,
  RouteSetRenderArgs,
  RouteRenameViewArgs,
  RouteWriteArgs,
  RoutesListArgs,
  SvgAssetChangedPayload,
  FilePatchArgs,
  FilePatchResult,
  FileWriteAckPayload,
  FileWriteArgs,
  FileWriteResult,
  OpenProjectArgs,
  ComponentCreateArgs,
  ComponentDeleteArgs,
  ComponentFile,
  ComponentReadArgs,
  ComponentReadThumbnailArgs,
  ComponentReadThumbnailResult,
  ComponentWriteThumbnailArgs,
  ProjectReadThumbnailArgs,
  ProjectReadThumbnailResult,
  ProjectWriteThumbnailArgs,
  ProjectWriteThumbnailResult,
  ContextWriteArgs,
  McpQueryArgs,
  McpQueryResultArgs,
  McpStatusResult,
  ComponentWriteThumbnailResult,
  PageCreateArgs,
  PageDeleteArgs,
  PageDuplicateArgs,
  PageFile,
  PageRenameArgs,
  ProjectConfig,
  ProjectConfigReadArgs,
  ProjectConfigWriteArgs,
  ProjectData,
  PreviewOpenArgs,
  ProjectMigrateArgs,
  ProjectMigrateResult,
  Settings,
  SnapshotCreateArgs,
  SnapshotCreateResult,
  SnapshotDeleteArgs,
  SnapshotDeleteResult,
  SnapshotListArgs,
  SnapshotListResult,
  SnapshotReadPageArgs,
  SnapshotReadPageResult,
  SnapshotRestoreArgs,
  SnapshotRestoreResult,
  StartScreenProject,
  TerminalCreateArgs,
  TerminalCreateResult,
  TerminalDataPayload,
  TerminalExitPayload,
  TerminalKillArgs,
  TerminalResizeArgs,
  TerminalWriteArgs,
  TestBootstrap,
  UpdaterInfoPayload,
  UpdaterProgressPayload,
} from '@shared/types';

/**
 * Minimal API surface exposed to the renderer. Keep this small — every
 * function here is a potential attack surface and a contract that must
 * stay stable.
 */
const api = {
  chooseFolder: (): Promise<ChooseFolderResult> =>
    ipcRenderer.invoke(IPC.ProjectChooseFolder),

  createProject: (args: CreateProjectArgs): Promise<ProjectData> =>
    ipcRenderer.invoke(IPC.ProjectCreate, args),

  openProject: (args: OpenProjectArgs): Promise<ProjectData> =>
    ipcRenderer.invoke(IPC.ProjectOpen, args),

  readProject: (args: OpenProjectArgs): Promise<ProjectData> =>
    ipcRenderer.invoke(IPC.ProjectRead, args),

  migrateProject: (args: ProjectMigrateArgs): Promise<ProjectMigrateResult> =>
    ipcRenderer.invoke(IPC.ProjectMigrate, args),

  // Routes in a Scamp-framework project: the framework owns them, the
  // app lists and lightly edits them. see docs/notes/routes-in-the-app.md
  listRoutes: (args: RoutesListArgs): Promise<RouteFile[]> =>
    ipcRenderer.invoke(IPC.RoutesList, args),
  readRoute: (args: RouteReadArgs): Promise<string> =>
    ipcRenderer.invoke(IPC.RoutesRead, args),
  renameRouteView: (args: RouteRenameViewArgs): Promise<string | null> =>
    ipcRenderer.invoke(IPC.RoutesRenameView, args),
  setRouteRender: (args: RouteSetRenderArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.RoutesSetRender, args),
  writeRoute: (args: RouteWriteArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.RoutesWrite, args),
  /** `.dev.vars` keys only; the values never reach the renderer. */
  readDevVars: (args: DevVarsReadArgs): Promise<DevVarsReadResult> =>
    ipcRenderer.invoke(IPC.DevVarsRead, args),
  openDevVars: (args: DevVarsReadArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.DevVarsOpen, args),
  onRoutesChanged: (handler: () => void): (() => void) => {
    const listener = (): void => handler();
    ipcRenderer.on(IPC.RoutesChanged, listener);
    return () => ipcRenderer.removeListener(IPC.RoutesChanged, listener);
  },
  onDevServerLog: (handler: (payload: DevServerLogPayload) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: DevServerLogPayload): void => handler(payload);
    ipcRenderer.on(IPC.DevServerLog, listener);
    return () => ipcRenderer.removeListener(IPC.DevServerLog, listener);
  },

  /**
   * Open (or focus + navigate) the preview window for the project.
   * Returns the window id so callers can correlate; main spawns the
   * dev server in parallel as the window opens.
   */
  // Website import. see docs/plans/website-import-plan.md
  openImport: (args: ImportOpenArgs): Promise<{ id: number }> =>
    ipcRenderer.invoke(IPC.ImportOpen, args),
  /** A captured page arriving from the import window. */
  onImportDeliver: (
    listener: (args: ImportCapturedArgs) => void
  ): (() => void) => {
    const handler = (_e: IpcRendererEvent, args: ImportCapturedArgs): void => listener(args);
    ipcRenderer.on(IPC.ImportDeliver, handler);
    return () => ipcRenderer.removeListener(IPC.ImportDeliver, handler);
  },
  /** Download one remote image into the project's assets. */
  fetchImportImage: (args: FetchImageArgs): Promise<FetchImageResult> =>
    ipcRenderer.invoke(IPC.ImportFetchImage, args),
  /** Which of these families does Google Fonts serve? */
  resolveImportFonts: (args: ResolveFontsArgs): Promise<ResolveFontsResult> =>
    ipcRenderer.invoke(IPC.ImportResolveFonts, args),
  /** Tell the import window how it went. */
  /** The import window asks to finish or undo one multi-page import. */
  onImportBatchAction: (listener: (args: ImportBatchActionArgs) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, args: ImportBatchActionArgs): void => listener(args);
    ipcRenderer.on(IPC.ImportBatchActionDeliver, handler);
    return () => ipcRenderer.removeListener(IPC.ImportBatchActionDeliver, handler);
  },
  reportImportBatch: (payload: ImportBatchReport): Promise<void> => ipcRenderer.invoke(IPC.ImportBatchReport, payload),
  reportImportResult: (payload: ImportResultPayload): Promise<void> =>
    ipcRenderer.invoke(IPC.ImportResultReport, payload),
  /**
   * Keep the page's original beside the view it became, in a temp
   * directory the MCP can read. see docs/notes/import-source-store.md
   */
  saveImportSource: (args: {
    projectPath: string;
    view: string;
    url: string;
    source: CapturedSource;
  }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.ImportSaveSource, args),

  openPreview: (args: PreviewOpenArgs): Promise<{ windowId: number }> =>
    ipcRenderer.invoke(IPC.PreviewOpen, args),

  /**
   * Push an updated active page + page list to an already-open
   * preview window. No-op if no preview is open for the project
   * (won't spawn one). Used so the URL-bar dropdown stays accurate
   * when the user adds / renames / deletes a page in the canvas.
   */
  updatePreview: (args: PreviewOpenArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.PreviewUpdate, args),

  /**
   * Close the preview window AND stop its dev server for a project.
   * Called when the user closes the project — preview shouldn't
   * outlive the project that's editing it.
   */
  closePreview: (projectPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.PreviewClose, { projectPath }),

  writeFile: (args: FileWriteArgs): Promise<FileWriteResult> =>
    ipcRenderer.invoke(IPC.FileWrite, args),

  patchFile: (args: FilePatchArgs): Promise<FilePatchResult> =>
    ipcRenderer.invoke(IPC.FilePatch, args),

  createPage: (args: PageCreateArgs): Promise<PageFile> =>
    ipcRenderer.invoke(IPC.PageCreate, args),

  deletePage: (args: PageDeleteArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.PageDelete, args),

  duplicatePage: (args: PageDuplicateArgs): Promise<PageFile> =>
    ipcRenderer.invoke(IPC.PageDuplicate, args),

  renamePage: (args: PageRenameArgs): Promise<PageFile> =>
    ipcRenderer.invoke(IPC.PageRename, args),

  createComponent: (args: ComponentCreateArgs): Promise<ComponentFile> =>
    ipcRenderer.invoke(IPC.ComponentCreate, args),

  deleteComponent: (args: ComponentDeleteArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.ComponentDelete, args),

  readComponent: (args: ComponentReadArgs): Promise<ComponentFile | null> =>
    ipcRenderer.invoke(IPC.ComponentRead, args),

  /** Fire-and-forget: resolves once written, rejects never. */
  writeContext: (args: ContextWriteArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.ContextWrite, args),

  /**
   * MCP tool calls arriving from the main process. The renderer answers from
   * live store state via `sendMcpQueryResult` — main is waiting on a timeout,
   * so every query must get exactly one reply.
   */
  onMcpQuery: (handler: (args: McpQueryArgs) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, args: McpQueryArgs): void =>
      handler(args);
    ipcRenderer.on(IPC.McpQuery, listener);
    return () => ipcRenderer.removeListener(IPC.McpQuery, listener);
  },

  sendMcpQueryResult: (result: McpQueryResultArgs): void => {
    ipcRenderer.send(IPC.McpQueryResult, result);
  },

  /** The Scamp Agent's edits — answered by `agentToolResponder`, one reply each. */
  onAgentToolCall: (handler: (args: AgentToolCallArgs) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, args: AgentToolCallArgs): void => handler(args);
    ipcRenderer.on(IPC.AgentToolCall, listener);
    return () => ipcRenderer.removeListener(IPC.AgentToolCall, listener);
  },

  sendAgentToolResult: (result: McpQueryResultArgs): void => {
    ipcRenderer.send(IPC.AgentToolResult, result);
  },

  /** For the agent's overflow check: main lays the view out and measures it. */
  agentMeasureOverflow: (args: AgentMeasureOverflowArgs): Promise<AgentMeasureOverflowResult> =>
    ipcRenderer.invoke(IPC.AgentMeasureOverflow, args),

  getMcpStatus: (): Promise<McpStatusResult> =>
    ipcRenderer.invoke(IPC.McpStatus),

  writeComponentThumbnail: (
    args: ComponentWriteThumbnailArgs
  ): Promise<ComponentWriteThumbnailResult> =>
    ipcRenderer.invoke(IPC.ComponentWriteThumbnail, args),

  readComponentThumbnail: (
    args: ComponentReadThumbnailArgs
  ): Promise<ComponentReadThumbnailResult> =>
    ipcRenderer.invoke(IPC.ComponentReadThumbnail, args),

  // Start-screen project thumbnails.
  writeProjectThumbnail: (
    args: ProjectWriteThumbnailArgs
  ): Promise<ProjectWriteThumbnailResult> =>
    ipcRenderer.invoke(IPC.ProjectWriteThumbnail, args),

  readProjectThumbnail: (
    args: ProjectReadThumbnailArgs
  ): Promise<ProjectReadThumbnailResult> =>
    ipcRenderer.invoke(IPC.ProjectReadThumbnail, args),

  // Project snapshots (persistent `.scamp/` point-in-time copies).
  createSnapshot: (
    args: SnapshotCreateArgs
  ): Promise<SnapshotCreateResult> =>
    ipcRenderer.invoke(IPC.SnapshotCreate, args),

  listSnapshots: (args: SnapshotListArgs): Promise<SnapshotListResult> =>
    ipcRenderer.invoke(IPC.SnapshotList, args),

  restoreSnapshot: (
    args: SnapshotRestoreArgs
  ): Promise<SnapshotRestoreResult> =>
    ipcRenderer.invoke(IPC.SnapshotRestore, args),

  deleteSnapshot: (
    args: SnapshotDeleteArgs
  ): Promise<SnapshotDeleteResult> =>
    ipcRenderer.invoke(IPC.SnapshotDelete, args),

  readSnapshotPage: (
    args: SnapshotReadPageArgs
  ): Promise<SnapshotReadPageResult> =>
    ipcRenderer.invoke(IPC.SnapshotReadPage, args),

  /**
   * Every project in the default folder, merged with recently-opened
   * projects (deduped, most-recent first). See IPC.ProjectsList.
   */
  getStartScreenProjects: (): Promise<StartScreenProject[]> =>
    ipcRenderer.invoke(IPC.ProjectsList),

  removeRecentProject: (path: string): Promise<void> =>
    ipcRenderer.invoke(IPC.RecentProjectsRemove, { path }),

  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.SettingsGet),

  setDefaultProjectsFolder: (path: string | null): Promise<Settings> =>
    ipcRenderer.invoke(IPC.SettingsSetDefaultFolder, { path }),

  updateSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke(IPC.SettingsUpdate, patch),

  /** Trigger the main process to (re-)initialise or shut down Sentry
   *  in response to the Privacy toggle changing or the first-launch
   *  opt-in prompt being answered. */
  reinitSentry: (optedIn: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.AppReinitSentry, optedIn),

  /** The Scamp app version (from package.json) — useful in any
   *  diagnostic UI that wants to surface it. */
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke(IPC.AppGetVersion),

  /** Recolor the native title-bar overlay (Windows/Linux window
   *  controls) to match the app theme. Fire-and-forget. */
  setTitleBarOverlayColors: (colors: TitleBarColors): void =>
    ipcRenderer.send(IPC.WindowSetTitleBarOverlay, colors),

  readProjectConfig: (args: ProjectConfigReadArgs): Promise<ProjectConfig> =>
    ipcRenderer.invoke(IPC.ProjectConfigRead, args),

  writeProjectConfig: (args: ProjectConfigWriteArgs): Promise<ProjectConfig> =>
    ipcRenderer.invoke(IPC.ProjectConfigWrite, args),

  onFileChanged: (handler: (payload: FileChangedPayload) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: FileChangedPayload): void => handler(payload);
    ipcRenderer.on(IPC.FileChanged, listener);
    return () => ipcRenderer.removeListener(IPC.FileChanged, listener);
  },

  onProjectPagesChanged: (handler: () => void): (() => void) => {
    const listener = (): void => handler();
    ipcRenderer.on(IPC.ProjectPagesChanged, listener);
    return () => ipcRenderer.removeListener(IPC.ProjectPagesChanged, listener);
  },

  onFileWriteAck: (handler: (payload: FileWriteAckPayload) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: FileWriteAckPayload): void => handler(payload);
    ipcRenderer.on(IPC.FileWriteAck, listener);
    return () => ipcRenderer.removeListener(IPC.FileWriteAck, listener);
  },

  // Clipboard (paste from OS)
  readClipboard: (): Promise<ClipboardReadResult> =>
    ipcRenderer.invoke(IPC.ClipboardRead),

  writeClipboard: (args: ClipboardWriteArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.ClipboardWrite, args),
  saveClipboardImage: (
    args: ClipboardSaveImageArgs
  ): Promise<CopyImageResult> =>
    ipcRenderer.invoke(IPC.ClipboardSaveImage, args),

  // Images
  copyImage: (args: CopyImageArgs): Promise<CopyImageResult> =>
    ipcRenderer.invoke(IPC.FileCopyImage, args),

  chooseImage: (args?: ChooseImageArgs): Promise<ChooseImageResult> =>
    ipcRenderer.invoke(IPC.FileChooseImage, args),

  /** Read a `.svg` file's UTF-8 text (inline import + reload). */
  readFileText: (path: string): Promise<string> =>
    ipcRenderer.invoke(IPC.FileReadText, path),

  // Export (page or element)
  exportChooseSavePath: (
    args: ExportChooseSavePathArgs
  ): Promise<ExportChooseSavePathResult> =>
    ipcRenderer.invoke(IPC.ExportChooseSavePath, args),

  exportPng: (args: ExportPngArgs): Promise<ExportResult> =>
    ipcRenderer.invoke(IPC.ExportPng, args),

  exportSvg: (args: ExportSvgArgs): Promise<ExportResult> =>
    ipcRenderer.invoke(IPC.ExportSvg, args),

  chooseHtmlExportFolder: (): Promise<ExportHtmlChooseFolderResult> =>
    ipcRenderer.invoke(IPC.ExportHtmlChooseFolder),

  exportHtml: (args: ExportHtmlArgs): Promise<ExportHtmlResult> =>
    ipcRenderer.invoke(IPC.ExportHtmlWrite, args),

  // Account. The session token never crosses this boundary — the renderer
  // only ever learns who is signed in.
  authSignIn: (): Promise<AuthSignInResult> => ipcRenderer.invoke(IPC.AuthStart),
  authCancelSignIn: (): Promise<void> => ipcRenderer.invoke(IPC.AuthCancel),
  authStatus: (): Promise<AuthStatusResult> => ipcRenderer.invoke(IPC.AuthStatus),
  authSignOut: (): Promise<void> => ipcRenderer.invoke(IPC.AuthSignOut),
  onAuthChanged: (handler: (status: AuthStatusResult) => void): (() => void) => {
    const listener = (_e: unknown, status: AuthStatusResult): void => handler(status);
    ipcRenderer.on(IPC.AuthComplete, listener);
    return () => ipcRenderer.removeListener(IPC.AuthComplete, listener);
  },

  // Scamp Agent provider key. Write-only from here: the key goes in, and
  // only a status ever comes back. see docs/plans/builtin-agent-plan.md
  // React app import. see docs/plans/react-import-plan.md
  reactImportInspect: (): Promise<ReactImportInspectResult> => ipcRenderer.invoke(IPC.ReactImportInspect),
  reactImportStart: (args: ReactImportStartArgs): Promise<ReactImportStartResult> =>
    ipcRenderer.invoke(IPC.ReactImportStart, args),
  reactImportRecord: (args: ReactImportRecordArgs): Promise<void> => ipcRenderer.invoke(IPC.ReactImportRecord, args),
  reactImportListNames: (args: ReactImportListNamesArgs): Promise<ReactImportListNamesResult> =>
    ipcRenderer.invoke(IPC.ReactImportListNames, args),
  onReactImportProgress: (handler: (event: ReactImportProgress) => void): (() => void) => {
    const listener = (_e: unknown, event: ReactImportProgress): void => handler(event);
    ipcRenderer.on(IPC.ReactImportProgress, listener);
    return () => ipcRenderer.removeListener(IPC.ReactImportProgress, listener);
  },
  agentKeySet: (key: string): Promise<AgentKeySetResult> =>
    ipcRenderer.invoke(IPC.AgentKeySet, { key }),
  agentKeyStatus: (): Promise<AgentKeyStatusResult> => ipcRenderer.invoke(IPC.AgentKeyStatus),
  agentKeyClear: (): Promise<void> => ipcRenderer.invoke(IPC.AgentKeyClear),
  agentSend: (args: AgentSendArgs): Promise<AgentSendResult> =>
    ipcRenderer.invoke(IPC.AgentSend, args),
  agentCancel: (): Promise<void> => ipcRenderer.invoke(IPC.AgentCancel),
  agentReset: (args: AgentConversationArgs): Promise<void> => ipcRenderer.invoke(IPC.AgentReset, args),
  agentLoad: (args: AgentConversationArgs): Promise<AgentConversationState> =>
    ipcRenderer.invoke(IPC.AgentLoad, args),
  agentUndoSession: (args: AgentConversationArgs & { note: string }): Promise<AgentUndoSessionResult> =>
    ipcRenderer.invoke(IPC.AgentUndoSession, args),
  agentConfirm: (args: { confirmId: string; approved: boolean }): Promise<void> =>
    ipcRenderer.invoke(IPC.AgentConfirm, args),
  /** The import window asked for a cleanup of the view it just imported. */
  onAgentStartCleanup: (handler: (args: AgentStartCleanupArgs) => void): (() => void) => {
    const listener = (_e: unknown, args: AgentStartCleanupArgs): void => handler(args);
    ipcRenderer.on(IPC.AgentStartCleanup, listener);
    return () => ipcRenderer.removeListener(IPC.AgentStartCleanup, listener);
  },
  onAgentEvent: (handler: (event: AgentEvent) => void): (() => void) => {
    const listener = (_e: unknown, event: AgentEvent): void => handler(event);
    ipcRenderer.on(IPC.AgentEvent, listener);
    return () => ipcRenderer.removeListener(IPC.AgentEvent, listener);
  },

  // Theme
  readTheme: (args: { projectPath: string }): Promise<string> =>
    ipcRenderer.invoke(IPC.ThemeRead, args),

  writeTheme: (args: { projectPath: string; content: string }): Promise<void> =>
    ipcRenderer.invoke(IPC.ThemeWrite, args),

  onThemeChanged: (handler: (content: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, content: string): void => handler(content);
    ipcRenderer.on(IPC.ThemeChanged, listener);
    return () => ipcRenderer.removeListener(IPC.ThemeChanged, listener);
  },

  // DESIGN.md (project-root design-system doc)
  readDesignMd: (args: { projectPath: string }): Promise<string> =>
    ipcRenderer.invoke(IPC.DesignMdRead, args),

  writeDesignMd: (args: {
    projectPath: string;
    content: string;
  }): Promise<void> => ipcRenderer.invoke(IPC.DesignMdWrite, args),

  onDesignMdChanged: (handler: (content: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, content: string): void =>
      handler(content);
    ipcRenderer.on(IPC.DesignMdChanged, listener);
    return () => ipcRenderer.removeListener(IPC.DesignMdChanged, listener);
  },

  onSvgAssetChanged: (
    handler: (payload: SvgAssetChangedPayload) => void
  ): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: SvgAssetChangedPayload): void =>
      handler(payload);
    ipcRenderer.on(IPC.SvgAssetChanged, listener);
    return () => ipcRenderer.removeListener(IPC.SvgAssetChanged, listener);
  },

  // Terminal
  createTerminal: (args: TerminalCreateArgs): Promise<TerminalCreateResult> =>
    ipcRenderer.invoke(IPC.TerminalCreate, args),

  writeTerminal: (args: TerminalWriteArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.TerminalWrite, args),

  resizeTerminal: (args: TerminalResizeArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.TerminalResize, args),

  killTerminal: (args: TerminalKillArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.TerminalKill, args),

  onTerminalData: (handler: (payload: TerminalDataPayload) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: TerminalDataPayload): void => handler(payload);
    ipcRenderer.on(IPC.TerminalData, listener);
    return () => ipcRenderer.removeListener(IPC.TerminalData, listener);
  },

  onTerminalExit: (handler: (payload: TerminalExitPayload) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: TerminalExitPayload): void => handler(payload);
    ipcRenderer.on(IPC.TerminalExit, listener);
    return () => ipcRenderer.removeListener(IPC.TerminalExit, listener);
  },

  // Auto-update. The renderer subscribes to status events to drive the
  // update banner; `installUpdateNow` triggers quit-and-install.
  installUpdateNow: (): Promise<void> =>
    ipcRenderer.invoke(IPC.UpdaterInstallNow),

  onUpdaterAvailable: (
    handler: (info: UpdaterInfoPayload) => void
  ): (() => void) => {
    const listener = (_e: IpcRendererEvent, info: UpdaterInfoPayload): void =>
      handler(info);
    ipcRenderer.on(IPC.UpdaterAvailable, listener);
    return () => ipcRenderer.removeListener(IPC.UpdaterAvailable, listener);
  },

  onUpdaterProgress: (
    handler: (progress: UpdaterProgressPayload) => void
  ): (() => void) => {
    const listener = (
      _e: IpcRendererEvent,
      progress: UpdaterProgressPayload
    ): void => handler(progress);
    ipcRenderer.on(IPC.UpdaterProgress, listener);
    return () => ipcRenderer.removeListener(IPC.UpdaterProgress, listener);
  },

  onUpdaterDownloaded: (
    handler: (info: UpdaterInfoPayload) => void
  ): (() => void) => {
    const listener = (_e: IpcRendererEvent, info: UpdaterInfoPayload): void =>
      handler(info);
    ipcRenderer.on(IPC.UpdaterDownloaded, listener);
    return () => ipcRenderer.removeListener(IPC.UpdaterDownloaded, listener);
  },

  onUpdaterError: (handler: (message: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, message: string): void =>
      handler(message);
    ipcRenderer.on(IPC.UpdaterError, listener);
    return () => ipcRenderer.removeListener(IPC.UpdaterError, listener);
  },

  // E2E test bootstrap. Returns { e2e: false, autoOpenProjectPath: null }
  // in normal use; only populated when the main process was launched
  // with SCAMP_E2E=1.
  getTestBootstrap: (): Promise<TestBootstrap> =>
    ipcRenderer.invoke(IPC.TestGetBootstrap),
};

contextBridge.exposeInMainWorld('scamp', api);

export type ScampApi = typeof api;
