import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AppToolbar } from './AppToolbar';
import { AppView } from './AppView';
import { useEmbeddedStore } from './embeddedStore';
import { LayersPanel } from './LayersPanel';
import { SidePanel } from './SidePanel';
import styles from './EditorScreen.module.css';
/** The running app beside Scamp's panel, the agent and git. */
export const EditorScreen = () => {
    const layersOpen = useEmbeddedStore((s) => s.layersOpen);
    return (_jsxs("div", { className: styles.screen, children: [_jsx(AppToolbar, {}), _jsxs("div", { className: styles.body, children: [layersOpen && _jsx(LayersPanel, {}), _jsx(AppView, {}), _jsx(SidePanel, {})] })] }));
};
