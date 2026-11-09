import { jsx as _jsx } from "react/jsx-runtime";
import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet } from '@tabler/icons-react';
import { useEmbeddedStore } from './embeddedStore';
import { IconButton } from './IconButton';
import { setViewport } from './session';
import styles from './ViewportControl.module.css';
const PRESETS = [
    { label: 'Desktop', width: null, icon: IconDeviceDesktop },
    { label: 'Tablet', width: 768, icon: IconDeviceTablet },
    { label: 'Mobile', width: 390, icon: IconDeviceMobile },
];
/**
 * The app's width: the window's (desktop), a tablet, or a phone. An edit
 * made below desktop applies at that width and narrower.
 * see docs/plans/embedded-canvas-gaps.md (P4)
 */
export const ViewportControl = () => {
    const viewport = useEmbeddedStore((s) => s.viewport);
    return (_jsx("div", { className: styles.control, role: "group", "aria-label": "App width", children: PRESETS.map((p) => (_jsx(IconButton, { icon: p.icon, variant: "bare", label: p.width === null ? `${p.label}: full width` : `${p.label} (${p.width}px)`, pressed: viewport === p.width, onClick: () => setViewport(p.width), testId: `embedded-viewport-${p.label.toLowerCase()}` }, p.label))) }));
};
