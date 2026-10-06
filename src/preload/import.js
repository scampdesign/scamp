import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipcChannels';
/**
 * Preload for the import window.
 *
 * Deliberately tiny, and deliberately without a file-system or project
 * API: this window hosts a third-party page in a `<webview>`, so its
 * renderer is the least trusted in the app. It can say "here is a page
 * I captured" and nothing else.
 * see docs/plans/website-import-plan.md
 */
const importApi = {
    /** The project and starting URL, sent once the window is up. */
    onOpen: (listener) => {
        const handler = (_e, args) => listener(args);
        ipcRenderer.on(IPC.ImportOpen, handler);
        return () => ipcRenderer.removeListener(IPC.ImportOpen, handler);
    },
    /** What the app window made of the last capture. */
    onResult: (listener) => {
        const handler = (_e, p) => listener(p);
        ipcRenderer.on(IPC.ImportResultChanged, handler);
        return () => ipcRenderer.removeListener(IPC.ImportResultChanged, handler);
    },
    /** Hand a captured page, and its narrower readings, to the app window. */
    deliver: (projectPath, payload, narrower, nameHint) => ipcRenderer.invoke(IPC.ImportCaptured, {
        projectPath,
        payload,
        narrower,
        ...(nameHint !== undefined ? { nameHint } : {}),
    }),
    /**
     * Ask the app window to start an AI cleanup of the view just imported.
     * A view name and a mode, and nothing else; main checks both.
     */
    startCleanup: (projectPath, viewName, tokenMode) => ipcRenderer.invoke(IPC.ImportStartCleanup, { projectPath, viewName, tokenMode }),
    close: (projectPath) => ipcRenderer.invoke(IPC.ImportClose, { projectPath }),
};
contextBridge.exposeInMainWorld('scampImport', importApi);
