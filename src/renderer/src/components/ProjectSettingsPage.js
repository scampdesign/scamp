import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { DESKTOP_BREAKPOINT_ID } from '@shared/types';
import { Button } from './controls/Button';
import { ColorInput } from './controls/ColorInput';
import { NumberInput } from './controls/NumberInput';
import { PrefixSuffixInput } from './controls/PrefixSuffixInput';
import { FontsSection } from './sections/FontsSection';
import { RouteList } from './projectShell/RoutesSection';
import styles from './ProjectSettingsPage.module.css';
/** Fallback shown in the card-color picker when the project has none set.
 *  Matches the Start Screen card's CSS default (`--bg-raised`). */
const DEFAULT_CARD_BACKGROUND = '#1f1f1f';
export const ProjectSettingsPage = ({ projectName, projectPath, environment, framework, routes, config, onChange, onBack, }) => {
    const handleArtboardChange = (value) => {
        onChange({ ...config, artboardBackground: value });
    };
    const updateBreakpoints = (breakpoints) => {
        // Keep widest-first ordering so the generator emits in CSS cascade
        // order automatically.
        const sorted = [...breakpoints].sort((a, b) => b.width - a.width);
        onChange({ ...config, breakpoints: sorted });
    };
    return (_jsxs("div", { className: styles.page, children: [_jsxs("div", { className: styles.header, children: [_jsx("button", { className: styles.backButton, onClick: onBack, type: "button", children: "\u2190 Back" }), _jsx("h1", { className: styles.headerTitle, children: "Project Settings" }), _jsx("span", { className: styles.headerProject, children: projectName })] }), _jsxs("div", { className: styles.body, children: [_jsxs("div", { className: styles.section, children: [_jsx("h2", { className: styles.sectionTitle, children: "General" }), _jsxs("div", { className: styles.row, children: [_jsx("span", { className: styles.rowLabel, children: "Artboard background" }), _jsx("div", { className: styles.rowControl, children: _jsx(ColorInput, { value: config.artboardBackground, onChange: handleArtboardChange }) })] }), _jsxs("div", { className: styles.row, children: [_jsx("span", { className: styles.rowLabel, children: "Card background" }), _jsx("div", { className: styles.rowControl, children: _jsx(ColorInput, { value: config.cardBackground ?? DEFAULT_CARD_BACKGROUND, onChange: (value) => onChange({ ...config, cardBackground: value }) }) })] }), _jsxs("div", { className: styles.row, children: [_jsx("span", { className: styles.rowLabel, children: "Status" }), _jsx("div", { className: styles.rowControl, children: _jsx(PrefixSuffixInput, { value: config.state ?? '', placeholder: "e.g. in progress", onCommit: (value) => onChange({
                                                ...config,
                                                state: value.trim() ? value.trim() : undefined,
                                            }) }) })] })] }), framework !== undefined && (_jsxs("div", { className: styles.section, "data-testid": "settings-framework", children: [_jsx("h2", { className: styles.sectionTitle, children: "Framework" }), _jsxs("div", { className: styles.row, children: [_jsx("span", { className: styles.rowLabel, children: _jsx("code", { children: "scampjs" }) }), _jsxs("div", { className: styles.rowControl, children: [_jsx("span", { "data-testid": "framework-version", children: framework.installed === null
                                                    ? 'Not installed yet'
                                                    : framework.updateTo === null
                                                        ? `${framework.installed}, up to date`
                                                        : `${framework.installed}, ${framework.updateTo} available` }), framework.updateTo !== null && (_jsx(Button, { variant: "primary", size: "sm", onClick: framework.onUpdate, disabled: framework.updating, children: framework.updating ? 'Updating…' : 'Update' }))] })] }), framework.error !== null && (_jsxs("p", { className: styles.hint, role: "alert", children: ["The update failed: ", framework.error] })), _jsx("p", { className: styles.hint, children: framework.installed === null
                                    ? 'Scamp installs it the first time you open the preview.'
                                    : 'Updating runs npm install in the project and restarts the preview. Restart any dev server you run yourself.' })] })), routes !== undefined && (_jsxs("div", { className: styles.section, "data-testid": "settings-routes", children: [_jsx("h2", { className: styles.sectionTitle, children: "Routes" }), routes.routes.length === 0 && routes.unrouted.length === 0 ? (_jsx("p", { className: styles.hint, children: "No routes yet. Add a page to get a view, then generate its route." })) : (_jsx(RouteList, { routes: routes.routes, unrouted: routes.unrouted, busy: routes.busy, onOpen: routes.onOpen, onSetRender: routes.onSetRender, onGenerate: routes.onGenerate })), _jsx("p", { className: styles.hint, children: "Every route in the project, page and API. Opening one shows it in the code panel. The properties panel shows the open page's route on its own." })] })), environment !== undefined && (_jsxs("div", { className: styles.section, "data-testid": "settings-environment", children: [_jsx("h2", { className: styles.sectionTitle, children: "Environment" }), _jsxs("div", { className: styles.row, children: [_jsx("span", { className: styles.rowLabel, children: _jsx("code", { children: ".dev.vars" }) }), _jsxs("div", { className: styles.rowControl, children: [environment.exists ? (_jsx("span", { children: environment.keys.length === 0 ? 'No keys yet' : environment.keys.join(', ') })) : (_jsx("span", { children: "Not created yet" })), _jsx(Button, { variant: "secondary", size: "sm", onClick: environment.onOpen, children: "Open" })] })] }), _jsxs("p", { className: styles.hint, children: ["Local values for ", _jsx("code", { children: "env" }), " in ", _jsx("code", { children: "load()" }), " and API routes, one", ' ', _jsx("code", { children: "KEY=value" }), " per line. Gitignored, never in snapshots, and never shown here."] })] })), _jsxs("div", { className: styles.section, children: [_jsx("h2", { className: styles.sectionTitle, children: "Breakpoints" }), _jsx(BreakpointsEditor, { breakpoints: config.breakpoints, onChange: updateBreakpoints })] }), _jsxs("div", { className: styles.section, children: [_jsx("h2", { className: styles.sectionTitle, children: "Fonts" }), _jsx(FontsSection, { projectPath: projectPath })] })] })] }));
};
const BreakpointsEditor = ({ breakpoints, onChange, }) => {
    // Local id for newly-added breakpoints before the user types a real
    // one. Incremented so successive adds don't collide.
    const [nextId, setNextId] = useState(1);
    const updateAt = (idx, patch) => {
        const next = breakpoints.map((bp, i) => (i === idx ? { ...bp, ...patch } : bp));
        onChange(next);
    };
    const removeAt = (idx) => {
        const target = breakpoints[idx];
        if (!target)
            return;
        // Never remove desktop — it's the base breakpoint every other one
        // cascades from.
        if (target.id === DESKTOP_BREAKPOINT_ID)
            return;
        onChange(breakpoints.filter((_, i) => i !== idx));
    };
    const addBreakpoint = () => {
        const id = `custom-${nextId}`;
        setNextId(nextId + 1);
        onChange([
            ...breakpoints,
            { id, label: 'Custom', width: 600 },
        ]);
    };
    return (_jsxs("div", { children: [_jsxs("p", { className: styles.sectionHint, children: ["Style edits made while a non-desktop breakpoint is active land inside the matching ", _jsx("code", { children: "@media (max-width: Npx)" }), " block. Desktop is the base \u2014 no ", _jsx("code", { children: "@media" }), " wrapper."] }), _jsx("div", { className: styles.bpTable, children: breakpoints.map((bp, idx) => {
                    const isDesktop = bp.id === DESKTOP_BREAKPOINT_ID;
                    return (_jsxs("div", { className: styles.bpRow, children: [_jsx("div", { className: styles.bpLabelCell, children: _jsx(PrefixSuffixInput, { value: bp.label, placeholder: "Label", onCommit: (next) => updateAt(idx, { label: next }) }) }), _jsx("div", { className: styles.bpWidthCell, children: _jsx(NumberInput, { value: bp.width, onChange: (next) => {
                                        if (next !== undefined)
                                            updateAt(idx, { width: Math.round(next) });
                                    }, min: 100, max: 4000, suffix: "px" }) }), _jsx("button", { type: "button", className: styles.bpRemove, onClick: () => removeAt(idx), disabled: isDesktop, "aria-label": isDesktop
                                    ? `Remove ${bp.label} (disabled)`
                                    : `Remove ${bp.label}`, title: isDesktop
                                    ? 'Desktop is the base breakpoint and cannot be removed'
                                    : 'Remove breakpoint', children: "\u00D7" })] }, bp.id));
                }) }), _jsx("button", { type: "button", className: styles.bpAdd, onClick: addBreakpoint, children: "+ Add breakpoint" })] }));
};
