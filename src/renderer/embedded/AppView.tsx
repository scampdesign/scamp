import { useEffect, useRef } from 'react';

import { useEmbeddedStore } from './embeddedStore';
import { attachWebview, handleConsoleLine, installInPage } from './session';
import styles from './AppView.module.css';

type WebviewNode = HTMLElement & { executeJavaScript: (code: string) => Promise<unknown> };

/** The project's running app, in a webview of its own session. */
export const AppView = (): JSX.Element => {
  const url = useEmbeddedStore((s) => s.url);
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
    <div className={styles.view}>
      <webview ref={ref} src={url} className={styles.webview} partition="persist:scamp-embedded" data-testid="embedded-webview" />
    </div>
  );
};
