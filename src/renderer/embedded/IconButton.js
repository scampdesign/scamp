import { jsx as _jsx } from "react/jsx-runtime";
import { Tooltip } from '../src/components/controls/Tooltip';
import styles from './IconButton.module.css';
/** A 32px icon button, as the scamp-ui Layout design draws them. */
export const IconButton = ({ icon: Glyph, label, tooltip, onClick, pressed, disabled, testId, variant = 'box' }) => (_jsx(Tooltip, { label: tooltip ?? label, children: _jsx("button", { type: "button", className: styles.button, "data-variant": variant, "aria-label": label, "aria-pressed": pressed, disabled: disabled, onClick: onClick, "data-testid": testId, children: _jsx(Glyph, { className: styles.glyph, "aria-hidden": "true" }) }) }));
