import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChecksSection } from './projectShell/ChecksSection';
import { useCanvasStore } from '@store/canvasSlice';
import { PanelHeader } from './PanelHeader';
import { PanelModeToggle } from './PanelModeToggle';
import { StateSwitcher } from './StateSwitcher';
import { VariantsSection } from './VariantsSection';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { UiPanel } from './UiPanel';
import { CssPanel } from './CssPanel';
import { DataPanel, useViewDataCount, ViewDataSection } from './DataPanel';
import { Section } from './sections/Section';
import styles from './PropertiesPanel.module.css';
const SHORTCUTS = [
    { keys: 'V', description: 'Select tool' },
    { keys: 'R', description: 'Rectangle tool' },
    { keys: 'T', description: 'Text tool' },
    { keys: 'I', description: 'Image tool' },
    { keys: 'Delete', description: 'Delete element' },
    { keys: 'Cmd+C', description: 'Copy element' },
    { keys: 'Cmd+V', description: 'Paste element' },
    { keys: 'Cmd+D', description: 'Duplicate element' },
    { keys: 'Cmd+G', description: 'Group selection' },
    { keys: 'Cmd+Z', description: 'Undo' },
    { keys: 'Cmd+Shift+Z', description: 'Redo' },
    { keys: 'Cmd+S', description: 'Save CSS edits' },
    { keys: 'Cmd+=', description: 'Zoom in' },
    { keys: 'Cmd+-', description: 'Zoom out' },
    { keys: 'Cmd+0', description: 'Reset zoom' },
    { keys: 'Double-click', description: 'Edit text / Rename layer' },
    { keys: 'Shift+click', description: 'Multi-select' },
];
const ShortcutsTable = () => (_jsx("table", { className: styles.shortcutsTable, children: _jsx("tbody", { children: SHORTCUTS.map((s) => (_jsxs("tr", { children: [_jsx("td", { className: styles.shortcutKeys, children: s.keys }), _jsx("td", { className: styles.shortcutDesc, children: s.description })] }, s.keys))) }) }));
export const PropertiesPanel = ({ routesSection, migrationNotice, }) => {
    const selectedId = useCanvasStore((s) => s.selectedElementIds[0] ?? null);
    const panelMode = useCanvasStore((s) => s.panelMode);
    const isComponentEditing = useCanvasStore((s) => s.activeComponent !== null);
    // Variants belong to a component, not a view: Figma's set properties,
    // shown with the component (its root, or nothing) selected.
    const isComponent = useCanvasStore((s) => s.activeComponent?.kind === 'component');
    const dataCount = useViewDataCount();
    // Nothing selected: the panel shows what belongs to the page rather
    // than to an element — its routes and its data — with the shortcuts
    // as a reference the user can open. Visual and CSS are element-level
    // and have nothing to say here, so the mode toggle stays out of it.
    if (!selectedId) {
        return (_jsx("aside", { className: styles.panel, "data-testid": "properties-panel", "data-panel-mode": "empty", children: _jsxs("div", { className: styles.emptyBody, children: [isComponent && _jsx(VariantsSection, {}), !isComponent && routesSection, isComponentEditing && (_jsx("div", { "data-testid": "view-data-section", children: _jsx(Section, { title: "Data", collapsible: true, defaultOpen: false, count: dataCount, children: _jsx(ViewDataSection, {}) }) })), migrationNotice, _jsx(Section, { title: "Keyboard Shortcuts", collapsible: true, defaultOpen: false, children: _jsx(ShortcutsTable, {}) }), _jsx(ChecksSection, {})] }) }));
    }
    return (_jsxs("aside", { className: styles.panel, "data-testid": "properties-panel", "data-panel-mode": panelMode, children: [_jsx(PanelHeader, {}), _jsx(PanelModeToggle, {}), panelMode === 'ui' && _jsx(StateSwitcher, {}), panelMode === 'ui' && isComponent && selectedId === ROOT_ELEMENT_ID && _jsx(VariantsSection, {}), panelMode === 'data' ? (_jsx(DataPanel, {})) : panelMode === 'ui' ? (_jsx(UiPanel, {})) : (_jsx(CssPanel, {}))] }));
};
