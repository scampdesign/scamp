/**
 * Centralized IPC channel name constants. Never hardcode channel name strings —
 * always import from here so renaming is safe and the surface stays small.
 */
export declare const IPC: {
    readonly ProjectChooseFolder: "project:chooseFolder";
    readonly ProjectCreate: "project:create";
    readonly ProjectOpen: "project:open";
    readonly ProjectRead: "project:read";
    readonly ProjectMigrate: "project:migrate";
    readonly ProjectPagesChanged: "project:pagesChanged";
    readonly FileWrite: "file:write";
    readonly FilePatch: "file:patch";
    readonly FileChanged: "file:changed";
    readonly FileWriteAck: "file:writeAck";
    readonly PageCreate: "page:create";
    readonly PageDelete: "page:delete";
    readonly PageDuplicate: "page:duplicate";
    readonly PageRename: "page:rename";
    readonly ComponentCreate: "component:create";
    readonly ComponentDelete: "component:delete";
    readonly ComponentRead: "component:read";
    readonly ComponentWriteThumbnail: "component:writeThumbnail";
    readonly ComponentReadThumbnail: "component:readThumbnail";
    readonly ProjectWriteThumbnail: "project:writeThumbnail";
    readonly ProjectReadThumbnail: "project:readThumbnail";
    readonly ContextWrite: "context:write";
    readonly ProjectsList: "projects:list";
    readonly RecentProjectsRemove: "recentProjects:remove";
    readonly SettingsGet: "settings:get";
    readonly SettingsSetDefaultFolder: "settings:setDefaultFolder";
    readonly SettingsUpdate: "settings:update";
    readonly AppReinitSentry: "app:reinitSentry";
    readonly AppGetVersion: "app:getVersion";
    readonly ProjectConfigRead: "projectConfig:read";
    readonly ProjectConfigWrite: "projectConfig:write";
    readonly FileCopyImage: "file:copyImage";
    readonly FileChooseImage: "file:chooseImage";
    readonly FileReadText: "file:readText";
    readonly SvgAssetChanged: "svg:assetChanged";
    readonly ClipboardRead: "clipboard:read";
    readonly ClipboardWrite: "clipboard:write";
    readonly ClipboardSaveImage: "clipboard:saveImage";
    readonly AuthStart: "auth:start";
    readonly AuthCancel: "auth:cancel";
    readonly AuthStatus: "auth:status";
    readonly AuthSignOut: "auth:signout";
    /** Broadcast to every window when the signed-in state changes. */
    readonly AuthComplete: "auth:complete";
    readonly AgentKeySet: "agent:key-set";
    readonly AgentKeyStatus: "agent:key-status";
    readonly AgentKeyClear: "agent:key-clear";
    readonly ThemeRead: "theme:read";
    readonly ThemeChanged: "theme:changed";
    readonly ThemeWrite: "theme:write";
    readonly WindowSetTitleBarOverlay: "window:setTitleBarOverlay";
    readonly DesignMdRead: "designMd:read";
    readonly DesignMdWrite: "designMd:write";
    readonly DesignMdChanged: "designMd:changed";
    readonly RoutesList: "routes:list";
    readonly RoutesRead: "routes:read";
    readonly RoutesSetRender: "routes:setRender";
    readonly RoutesWrite: "routes:write";
    readonly RoutesRenameView: "routes:renameView";
    readonly DevVarsRead: "devVars:read";
    readonly DevVarsOpen: "devVars:open";
    /** main → renderer: a request or error line from `scamp dev --json`. */
    readonly DevServerLog: "preview:devLog";
    /** main → renderer: a file under routes/ was added, changed, or removed. */
    readonly RoutesChanged: "routes:changed";
    readonly ImportOpen: "import:open";
    /** Download one remote image into the project's assets. */
    readonly ImportFetchImage: "import:fetchImage";
    /** Which of these families does Google Fonts serve? */
    readonly ImportResolveFonts: "import:resolveFonts";
    readonly ImportClose: "import:close";
    /** App window → main: keep this page's original beside the view. */
    readonly ImportSaveSource: "import:saveSource";
    /** Import window → main: a captured page. */
    readonly ImportCaptured: "import:captured";
    /** Main → app window: reduce this and make a view of it. */
    readonly ImportDeliver: "import:deliver";
    /** App window → main: how the import went, for the import window's UI. */
    readonly ImportResultReport: "import:result";
    /** Main → import window: the app window's verdict. */
    readonly ImportResultChanged: "import:resultChanged";
    readonly PreviewOpen: "preview:open";
    readonly PreviewStop: "preview:stop";
    readonly PreviewClose: "preview:close";
    readonly PreviewGetStatus: "preview:getStatus";
    readonly PreviewStatusChanged: "preview:statusChanged";
    readonly PreviewNavigate: "preview:navigate";
    /**
     * Renderer → main: push an updated page list / active page to an
     * already-open preview window. No-op when no preview is open for
     * the project (won't spawn one). Used so the dropdown stays
     * accurate when the user creates / renames / deletes a page in the
     * canvas while preview is open.
     */
    readonly PreviewUpdate: "preview:update";
    readonly PreviewRestart: "preview:restart";
    readonly TerminalCreate: "terminal:create";
    readonly TerminalWrite: "terminal:write";
    readonly TerminalResize: "terminal:resize";
    readonly TerminalKill: "terminal:kill";
    readonly TerminalData: "terminal:data";
    readonly TerminalExit: "terminal:exit";
    readonly TerminalForegroundProcess: "terminal:foregroundProcess";
    readonly SnapshotCreate: "snapshot:create";
    readonly SnapshotList: "snapshot:list";
    readonly SnapshotRestore: "snapshot:restore";
    readonly SnapshotDelete: "snapshot:delete";
    readonly SnapshotReadPage: "snapshot:read-page";
    readonly ExportChooseSavePath: "export:chooseSavePath";
    readonly ExportPng: "export:png";
    readonly ExportSvg: "export:svg";
    readonly ExportHtmlChooseFolder: "exportHtml:chooseFolder";
    readonly ExportHtmlWrite: "exportHtml:write";
    readonly UpdaterChecking: "updater:checking";
    readonly UpdaterAvailable: "updater:available";
    readonly UpdaterNotAvailable: "updater:not-available";
    readonly UpdaterProgress: "updater:progress";
    readonly UpdaterDownloaded: "updater:downloaded";
    readonly UpdaterError: "updater:error";
    readonly UpdaterInstallNow: "updater:install-now";
    readonly McpQuery: "mcp:query";
    readonly McpQueryResult: "mcp:query-result";
    readonly McpStatus: "mcp:status";
    readonly TestGetBootstrap: "test:getBootstrap";
};
export type IpcChannel = (typeof IPC)[keyof typeof IPC];
