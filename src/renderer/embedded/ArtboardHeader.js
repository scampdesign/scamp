import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconReload } from '@tabler/icons-react';
import { useEmbeddedStore } from './embeddedStore';
import { IconButton } from './IconButton';
import { ModeToggles } from './ModeToggles';
import { PathField } from './PathField';
import { navigatePage, refreshTree } from './session';
import { ViewportControl } from './ViewportControl';
import styles from './ArtboardHeader.module.css';
/** Above the app, as the design's artboard header: the layers toggle, the page's path, reload, its width, then Freeze and Editing. */
export const ArtboardHeader = () => {
    const layersOpen = useEmbeddedStore((s) => s.layersOpen);
    return (_jsxs("div", { className: styles.header, children: [_jsx(IconButton, { icon: layersOpen ? IconLayoutSidebarLeftCollapse : IconLayoutSidebarLeftExpand, variant: "bare", label: layersOpen ? 'Hide layers' : 'Show layers', onClick: () => {
                    useEmbeddedStore.getState().set({ layersOpen: !layersOpen });
                    if (!layersOpen)
                        void refreshTree();
                }, testId: "embedded-layers-toggle" }), _jsx(PathField, {}), _jsx(IconButton, { icon: IconReload, variant: "bare", label: "Reload", onClick: () => navigatePage('reload') }), _jsx(ViewportControl, {}), _jsx(ModeToggles, {})] }));
};
