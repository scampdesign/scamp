import { useCallback, useEffect, useState } from 'react';

import type { AuthSignInResult, AuthStatusResult, AuthUser } from '@shared/types';

import styles from './AccountPanel.module.css';

/**
 * Sign-in on the start screen, before a project is opened.
 *
 * Deliberately not in the project toolbar as the backlog story describes:
 * signing in is an account-level act, not a per-project one, and the start
 * screen is where a user already is when they are not mid-task.
 *
 * Everything here is optional. Scamp works fully signed out, so this must
 * never block, never prompt on launch, and never imply an account is
 * required. see docs/archive/2026-08-28-electron-sign-in-plan.md
 */

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out'; message?: string }
  | { kind: 'signing-in' }
  | { kind: 'signed-in'; user?: AuthUser; sessionOnly: boolean };

/** First initial for the avatar, falling back to the email. */
const initialFor = (user: AuthUser | undefined): string => {
  const source = user?.name?.trim() || user?.email?.trim() || '';
  return source.charAt(0).toUpperCase() || '·';
};

export const AccountPanel = (): JSX.Element => {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const applyStatus = useCallback((status: AuthStatusResult): void => {
    setState(
      status.signedIn
        ? { kind: 'signed-in', user: status.user, sessionOnly: false }
        : { kind: 'signed-out' }
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.scamp.authStatus().then((status) => {
      if (!cancelled) applyStatus(status);
    });
    // Another window signing in or out should update this one too.
    const off = window.scamp.onAuthChanged(applyStatus);
    return () => {
      cancelled = true;
      off();
    };
  }, [applyStatus]);

  const handleSignIn = async (): Promise<void> => {
    setState({ kind: 'signing-in' });
    // Anything that escapes the main-side handler rejects this invoke, and
    // an unhandled rejection here would leave the button reading "Waiting
    // for browser…" forever with nothing left to wait for.
    const result = await window.scamp.authSignIn().catch(
      (err: unknown): AuthSignInResult => ({
        status: 'failed',
        message: err instanceof Error ? err.message : 'Sign-in failed. Try again.',
      })
    );
    if (result.status === 'signed-in') {
      setState({
        kind: 'signed-in',
        user: result.user,
        // The OS could not encrypt, so this session will not survive a
        // restart. Said plainly rather than silently forgotten.
        sessionOnly: !result.persisted,
      });
      return;
    }
    if (result.status === 'cancelled') {
      setState({ kind: 'signed-out' });
      return;
    }
    setState({
      kind: 'signed-out',
      message:
        result.status === 'timeout'
          ? 'Sign-in timed out. Try again when you are ready.'
          : result.message,
    });
  };

  /**
   * Abandon a sign-in in flight. Without this the only way out of
   * "waiting for browser" is the 15-minute timeout — which is what
   * happened when a dev build opened the live site, where the desktop
   * endpoints do not exist and no callback was ever coming.
   */
  const handleCancel = async (): Promise<void> => {
    await window.scamp.authCancelSignIn();
    setState({ kind: 'signed-out' });
  };

  const handleSignOut = async (): Promise<void> => {
    await window.scamp.authSignOut();
    setState({ kind: 'signed-out' });
  };

  if (state.kind === 'loading') return <div className={styles.panel} />;

  if (state.kind === 'signed-in') {
    return (
      <div className={styles.panel} data-testid="account-panel">
        <div className={styles.identity}>
          <span className={styles.avatar} aria-hidden="true">
            {initialFor(state.user)}
          </span>
          <span className={styles.details}>
            <span className={styles.name}>{state.user?.name || 'Signed in'}</span>
            {state.user?.email !== undefined && (
              <span className={styles.email}>{state.user.email}</span>
            )}
          </span>
        </div>
        {state.sessionOnly && (
          <p className={styles.note}>
            This device can’t store your sign-in securely, so you’ll need to
            sign in again next time you open Scamp.
          </p>
        )}
        <button
          className={styles.link}
          onClick={handleSignOut}
          type="button"
          data-testid="sign-out-button"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className={styles.panel} data-testid="account-panel">
      <button
        className={styles.signIn}
        onClick={handleSignIn}
        type="button"
        disabled={state.kind === 'signing-in'}
        data-testid="sign-in-button"
      >
        {state.kind === 'signing-in' ? 'Waiting for browser…' : 'Sign in'}
      </button>
      {state.kind === 'signing-in' && (
        <>
          <p className={styles.note}>Finish signing in in your browser.</p>
          <button className={styles.link} onClick={handleCancel} type="button">
            Cancel
          </button>
        </>
      )}
      {state.kind === 'signed-out' && state.message !== undefined && (
        <p className={styles.error} role="status">
          {state.message}
        </p>
      )}
    </div>
  );
};
