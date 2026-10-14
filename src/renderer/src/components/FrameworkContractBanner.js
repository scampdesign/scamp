import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from './controls/Button';
import { SUPPORTED_CONTRACT, isSupportedContract } from '@shared/projectConfig';
import styles from './ParseErrorBanner.module.css';
/**
 * Shown above the canvas of a scamp-format project whose installed
 * `scampjs` implements a contract this build can't read or write: a
 * save would write a shape the framework doesn't understand, so the
 * user needs to know before editing.
 *
 * A MISSING `scampjs` is not a banner. Designing doesn't need it —
 * the app reads and writes the files itself — and the first preview
 * installs the project's dependencies anyway.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md, step 6
 */
export const FrameworkContractBanner = ({ framework, onDismiss }) => {
    if (framework.installedVersion === null)
        return null;
    if (isSupportedContract(framework.contract))
        return null;
    const min = SUPPORTED_CONTRACT.min;
    const max = SUPPORTED_CONTRACT.max;
    const range = min === max ? `${max}` : `${min}–${max}`;
    const title = `This project's scampjs uses contract ${framework.contract ?? '?'}`;
    const message = `This version of Scamp supports contract ${range}. Update Scamp, or install a scampjs release that implements contract ${range}, before editing — a save would write the older shape.`;
    return (_jsxs("div", { className: styles.banner, role: "status", "data-testid": "framework-contract-banner", children: [_jsxs("div", { className: styles.content, children: [_jsx("span", { className: styles.icon, "aria-hidden": "true", children: "\u2139" }), _jsxs("div", { className: styles.text, children: [_jsx("strong", { className: styles.title, children: title }), _jsx("span", { className: styles.message, children: message })] })] }), _jsx("div", { className: styles.dismissWrap, children: _jsx(Button, { variant: "secondary", size: "sm", onClick: onDismiss, children: "Dismiss" }) })] }));
};
