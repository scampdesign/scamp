import { useEffect, useRef, useState } from 'react';

import { projectNameFrom } from '@shared/projectName';
import type { ProjectData, ReactImportInspectResult } from '@shared/types';

import { useDialogBackdrop } from '../../hooks/useDialogBackdrop';
import { Button } from '../controls/Button';
import dialogStyles from '../ConfirmDialog.module.css';
import styles from './ReactImportDialog.module.css';

type Props = {
  projectPath: string;
  /** This project's name, for the choice of where pages land. */
  projectName: string;
  /**
   * Open the import window on the running app — in a new project when
   * `newProject` is given, which the caller switches to first.
   */
  onReady: (url: string, appName: string, newProject?: ProjectData) => void;
  onClose: () => void;
};

type Target = 'new' | 'current';

/** Create the project, taking the next free name if the folder exists. */
const createFreshProject = async (parentPath: string, base: string): Promise<ProjectData> => {
  for (let n = 1; n < 50; n += 1) {
    const name = n === 1 ? base : `${base.slice(0, 60)}-${n}`;
    try {
      return await window.scamp.createProject({ parentPath, name });
    } catch (err) {
      if (!(err instanceof Error && err.message.includes('already exists'))) throw err;
    }
  }
  throw new Error(`Every name from ${base} to ${base}-49 is taken in ${parentPath}.`);
};

type Step =
  | { kind: 'choose'; error?: string }
  | { kind: 'confirm'; app: Extract<ReactImportInspectResult, { kind: 'ok' }> }
  | { kind: 'starting'; app: Extract<ReactImportInspectResult, { kind: 'ok' }>; phase: 'installing' | 'starting' }
  | { kind: 'failed'; app: Extract<ReactImportInspectResult, { kind: 'ok' }>; error: string };

/** Lines of the dev server's output kept for the dialog. */
const LOG_LINES = 8;

/** An address the import window can open, or null. */
const asAppUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

/**
 * Import a React app: choose its folder and let Scamp run its dev server,
 * or give the address of one already running. Nothing runs until the
 * user has seen the exact commands and said yes.
 * see docs/plans/react-import-plan.md
 */
