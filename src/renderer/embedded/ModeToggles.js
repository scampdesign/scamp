import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconPointer, IconSnowflake } from '@tabler/icons-react';
import { Tooltip } from '../src/components/controls/Tooltip';
import { useEmbeddedStore } from './embeddedStore';
import { setModes } from './session';
import styles from './ModeToggles.module.css';
/** Freeze (with its F8 shortcut) and Editing, at the end of the artboard header, as icon toggles. */
export const ModeToggles = () => {
    const edit = useEmbeddedStore((s) => s.edit);
    const frozen = useEmbeddedStore((s) => s.frozen);
    return (_jsxs("div", { className: styles.toggles, children: [_jsx(Tooltip, { label: "Freeze \u2014 Keep menus, popovers, and tooltips open while you style them. Press F8 with the pointer on the page.", children: _jsxs("button", { type: "button", className: styles.toggle, "aria-pressed": frozen, onClick: () => setModes({ frozen: !frozen }), "aria-label": "Freeze (F8)", "data-testid": "embedded-freeze-toggle", children: [_jsx(IconSnowflake, { className: styles.icon, "aria-hidden": "true" }), _jsx("kbd", { className: styles.key, children: "F8" })] }) }), _jsx(Tooltip, { label: "Editing \u2014 Click elements to select and style them. Turn off to use the app.", children: _jsx("button", { type: "button", className: styles.toggle, "aria-pressed": edit, onClick: () => setModes({ edit: !edit }), "aria-label": "Editing", "data-testid": "embedded-edit-toggle", children: _jsx(IconPointer, { className: styles.icon, "aria-hidden": "true" }) }) })] }));
};
