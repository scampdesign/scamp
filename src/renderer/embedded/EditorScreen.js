import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AppToolbar } from './AppToolbar';
import { AppView } from './AppView';
import { ArtboardHeader } from './ArtboardHeader';
import { useEmbeddedStore } from './embeddedStore';
import { LayersPanel } from './LayersPanel';
import { SidePanel } from './SidePanel';
import styles from './EditorScreen.module.css';
/**
 * The running app beside Scamp's panel, the agent and git, laid out as the
 * scamp-ui Layout design: a title bar, then layers, the artboard, and the panel.
 */
export const EditorScreen = () => {
    const layersOpen = useEmbeddedStore((s) => s.layersOpen);
    return (_jsxs("div", { className: styles.screen, children: [_jsx(AppToolbar, {}), _jsxs("div", { className: styles.body, children: [layersOpen && _jsx(LayersPanel, {}), _jsxs("div", { className: styles.artboard, children: [_jsx(ArtboardHeader, {}), _jsx(AppView, {})] }), _jsx(SidePanel, {})] })] }));
};
