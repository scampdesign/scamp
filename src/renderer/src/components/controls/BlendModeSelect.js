import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BLEND_MODE_GROUPS } from '@lib/blendModes';
import { Tooltip } from './Tooltip';
import styles from './Controls.module.css';
/**
 * Grouped CSS blend-mode dropdown. Used by both `VisibilitySection`
 * (`mix-blend-mode`) and `BackgroundSection` (`background-blend-mode`)
 * — the keyword set is identical across the two CSS properties, so a
 * single component covers both surfaces. The `<optgroup>` headers
 * mirror the categories from `BLEND_MODE_GROUPS` (Darken / Lighten /
 * Contrast / Inversion / Component) so the dropdown reads like the
 * spec.
 */
export const BlendModeSelect = ({ value, onChange, title, mixed = false, }) => {
    const select = (_jsxs("select", { className: styles.select, value: mixed ? '' : value, onChange: (e) => onChange(e.target.value), children: [mixed && (_jsx("option", { value: "", disabled: true, hidden: true, children: "Mixed" })), _jsx("option", { value: "normal", children: "Normal" }), BLEND_MODE_GROUPS.map((group) => (_jsx("optgroup", { label: group.name, children: group.options.map((opt) => (_jsx("option", { value: opt.value, children: opt.label }, opt.value))) }, group.name)))] }));
    return title ? _jsx(Tooltip, { label: title, children: select }) : select;
};
