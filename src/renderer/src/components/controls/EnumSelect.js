import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Tooltip } from './Tooltip';
import styles from './Controls.module.css';
export const EnumSelect = ({ value, options, onChange, title, mixed = false, }) => {
    const select = (_jsxs("select", { className: styles.select, value: mixed ? '' : value, onChange: (e) => onChange(e.target.value), children: [mixed && (_jsx("option", { value: "", disabled: true, hidden: true, children: "Mixed" })), options.map((opt) => (_jsx("option", { value: opt.value, disabled: opt.disabled, children: opt.label }, opt.value)))] }));
    return title ? _jsx(Tooltip, { label: title, children: select }) : select;
};
