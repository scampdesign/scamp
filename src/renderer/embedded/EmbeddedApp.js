import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { ChooseScreen } from './ChooseScreen';
import { EditorScreen } from './EditorScreen';
import { useEmbeddedStore } from './embeddedStore';
import { SetupScreen } from './SetupScreen';
import { startSession } from './session';
import styles from './EmbeddedApp.module.css';
/** Embedded Scamp: choose a React project, set it up, then edit it in place. */
export const EmbeddedApp = () => {
    const screen = useEmbeddedStore((s) => s.screen);
    useEffect(() => {
        startSession();
    }, []);
    return (_jsxs("div", { className: styles.app, children: [screen === 'choose' && _jsx(ChooseScreen, {}), screen === 'setup' && _jsx(SetupScreen, {}), screen === 'editor' && _jsx(EditorScreen, {})] }));
};
