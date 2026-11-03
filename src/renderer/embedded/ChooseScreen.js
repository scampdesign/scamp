import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useEmbeddedStore } from './embeddedStore';
import styles from './ChooseScreen.module.css';
/** The first screen: pick the project folder. */
export const ChooseScreen = () => {
    const set = useEmbeddedStore((s) => s.set);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const handleChoose = async () => {
        setError(null);
        const chosen = await window.scampEmbedded.chooseFolder();
        if (chosen.kind === 'cancelled')
            return;
        setBusy(true);
        const report = await window.scampEmbedded.open(chosen.folder);
        setBusy(false);
        if ('error' in report) {
            setError(report.error);
            return;
        }
        set({ folder: chosen.folder, preflight: report, screen: 'setup' });
    };
    return (_jsx("div", { className: styles.screen, children: _jsxs("div", { className: styles.card, children: [_jsx("h1", { className: styles.title, children: "Edit a React project" }), _jsx("p", { className: styles.lede, children: "Choose a Vite + React project on your computer. Scamp runs it, and you restyle the real app with the Scamp panel. The Scamp Agent writes each change into your source, on its own git branch." }), _jsx("button", { type: "button", className: styles.primary, onClick: handleChoose, disabled: busy, "data-testid": "embedded-choose", children: busy ? 'Checking the project…' : 'Choose project folder' }), error !== null && _jsx("p", { className: styles.error, children: error })] }) }));
};