export const ReactImportDialog = ({ projectPath, projectName, onReady, onClose }: Props): JSX.Element => {
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  /** Where new projects go; null when none is set, which leaves only this project. */
  const [projectsFolder, setProjectsFolder] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>('current');
  /** A project already made for this import, reused if the server needs another try. */
  const created = useRef<ProjectData | null>(null);

  useEffect(() => {
    void window.scamp.getSettings().then((settings) => {
      setProjectsFolder(settings.defaultProjectsFolder);
      // A React app's own tokens and pages shouldn't land among another
      // design's, so a new project is the default when one can be made.
      if (settings.defaultProjectsFolder !== null) setTarget('new');
    });
  }, []);
  const [address, setAddress] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const starting = step.kind === 'starting';
  useDialogBackdrop({ onClose: starting ? () => {} : onClose });

  useEffect(
    () =>
      window.scamp.onReactImportProgress((event) => {
        if (event.kind === 'phase') {
          setStep((s) => (s.kind === 'starting' ? { ...s, phase: event.phase } : s));
          return;
        }
        const lines = event.text.split(/\r?\n/).filter((line) => line.trim().length > 0);
        setLog((prev) => [...prev, ...lines].slice(-LOG_LINES));
      }),
    []
  );

  const handleChoose = async (): Promise<void> => {
    const result = await window.scamp.reactImportInspect();
    if (result.kind === 'cancelled') return;
    if (result.kind === 'unsupported') {
      setStep({ kind: 'choose', error: result.reason });
      return;
    }
    setStep({ kind: 'confirm', app: result });
  };

  const handleRun = async (app: Extract<ReactImportInspectResult, { kind: 'ok' }>): Promise<void> => {
    setLog([]);
    setStep({ kind: 'starting', app, phase: app.installCommand !== null ? 'installing' : 'starting' });
    let fresh: ProjectData | undefined;
    if (target === 'new' && projectsFolder !== null) {
      try {
        fresh = created.current ?? (await createFreshProject(projectsFolder, projectNameFrom(app.name)));
        created.current = fresh;
      } catch (err) {
        setStep({ kind: 'failed', app, error: err instanceof Error ? err.message : String(err) });
        return;
      }
    }
    const result = await window.scamp.reactImportStart({ projectPath: fresh?.path ?? projectPath, folder: app.folder });
    if (result.ok) onReady(result.url, app.name, fresh);
    else setStep({ kind: 'failed', app, error: result.error });
  };

  const url = asAppUrl(address);
  const handleOpenAddress = (): void => {
    if (url === null) return;
    onReady(url, new URL(url).host);
  };

  return (
    <div className={dialogStyles.backdrop} onClick={starting ? undefined : onClose}>
      <div
        className={`${dialogStyles.dialog} ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="react-import-title"
        data-testid="react-import-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="react-import-title" className={dialogStyles.title}>
          Import a React app
        </h2>

        {step.kind === 'choose' && (
          <>
            <p className={dialogStyles.message}>
              Choose the app’s project folder. Scamp runs its dev server, lists its pages, and imports the ones you
              pick as views.
            </p>
            {step.error !== undefined && <p className={dialogStyles.error}>{step.error}</p>}
            <div className={styles.row}>
              <Button variant="primary" onClick={() => void handleChoose()}>
                Choose folder…
              </Button>
            </div>
            <p className={styles.or}>Or, if it’s already running, enter its address:</p>
            <form
              className={styles.row}
              onSubmit={(e) => {
                e.preventDefault();
                handleOpenAddress();
              }}
            >
              <input
                className={styles.address}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="http://localhost:5173"
                spellCheck={false}
                aria-label="Running app address"
              />
              <Button type="submit" disabled={url === null}>
                Open
              </Button>
            </form>
          </>
        )}

        {step.kind === 'confirm' && (
          <>
            <p className={dialogStyles.message}>
              <strong>{step.app.name}</strong> is a {step.app.framework} app. To show its pages, Scamp runs
              {step.app.installCommand !== null ? ' these commands' : ' this command'} in{' '}
              <code className={styles.code}>{step.app.folder}</code>:
            </p>
            <ul className={styles.commands}>
              {step.app.installCommand !== null && (
                <li>
                  <code className={styles.code}>{step.app.installCommand}</code>
                </li>
              )}
              <li>
                <code className={styles.code}>{step.app.devCommand}</code>
              </li>
            </ul>
            <p className={styles.note}>
              This runs the project’s own code on your computer. Scamp stops the server when you close the import
              window.
            </p>
            <fieldset className={styles.target}>
              <legend className={styles.targetLegend}>Import the pages into</legend>
              <label className={styles.targetOption}>
                <input
                  type="radio"
                  name="react-import-target"
                  checked={target === 'new'}
                  onChange={() => setTarget('new')}
                  disabled={projectsFolder === null}
                />
                <span>
                  A new project, <code className={styles.code}>{projectNameFrom(step.app.name)}</code>
                  {projectsFolder === null && (
                    <span className={styles.targetHint}> — set a default projects folder in Settings first</span>
                  )}
                </span>
              </label>
              <label className={styles.targetOption}>
                <input
                  type="radio"
                  name="react-import-target"
                  checked={target === 'current'}
                  onChange={() => setTarget('current')}
                />
                <span>
                  This project, <code className={styles.code}>{projectName}</code>
                </span>
              </label>
            </fieldset>
            <div className={dialogStyles.actions}>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void handleRun(step.app)} autoFocus>
                Run and import
              </Button>
            </div>
          </>
        )}

        {(step.kind === 'starting' || step.kind === 'failed') && (
          <>
            <p className={dialogStyles.message} role="status">
              {step.kind === 'failed'
                ? `${step.app.name} didn’t start.`
                : step.phase === 'installing'
                  ? `Installing ${step.app.name}’s dependencies…`
                  : `Starting ${step.app.name}…`}
            </p>
            {step.kind === 'failed' && <p className={dialogStyles.error}>{step.error}</p>}
            {log.length > 0 && (
              <pre className={styles.log} data-testid="react-import-log">
                {log.join('\n')}
              </pre>
            )}
            {step.kind === 'failed' && (
              <div className={dialogStyles.actions}>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
                <Button variant="primary" onClick={() => void handleRun(step.app)}>
                  Try again
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
