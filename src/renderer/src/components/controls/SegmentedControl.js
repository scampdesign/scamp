import { jsx as _jsx } from "react/jsx-runtime";
import { Tooltip } from './Tooltip';
import styles from './Controls.module.css';
export const SegmentedControl = ({ value, options, onChange, title, mixed = false, }) => {
    const group = (_jsx("div", { className: styles.segmented, role: "radiogroup", children: options.map((opt) => {
            const active = !mixed && opt.value === value;
            const accessibleName = opt.ariaLabel ??
                opt.tooltip ??
                (typeof opt.label === 'string' ? opt.label : undefined);
            const button = (_jsx("button", { type: "button", role: "radio", "aria-checked": active, "aria-label": accessibleName, className: `${styles.segmentedButton} ${active ? styles.segmentedButtonActive : ''}`, onClick: () => onChange(opt.value), children: opt.label }, opt.value));
            return opt.tooltip ? (_jsx(Tooltip, { label: opt.tooltip, children: button }, opt.value)) : (button);
        }) }));
    return title ? _jsx(Tooltip, { label: title, children: group }) : group;
};
