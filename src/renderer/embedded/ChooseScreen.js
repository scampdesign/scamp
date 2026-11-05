import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useEmbeddedStore } from './embeddedStore';
import styles from './ChooseScreen.module.css';
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
/** The first screen: a recent project, or a new folder. */
export const ChooseScreen = () => {
    const set = useEmbeddedStore((s) => s.set);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [recent, setRecent] = useState([]);
    useEffect(() => {
        let cancelled = false;
        void window.scampEmbedded.recent().then((list) => {
            if (!cancelled)
                setRecent(list);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    const openFolder = async (folder) => {
        setError(null);
        setBusy(true);
        const report = await window.scampEmbedded.open(folder);
        setBusy(false);
        if ('error' in report) {
            setError(report.error);
            return;
        }
        set({ folder, preflight: report, screen: 'setup' });
    };
    const handleChoose = async () => {
        const chosen = await window.scampEmbedded.chooseFolder();
        if (chosen.kind === 'ok')
            await openFolder(chosen.folder);
    };
    const handleForget = async (folder) => {
        await window.scampEmbedded.forgetRecent(folder);
        setRecent((list) => list.filter((p) => p.folder !== folder));
    };
    return (_jsx("div", { className: styles.screen, children: _jsxs("div", { className: styles.card, children: [_jsx("h1", { className: styles.title, children: "Edit a React project" }), _jsx("p", { className: styles.lede, children: "Choose a Vite + React or Next.js project on your computer. Scamp runs it, and you restyle the real app with the Scamp panel. The Scamp Agent writes each change into your source, on its own git branch." }), _jsx("button", { type: "button", className: styles.primary, onClick: handleChoose, disabled: busy, "data-testid": "embedded-choose", children: busy ? 'Checking the project…' : 'Choose project folder' }), error !== null && _jsx("p", { className: styles.error, children: error }), recent.length > 0 && (_jsxs("section", { className: styles.recent, "aria-labelledby": "embedded-recent-title", children: [_jsx("h2", { id: "embedded-recent-title", className: styles.recentTitle, children: "Recent" }), _jsx("ul", { className: styles.recentList, "data-testid": "embedded-recent", children: recent.map((p) => (_jsxs("li", { className: styles.recentRow, children: [_jsxs("button", { type: "button", className: styles.recentOpen, onClick: () => void openFolder(p.folder), disabled: busy || !p.exists, title: p.exists ? p.folder : `${p.folder} isn’t there any more`, children: [_jsx("span", { className: styles.recentName, children: p.name }), _jsx("span", { className: styles.recentPath, children: p.exists ? p.folder : 'Folder not found' })] }), _jsx("span", { className: styles.recentDate, children: shortDate.format(new Date(p.lastOpened)) }), _jsx("button", { type: "button", className: styles.recentForget, onClick: () => void handleForget(p.folder), "aria-label": `Remove ${p.name} from the list`, children: "\u2715" })] }, p.folder))) })] }))] }) }));
};
