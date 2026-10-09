import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { applyAppTheme } from '../lib/applyAppTheme';
import { AiProviderSection } from './AiProviderSection';
import { SegmentedControl } from './controls/SegmentedControl';
import { Tooltip } from './controls/Tooltip';
import styles from './SettingsPage.module.css';
export const SettingsPage = ({ onBack }) => {
    const [settings, setSettings] = useState(null);
    const [version, setVersion] = useState(null);
    const refresh = useCallback(async () => {
        const next = await window.scamp.getSettings();
        setSettings(next);
    }, []);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    useEffect(() => {
        void window.scamp.getAppVersion().then(setVersion);
    }, []);
    const handlePickFolder = async () => {
        const result = await window.scamp.chooseFolder();
        if (result.canceled || !result.path)
            return;
        const next = await window.scamp.setDefaultProjectsFolder(result.path);
        setSettings(next);
    };
    const handleClearFolder = async () => {
        const next = await window.scamp.setDefaultProjectsFolder(null);
        setSettings(next);
    };
    const handleThemeChange = async (next) => {
        // Flip the chrome immediately, then persist. applyAppTheme also
        // refreshes the localStorage mirror so the next launch paints right.
        applyAppTheme(next);
        const updated = await window.scamp.updateSettings({ theme: next });
        setSettings(updated);
    };
    const handleSentryToggle = async (optedIn) => {
        // Persist the new choice and signal main to re-init or tear
        // down Sentry so the change takes effect this session — no
        // restart needed.
        const next = await window.scamp.updateSettings({ sentryOptIn: optedIn });
        await window.scamp.reinitSentry(optedIn);
        setSettings(next);
    };
    if (!settings)
        return _jsx("div", { className: styles.page });
    return (_jsxs("div", { className: styles.page, children: [_jsxs("div", { className: styles.header, children: [_jsx("button", { className: styles.backButton, onClick: onBack, type: "button", children: "\u2190 Back" }), _jsx("h1", { className: styles.headerTitle, children: "Settings" })] }), _jsxs("div", { className: styles.body, children: [_jsxs("div", { className: styles.section, children: [_jsx("h2", { className: styles.sectionTitle, children: "General" }), _jsxs("div", { className: styles.row, children: [_jsx("span", { className: styles.rowLabel, children: "Default folder" }), _jsxs("div", { className: styles.rowControl, children: [settings.defaultProjectsFolder ? (_jsx(Tooltip, { label: settings.defaultProjectsFolder, children: _jsx("span", { className: styles.folderPath, children: settings.defaultProjectsFolder }) })) : (_jsx("span", { className: styles.folderNone, children: "Not set" })), _jsx("button", { className: styles.smallButton, onClick: handlePickFolder, type: "button", children: settings.defaultProjectsFolder ? 'Change' : 'Choose' }), settings.defaultProjectsFolder && (_jsx("button", { className: styles.smallButton, onClick: handleClearFolder, type: "button", children: "Clear" }))] })] })] }), _jsxs("div", { className: styles.section, children: [_jsx("h2", { className: styles.sectionTitle, children: "Appearance" }), _jsxs("div", { className: styles.row, children: [_jsxs("div", { className: styles.rowLabel, children: [_jsx("div", { children: "Theme" }), _jsx("div", { className: styles.rowHint, children: "Changes Scamp\u2019s interface only \u2014 your project\u2019s design is unaffected." })] }), _jsx("div", { className: styles.rowControl, children: _jsx("div", { className: styles.themeToggle, children: _jsx(SegmentedControl, { value: settings.theme, options: [
                                                    {
                                                        value: 'dark',
                                                        label: _jsx(IconMoon, { size: 16, stroke: 1.75 }),
                                                        ariaLabel: 'Dark',
                                                        tooltip: 'Dark',
                                                    },
                                                    {
                                                        value: 'light',
                                                        label: _jsx(IconSun, { size: 16, stroke: 1.75 }),
                                                        ariaLabel: 'Light',
                                                        tooltip: 'Light',
                                                    },
                                                ], onChange: (next) => void handleThemeChange(next) }) }) })] })] }), _jsx(AiProviderSection, {}), _jsxs("div", { className: styles.section, children: [_jsx("h2", { className: styles.sectionTitle, children: "Privacy" }), _jsxs("div", { className: styles.row, children: [_jsxs("div", { className: styles.rowLabel, children: [_jsx("div", { children: "Send anonymous crash reports and usage counts" }), _jsx("div", { className: styles.rowHint, children: "Helps fix bugs faster and shows how many people use Scamp. No personal data or project files are ever shared \u2014 just a random ID for this install." })] }), _jsxs("div", { className: styles.rowControl, children: [_jsx("button", { type: "button", className: `${styles.smallButton} ${settings.sentryOptIn === true ? styles.smallButtonActive : ''}`, onClick: () => void handleSentryToggle(true), children: "On" }), _jsx("button", { type: "button", className: `${styles.smallButton} ${settings.sentryOptIn === false
                                                    ? styles.smallButtonActive
                                                    : ''}`, onClick: () => void handleSentryToggle(false), children: "Off" })] })] })] }), _jsxs("div", { className: styles.section, children: [_jsx("h2", { className: styles.sectionTitle, children: "About" }), _jsxs("div", { className: styles.row, children: [_jsx("span", { className: styles.rowLabel, children: "Version" }), _jsx("div", { className: styles.rowControl, children: _jsx("span", { className: styles.versionValue, children: version === null ? '—' : `Scamp ${version}` }) })] })] })] })] }));
};
