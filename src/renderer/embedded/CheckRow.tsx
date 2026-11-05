import { useState } from 'react';

import type { EmbeddedCheck } from '@shared/types';

import styles from './CheckRow.module.css';

type Props = {
  check: EmbeddedCheck;
  /** Run a fix the check offers, then check again. */
  onFix: (fix: NonNullable<EmbeddedCheck['fix']>, value?: string) => Promise<void>;
};

const MARK: Record<EmbeddedCheck['status'], string> = { pass: '✓', warn: '!', fail: '✕', action: '→' };

/** One line of the setup screen: what Scamp checked, and a fix when it has one. */
export const CheckRow = ({ check, onFix }: Props): JSX.Element => {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  const handleFix = async (value?: string): Promise<void> => {
    if (check.fix === undefined) return;
    setBusy(true);
    await onFix(check.fix, value);
    setBusy(false);
  };

  return (
    <li className={styles.row} data-status={check.status} data-check={check.id}>
      <span className={styles.mark} aria-hidden="true">{MARK[check.status]}</span>
      <div className={styles.body}>
        <div className={styles.label}>{check.label}</div>
        <div className={styles.detail}>{check.detail}</div>
        {check.fix === 'git-init' && (
          <button type="button" className={styles.fix} disabled={busy} onClick={() => void handleFix()}>
            Initialize git
          </button>
        )}
        {check.fix === 'sign-in' && (
          <button type="button" className={styles.fix} disabled={busy} onClick={() => void handleFix()}>
            Sign in
          </button>
        )}
        {check.fix === 'connect-agent' && (
          <form
            className={styles.keyForm}
            onSubmit={(e) => {
              e.preventDefault();
              void handleFix(key);
            }}
          >
            <input
              className={styles.keyInput}
              type="password"
              placeholder="sk-ant-…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              aria-label="Anthropic API key"
            />
            <button type="submit" className={styles.fix} disabled={busy || key.trim().length === 0}>
              Connect
            </button>
          </form>
        )}
      </div>
    </li>
  );
};
