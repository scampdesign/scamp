import { app, ipcMain, safeStorage, shell, BrowserWindow } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { cancelSignIn, currentAuthToken, getStatus, signIn, signOut, } from '../auth/authService';
import { authBaseUrl } from '../auth/desktopAuthFlow';
import { sendHeartbeat, startHeartbeat } from '../auth/heartbeat';
import { E2E_USER, readE2eSeams } from '../e2eSeams';
/**
 * Sign-in handlers.
 *
 * The token never crosses this boundary. The renderer asks for a sign-in
 * and receives an identity; the credential itself stays in the main
 * process, which is also where authenticated requests will be made from.
 * see docs/plans/electron-sign-in-plan.md
 */
const deps = () => ({
    openExternal: async (url) => {
        await shell.openExternal(url);
    },
    // Node's fetch. The exchange sets an explicit `origin` because this has
    // none, unlike a browser request.
    fetchImpl: async (url, init) => {
        const res = await fetch(url, init);
        return { ok: res.ok, status: res.status, text: () => res.text() };
    },
    safeStorage,
    userDataDir: app.getPath('userData'),
    isPackaged: app.isPackaged,
});
/**
 * Activity reporting. Without it the app is invisible to the product's
 * active-user numbers: it talks to the API at sign-in and then, until
 * cloud sync ships, essentially never again.
 * see docs/notes/desktop-heartbeat.md
 */
const heartbeatDeps = () => {
    const base = deps();
    return {
        baseUrl: authBaseUrl(process.env, app.isPackaged),
        fetchImpl: base.fetchImpl,
        token: currentAuthToken,
        onUnauthorized: async () => {
            // The session is gone. Drop it locally rather than let the UI keep
            // saying the user is signed in until they restart.
            await signOut(base);
            broadcast(IPC.AuthComplete, { signedIn: false });
        },
    };
};
let stopHeartbeat = null;
/** Tell every window, so a second window reflects the change too. */
const broadcast = (channel, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(channel, payload);
    }
};
export const registerAuthIpc = () => {
    // Load any stored token, then beat once for the launch. `getStatus` is
    // the only thing that reads the token off disk, and it makes no network
    // call of its own — a signed-out launch still costs nothing.
    void (async () => {
        await getStatus(deps());
        stopHeartbeat = startHeartbeat(heartbeatDeps());
    })();
    ipcMain.handle(IPC.AuthStart, async () => {
        const outcome = await signIn(deps());
        if (outcome.status === 'signed-in') {
            broadcast(IPC.AuthComplete, { signedIn: true, user: outcome.user });
            // Count the sign-in itself, rather than waiting up to four hours for
            // a new user to register as having used the app at all.
            void sendHeartbeat(heartbeatDeps());
        }
        return outcome;
    });
    ipcMain.handle(IPC.AuthCancel, async () => cancelSignIn());
    ipcMain.handle(IPC.AuthStatus, async () => readE2eSeams(process.env, app.isPackaged).signedIn
        ? { signedIn: true, user: { ...E2E_USER } }
        : getStatus(deps()));
    ipcMain.handle(IPC.AuthSignOut, async () => {
        await signOut(deps());
        broadcast(IPC.AuthComplete, { signedIn: false });
    });
};
/** Stop the repeat at shutdown. The timer is unref'ed, so this is tidiness
 *  rather than a requirement for the process to exit. */
export const disposeAuth = () => {
    stopHeartbeat?.();
    stopHeartbeat = null;
};
