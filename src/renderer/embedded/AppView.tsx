import { useEffect, useRef } from 'react';

import { useEmbeddedStore } from './embeddedStore';
import { attachWebview, handleConsoleLine, installInPage } from './session';
import styles from './AppView.module.css';

type WebviewNode = HTMLElement & { executeJavaScript: (code: string) => Promise<unknown> };

/** A short stable id for a folder, for its own sign-in storage. */
const folderKey = (folder: string): string => {
  let h = 5381;
  for (let i = 0; i < folder.length; i += 1) h = (h * 33) ^ folder.charCodeAt(i);
  return (h >>> 0).toString(36);
};

/** The project's running app, in a webview of its own session. */
export const AppView = (): JSX.Element => {
  const url = useEmbeddedStore((s) => s.url);
  // Cookies aren't kept apart by port, so two attached apps on localhost would sign each other out.
  const partition = useEmbeddedStore((s) =>
    s.preflight?.attachUrl == null ? 'persist:scamp-embedded' : `persist:scamp-attach-${folderKey(s.preflight.folder)}`
  );
  const viewport = useEmbeddedStore((s) => s.viewport);
  const set = useEmbeddedStore((s) => s.set);
  const ref = useRef<HTMLWebViewElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    attachWebview(node as unknown as WebviewNode);
    const handleDomReady = (): void => {
      void installInPage();
    };
    const handleConsole = (e: Event): void => {
      const message = (e as Event & { message?: unknown }).message;
      if (typeof message === 'string') handleConsoleLine(message);
    };
    const handleNavigate = (e: Event): void => {
      const landed = (e as Event & { url?: unknown }).url;
      if (typeof landed === 'string') set({ pageUrl: landed });
    };
    node.addEventListener('dom-ready', handleDomReady);
    node.addEventListener('console-message', handleConsole);
    node.addEventListener('did-navigate', handleNavigate);
    node.addEventListener('did-navigate-in-page', handleNavigate);
    return () => {
      node.removeEventListener('dom-ready', handleDomReady);
      node.removeEventListener('console-message', handleConsole);
      node.removeEventListener('did-navigate', handleNavigate);
      node.removeEventListener('did-navigate-in-page', handleNavigate);
      attachWebview(null);
    };
  }, [url, set]);

  if (url === null) return <div className={styles.view} />;
  return (
    <div className={styles.view} data-sized={viewport !== null}>
      <webview
        ref={ref}
        src={url}
        className={styles.webview}
        // A set width sizes the app like a device; desktop fills the window.
        style={viewport === null ? undefined : { flex: 'none', width: `${viewport}px` }}
        data-sized={viewport !== null}
        partition={partition}
        data-testid="embedded-webview"
      />
    </div>
  );
};
