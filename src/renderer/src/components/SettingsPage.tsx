import { useCallback, useEffect, useState } from 'react';
import { IconMoon, IconSun } from '@tabler/icons-react';
import type { AppTheme, Settings } from '@shared/types';
import { applyAppTheme } from '../lib/applyAppTheme';
import { AiProviderSection } from './AiProviderSection';
import { SegmentedControl } from './controls/SegmentedControl';
import { Tooltip } from './controls/Tooltip';
import styles from './SettingsPage.module.css';

type Props = {
  onBack: () => void;
};

export const SettingsPage = ({ onBack }: Props): JSX.Element => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [version, setVersion] = useState<string | null>(null);

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

  if (!settings) return <div className={styles.page} />;

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
