import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { errorMessage } from '@shared/errorMessage';
import styles from './TerminalView.module.css';
/**
 * One xterm.js terminal bound to a node-pty process in the main process.
 *
 * Lifecycle:
 *  - On mount: spin up xterm + ask main to spawn a pty in the project cwd.
 *  - User keystrokes → ipc write → pty stdin.
 *  - Pty stdout → ipc data event → xterm.write.
 *  - Container resize → fit addon → ipc resize → pty resize.
 *  - On unmount: kill the pty and dispose xterm.
 */
export const TerminalView = ({ cwd, onExit, api = window.scamp, onReady }) => {
    const containerRef = useRef(null);
    const termRef = useRef(null);
    const fitRef = useRef(null);
    const ptyIdRef = useRef(null);
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container)
            return;
        const term = new Terminal({
            cursorBlink: true,
            fontFamily: "'Ubuntu Mono', monospace",
            fontSize: 13,
            theme: {
                background: '#0f0f0f',
                foreground: '#e6e6e6',
                cursor: '#3b82f6',
            },
            allowProposedApi: true,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(container);
        fit.fit();
        termRef.current = term;
        fitRef.current = fit;
        let disposed = false;
        let offData = null;
        let offExit = null;
        const setup = async () => {
            const { id } = await api.createTerminal({
                cwd,
                cols: term.cols,
                rows: term.rows,
            });
            if (disposed) {
                void api.killTerminal({ id });
                return;
            }
            ptyIdRef.current = id;
            offData = api.onTerminalData((payload) => {
                if (payload.id !== id)
                    return;
                term.write(payload.data);
            });
            offExit = api.onTerminalExit((payload) => {
                if (payload.id !== id)
                    return;
                term.write('\r\n[process exited]\r\n');
                onExit?.(id);
            });
            term.onData((data) => {
                void api.writeTerminal({ id, data });
            });
            term.onResize(({ cols, rows }) => {
                void api.resizeTerminal({ id, cols, rows });
            });
            onReady?.((data) => void api.writeTerminal({ id, data }));
        };
        // Surface setup failures inside the terminal itself instead of letting
        // them disappear into an unhandled-rejection log. The most common cause
        // is hitting `MAX_TERMINALS` in src/main/ipc/terminal.ts after orphaned
        // ptys have piled up across HMR cycles — the user just sees a blinking
        // cursor with no prompt and no clue why. Writing the error directly
        // into the xterm tells them what to do (reload).
        setup().catch((err) => {
            const message = errorMessage(err);
            term.write(`\r\n\x1b[31mTerminal failed to start:\x1b[0m ${message}\r\n`);
            term.write('\x1b[2mTry reloading the window (Ctrl+R) to clear orphaned shells.\x1b[0m\r\n');
        });
        const handleResize = () => {
            try {
                fit.fit();
            }
            catch {
                // xterm throws if not yet attached or if the container has zero size.
            }
        };
        const ro = new ResizeObserver(handleResize);
        ro.observe(container);
        return () => {
            disposed = true;
            ro.disconnect();
            offData?.();
            offExit?.();
            const id = ptyIdRef.current;
            if (id) {
                void api.killTerminal({ id });
            }
            term.dispose();
            termRef.current = null;
            fitRef.current = null;
        };
        // We deliberately re-create the terminal when cwd changes — the project
        // root is the entire reason this component exists.
    }, [cwd, onExit, api, onReady]);
    // Refit when the container becomes visible (e.g. panel toggled).
    useEffect(() => {
        const t = setTimeout(() => {
            try {
                fitRef.current?.fit();
            }
            catch {
                // ignore
            }
        }, 0);
        return () => clearTimeout(t);
    });
    return _jsx("div", { ref: containerRef, className: styles.terminal });
};
