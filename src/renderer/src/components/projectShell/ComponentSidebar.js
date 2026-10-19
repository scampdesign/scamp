import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { componentKindOf } from '@shared/types';
import { STARTERS, freeStarterName, starterFiles } from '@lib/starterComponents';
import { COMPONENT_DRAG_MIME } from '../../canvas/interactions/useComponentDrop';
import { ComponentNameInput } from '../ComponentNameInput';
import { ComponentSidebarItem } from '../ComponentSidebarItem';
import styles from '../ProjectShell.module.css';
/** The Components section of the left sidebar: list + inline add/rename. */
export const ComponentSidebar = ({ components: allComponents, projectPath, componentEdit, componentEditError, renamingComponent, creatingComponent, activeComponent, setComponentEdit, setComponentEditError, handleAddComponent, handleRenameComponent, openComponent, openComponentMenu, }) => {
    const kind = 'component';
    // Views (a page's design) live in the Pages list; they share this
    // namespace (see componentOps), so the inline input rejects a name
    // either list already uses.
    const components = allComponents.filter((c) => componentKindOf(c) === kind);
    const allNames = allComponents.map((c) => c.name);
    return (_jsxs("div", { className: styles.sidebarSection, children: [_jsx("h2", { className: styles.sidebarTitle, children: "Components" }), _jsxs("ul", { className: styles.pageList, children: [components.map((component) => {
                        const isRenaming = componentEdit !== null &&
                            'rename' in componentEdit &&
                            componentEdit.rename === component.name;
                        if (isRenaming) {
                            return (_jsx("li", { children: _jsx(ComponentNameInput, { initialValue: component.name, existingNames: allNames.filter((n) => n !== component.name), onConfirm: (name) => void handleRenameComponent(component.name, name), onCancel: () => {
                                        if (renamingComponent)
                                            return;
                                        setComponentEdit(null);
                                        setComponentEditError(null);
                                    }, error: componentEditError, busy: renamingComponent }) }, component.name));
                        }
                        return (_jsx("li", { children: _jsx(ComponentSidebarItem, { componentName: component.name, projectPath: projectPath, isActive: activeComponent?.name === component.name, onClick: () => openComponent(component.name, null), onContextMenu: (e) => openComponentMenu(e, component.name), 
                                // HTML5 DnD source: dragging a component onto the
                                // canvas inserts an instance inside whatever container
                                // is under the cursor. The canvas interaction layer
                                // reads this mime to tell a component-drag apart from
                                // any other drag.
                                onDragStart: (e) => {
                                    e.dataTransfer.setData(COMPONENT_DRAG_MIME, component.name);
                                    e.dataTransfer.effectAllowed = 'copy';
                                } }) }, component.name));
                    }), componentEdit !== null && 'new' in componentEdit && componentEdit.new === kind && (_jsx("li", { children: _jsx(ComponentNameInput, { existingNames: allNames, onConfirm: (name) => void handleAddComponent(name, kind), onCancel: () => {
                                setComponentEdit(null);
                                setComponentEditError(null);
                            }, error: componentEditError, busy: creatingComponent }) }))] }), componentEdit === null && (_jsx("button", { className: styles.addPageButton, onClick: () => {
                    setComponentEditError(null);
                    setComponentEdit({ new: kind });
                }, type: "button", children: "+ Add Component" })), componentEdit === null && (_jsxs("div", { className: styles.starterRow, role: "group", "aria-label": "Add a starter component", children: [_jsx("span", { children: "Starters:" }), STARTERS.map((starter) => (_jsx("button", { type: "button", className: styles.starterButton, title: starter.description, disabled: creatingComponent, onClick: () => {
                            const name = freeStarterName(starter.name, allNames);
                            void handleAddComponent(name, kind, starterFiles(starter.name, name));
                        }, children: starter.name }, starter.name)))] })), componentEdit === null && componentEditError !== null && (_jsx("div", { className: styles.starterError, role: "alert", children: componentEditError }))] }));
};
