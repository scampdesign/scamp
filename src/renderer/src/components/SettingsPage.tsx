import { useCallback, useEffect, useState } from 'react';
import { IconMoon, IconSun } from '@tabler/icons-react';
import type { AppTheme, ProjectData, Settings } from '@shared/types';
import { errorMessage } from '@shared/errorMessage';
import { useOnboardingStore } from '@store/onboardingSlice';
import { applyAppTheme } from '../lib/applyAppTheme';
import { startTutorial } from '../lib/startTutorial';
import { AiProviderSection } from './AiProviderSection';
import { SegmentedControl } from './controls/SegmentedControl';
import { Tooltip } from './controls/Tooltip';
import styles from './SettingsPage.module.css';

type Props = {
  onBack: () => void;
  /** Open a project made here: the tutorial's. */
  onProjectOpened: (project: ProjectData) => void;
};

export const SettingsPage = ({ onBack, onProjectOpened }: Props): JSX.Element => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [tutorialError, setTutorialError] = useState<string | null>(null);
  const learnHidden = useOnboardingStore((s) => s.hidden);
  const setLearnHidden = useOnboardingStore((s) => s.setHidden);

  const refresh = useCallback(async (): Promise<void> => {
    const next = await window.scamp.getSettings();
    setSettings(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void window.scamp.getAppVersion().then(setVersion);
  }, []);

  const handlePickFolder = async (): Promise<void> => {
    const result = await window.scamp.chooseFolder();
    if (result.canceled || !result.path) return;
    const next = await window.scamp.setDefaultProjectsFolder(result.path);
    setSettings(next);
  };

  const handleClearFolder = async (): Promise<void> => {
    const next = await window.scamp.setDefaultProjectsFolder(null);
    setSettings(next);
  };

  const handleThemeChange = async (next: AppTheme): Promise<void> => {
    // Flip the chrome immediately, then persist. applyAppTheme also
    // refreshes the localStorage mirror so the next launch paints right.
    applyAppTheme(next);
    const updated = await window.scamp.updateSettings({ theme: next });
    setSettings(updated);
  };

  const handleSentryToggle = async (optedIn: boolean): Promise<void> => {
    // Persist the new choice and signal main to re-init or tear
    // down Sentry so the change takes effect this session — no
    // restart needed.
    const next = await window.scamp.updateSettings({ sentryOptIn: optedIn });
    await window.scamp.reinitSentry(optedIn);
    setSettings(next);
  };

  const handleStartTutorial = async (folder: string): Promise<void> => {
    setTutorialError(null);
    try {
      onProjectOpened(await startTutorial(folder));
    } catch (e) {
      setTutorialError(errorMessage(e));
    }
  };

  if (!settings) return <div className={styles.page} />;
  const folder = settings.defaultProjectsFolder;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack} type="button">
          ← Back
        </button>
        <h1 className={styles.headerTitle}>Settings</h1>
      </div>

      <div className={styles.body}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>General</h2>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Default folder</span>
            <div className={styles.rowControl}>
              {settings.defaultProjectsFolder ? (
                <Tooltip label={settings.defaultProjectsFolder}>
                  <span className={styles.folderPath}>
                    {settings.defaultProjectsFolder}
                  </span>
                </Tooltip>
              ) : (
                <span className={styles.folderNone}>Not set</span>
              )}
              <button
                className={styles.smallButton}
                onClick={handlePickFolder}
                type="button"
              >
                {settings.defaultProjectsFolder ? 'Change' : 'Choose'}
              </button>
              {settings.defaultProjectsFolder && (
                <button
                  className={styles.smallButton}
                  onClick={handleClearFolder}
                  type="button"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={styles.section} data-testid="settings-tutorial">
          <h2 className={styles.sectionTitle}>Tutorial</h2>
          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <div>Learn the basics</div>
              <div className={styles.rowHint}>
                {folder
                  ? 'Creates a tutorial project in your default folder and walks you through drawing, layout, components, and tokens.'
                  : 'Choose a default folder first. The tutorial creates its project there.'}
              </div>
              {tutorialError && <div className={styles.rowHint}>{tutorialError}</div>}
            </div>
            <div className={styles.rowControl}>
              <button
                className={styles.smallButton}
                type="button"
                disabled={!folder}
                onClick={() => folder && void handleStartTutorial(folder)}
              >
                Start the tutorial
              </button>
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <div>Learn checklist</div>
              <div className={styles.rowHint}>
                Shows your tutorial progress in the sidebar of every project.
              </div>
            </div>
            <div className={styles.rowControl}>
              <button
                type="button"
                className={`${styles.smallButton} ${!learnHidden ? styles.smallButtonActive : ''}`}
                aria-pressed={!learnHidden}
                onClick={() => setLearnHidden(false)}
              >
                Show
              </button>
              <button
                type="button"
                className={`${styles.smallButton} ${learnHidden ? styles.smallButtonActive : ''}`}
                aria-pressed={learnHidden}
                onClick={() => setLearnHidden(true)}
              >
                Hide
              </button>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Appearance</h2>
          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <div>Theme</div>
              <div className={styles.rowHint}>
                Changes Scamp&rsquo;s interface only — your project&rsquo;s
                design is unaffected.
              </div>
            </div>
            <div className={styles.rowControl}>
              <div className={styles.themeToggle}>
                <SegmentedControl<AppTheme>
                  value={settings.theme}
                  options={[
                    {
                      value: 'dark',
                      label: <IconMoon size={16} stroke={1.75} />,
                      ariaLabel: 'Dark',
                      tooltip: 'Dark',
                    },
                    {
                      value: 'light',
                      label: <IconSun size={16} stroke={1.75} />,
                      ariaLabel: 'Light',
                      tooltip: 'Light',
                    },
                  ]}
                  onChange={(next) => void handleThemeChange(next)}
                />
              </div>
            </div>
          </div>
        </div>

        <AiProviderSection />

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Privacy</h2>
          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <div>Send anonymous crash reports and usage counts</div>
              <div className={styles.rowHint}>
                Helps fix bugs faster and shows how many people use
                Scamp. No personal data or project files are ever
                shared — just a random ID for this install.
              </div>
            </div>
            <div className={styles.rowControl}>
              <button
                type="button"
                className={`${styles.smallButton} ${
                  settings.sentryOptIn === true ? styles.smallButtonActive : ''
                }`}
                onClick={() => void handleSentryToggle(true)}
              >
                On
              </button>
              <button
                type="button"
                className={`${styles.smallButton} ${
                  settings.sentryOptIn === false
                    ? styles.smallButtonActive
                    : ''
                }`}
                onClick={() => void handleSentryToggle(false)}
              >
                Off
              </button>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>About</h2>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Version</span>
            <div className={styles.rowControl}>
              <span className={styles.versionValue}>
                {version === null ? '—' : `Scamp ${version}`}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
