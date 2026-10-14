import { copyContextToClipboard } from '../../lib/copyContext';
import { useEffect } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { useAuthStore } from '@store/authSlice';
import { useHistoryStore } from '@store/historySlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { clampToParent } from '@lib/bounds';
import { resolveInsertParent } from '@lib/insertParent';
import { findInstanceUsagesAcrossPages, groupUsagesByPage, } from '@lib/componentUsage';
import { prepareSvgForInsert } from '../../lib/svg';
import { DEFAULT_IMAGE_SIZE } from '../../canvas/interactions/constants';
const isEditableTarget = (target) => {
    if (!(target instanceof HTMLElement))
        return false;
    if (target.isContentEditable)
        return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};
/**
 * Owns ProjectShell's two keyboard concerns:
 *   - the global canvas shortcuts (zoom, copy/paste, undo/redo, group,
 *     duplicate, delete, arrow-nudge, terminal/preview toggles), bound
 *     once and reading fresh values via `keyDeps`;
 *   - the component-editor Esc handler, which exits back to the prior
 *     page and re-binds whenever the active component changes.
 */
export const useCanvasKeyboardShortcuts = (keyDeps, componentEditor) => {
    // Global keyboard shortcuts. We deliberately read store state inside the
    // handler (rather than via React state captured in deps) so the listener
    // can stay attached for the lifetime of the component.
    useEffect(() => {
        const handleKey = (e) => {
            // Ctrl+` / Cmd+` — toggle the terminal (matches VS Code).
            if ((e.metaKey || e.ctrlKey) && e.key === '`') {
                e.preventDefault();
                keyDeps.current.toggleTerminalPanel();
                return;
            }
            // Cmd/Ctrl+P — open the preview window.
            if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
                if (isEditableTarget(e.target))
                    return;
                e.preventDefault();
                if (keyDeps.current.canPreview)
                    keyDeps.current.openPreview();
                return;
            }
            // Cmd/Ctrl+= or Cmd/Ctrl++ — zoom canvas in. We accept both because
            // the unshifted "+" key actually emits "=" on US keyboards, while
            // shifted versions (or non-US layouts) emit "+".
            if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
                if (isEditableTarget(e.target))
                    return;
                e.preventDefault();
                useCanvasStore.getState().zoomIn();
                return;
            }
            // Cmd/Ctrl+- — zoom canvas out.
            if ((e.metaKey || e.ctrlKey) && e.key === '-') {
                if (isEditableTarget(e.target))
                    return;
                e.preventDefault();
                useCanvasStore.getState().zoomOut();
                return;
            }
            // Cmd/Ctrl+0 — reset canvas zoom (back to fit-to-container).
            if ((e.metaKey || e.ctrlKey) && e.key === '0') {
                if (isEditableTarget(e.target))
                    return;
                e.preventDefault();
                useCanvasStore.getState().resetZoom();
                return;
            }
            // Read-only while previewing a snapshot — block every mutating
            // shortcut below (undo/redo, delete, paste, group, nudge, …). Zoom,
            // terminal, and the preview window above stay available.
            if (useCanvasStore.getState().snapshotPreview !== null)
                return;
            // Shift+Cmd/Ctrl+G — ungroup the selected element. We check this
            // BEFORE the plain Cmd+G branch so the shift modifier wins.
            if ((e.metaKey || e.ctrlKey) &&
                e.shiftKey &&
                (e.key === 'g' || e.key === 'G')) {
                if (isEditableTarget(e.target))
                    return;
                const state = useCanvasStore.getState();
                const target = state.selectedElementIds[0];
                if (!target)
                    return;
                if (state.editingElementId)
                    return;
                if (target === state.rootElementId)
                    return;
                e.preventDefault();
                state.ungroupElement(target);
                return;
            }
            // Cmd/Ctrl+Shift+C — copy an agent-ready description of the
            // selection to the OS clipboard. Checked BEFORE the plain Cmd+C
            // branch (which guards `!e.shiftKey`) so the modifier wins.
            // Works with nothing selected too: the page-level string is useful.
            // see docs/archive/2026-08-06-copy-context-button-plan.md
            if ((e.metaKey || e.ctrlKey) &&
                e.shiftKey &&
                (e.key === 'c' || e.key === 'C')) {
                // `isEditableTarget` covers CodeMirror as well as panel inputs —
                // its editor is contentEditable, so the CSS panel keeps the normal
                // copy behaviour.
                if (isEditableTarget(e.target))
                    return;
                e.preventDefault();
                void copyContextToClipboard();
                return;
            }
            // Cmd/Ctrl+C — copy the selection to the internal clipboard.
            if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C') && !e.shiftKey) {
                if (isEditableTarget(e.target))
                    return;
                const state = useCanvasStore.getState();
                if (state.selectedElementIds.length === 0)
                    return;
                if (state.editingElementId)
                    return;
                e.preventDefault();
                state.copyElements(state.selectedElementIds);
                return;
            }
            // Cmd/Ctrl+X — cut: copy, then remove, as one undo step.
            if ((e.metaKey || e.ctrlKey) && (e.key === 'x' || e.key === 'X')) {
                if (isEditableTarget(e.target))
                    return;
                const state = useCanvasStore.getState();
                if (state.selectedElementIds.length === 0)
                    return;
                if (state.editingElementId)
                    return;
                e.preventDefault();
                state.cutElements(state.selectedElementIds);
                return;
            }
            // Cmd/Ctrl+Shift+V — paste in place, at the coordinates the
            // elements were copied from rather than offset from them.
            if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V') && e.shiftKey) {
                if (isEditableTarget(e.target))
                    return;
                const state = useCanvasStore.getState();
                if (state.editingElementId)
                    return;
                if (!state.clipboard)
                    return;
                e.preventDefault();
                state.pasteElement({ inPlace: true });
                return;
            }
            // Cmd/Ctrl+V — paste. Internal element clipboard wins; otherwise
            // fall back to the OS clipboard (an SVG copied as markup, or a
            // raster image). see docs/archive/2026-06-30-svg-improvements-plan.md
            if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V') && !e.shiftKey) {
                if (isEditableTarget(e.target))
                    return;
                const state = useCanvasStore.getState();
                if (state.editingElementId)
                    return;
                e.preventDefault();
                if (state.clipboard) {
                    state.pasteElement();
                    return;
                }
                void (async () => {
                    const result = await window.scamp.readClipboard();
                    if (result.kind === 'empty')
                        return;
                    const s = useCanvasStore.getState();
                    // A page, a view, or a component: anything with a root to paste into.
                    if ((!s.activePage && !s.activeComponent) || !s.elements[ROOT_ELEMENT_ID])
                        return;
                    // Insert into the currently-selected container (or its nearest
                    // container ancestor), falling back to the page root.
                    const parentId = resolveInsertParent(s.elements, s.selectedElementIds[0] ?? null, ROOT_ELEMENT_ID);
                    if (result.kind === 'svg') {
                        const prepared = prepareSvgForInsert(result.svg);
                        if (!prepared)
                            return;
                        s.createSvgElement({
                            parentId,
                            x: 20,
                            y: 20,
                            width: Math.round(prepared.width ?? DEFAULT_IMAGE_SIZE),
                            height: Math.round(prepared.height ?? DEFAULT_IMAGE_SIZE),
                            svgSource: prepared.svgSource,
                            ...(prepared.viewBox !== undefined ? { viewBox: prepared.viewBox } : {}),
                            ...(prepared.fill !== undefined ? { fill: prepared.fill } : {}),
                            ...(prepared.stroke !== undefined ? { stroke: prepared.stroke } : {}),
                            ...(prepared.strokeWidth !== undefined
                                ? { strokeWidth: prepared.strokeWidth }
                                : {}),
                        });
                    }
                    else if (result.kind === 'image' && s.projectPath) {
                        const saved = await window.scamp.saveClipboardImage({
                            projectPath: s.projectPath,
                            dataUrl: result.dataUrl,
                        });
                        s.createImage({
                            parentId,
                            x: 20,
                            y: 20,
                            width: DEFAULT_IMAGE_SIZE,
                            height: DEFAULT_IMAGE_SIZE,
                            src: saved.relativePath,
                            alt: saved.fileName,
                        });
                    }
                })();
                return;
            }
            // Cmd/Ctrl+Z — undo. Cmd/Ctrl+Shift+Z — redo.
            if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
                if (isEditableTarget(e.target))
                    return;
                e.preventDefault();
                if (e.shiftKey) {
                    useHistoryStore.getState().redo();
                }
                else {
                    useHistoryStore.getState().undo();
                }
                return;
            }
            // Cmd/Ctrl+Shift+A — toggle the Scamp Agent, for signed-in users.
            if ((e.metaKey || e.ctrlKey) &&
                e.shiftKey &&
                (e.key === 'a' || e.key === 'A')) {
                if (isEditableTarget(e.target))
                    return;
                if (useAuthStore.getState().status !== 'signed-in')
                    return;
                e.preventDefault();
                const canvas = useCanvasStore.getState();
                canvas.setSidebarSection(canvas.sidebarSection === 'agent' ? 'pages' : 'agent');
                return;
            }
            // Cmd/Ctrl+Shift+H — toggle the left sidebar between History and the
            // Pages section (the rail's default).
            if ((e.metaKey || e.ctrlKey) &&
                e.shiftKey &&
                (e.key === 'h' || e.key === 'H')) {
                if (isEditableTarget(e.target))
                    return;
                e.preventDefault();
                const canvas = useCanvasStore.getState();
                canvas.setSidebarSection(canvas.sidebarSection === 'history' ? 'pages' : 'history');
                return;
            }
            // Cmd/Ctrl+G — wrap the current selection in a new flex group.
            if ((e.metaKey || e.ctrlKey) && (e.key === 'g' || e.key === 'G')) {
                if (isEditableTarget(e.target))
                    return;
                const state = useCanvasStore.getState();
                if (state.selectedElementIds.length === 0)
                    return;
                if (state.editingElementId)
                    return;
                e.preventDefault();
                state.groupElements(state.selectedElementIds);
                return;
            }
            // Ctrl+D / Cmd+D — duplicate the selected element(s).
            if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
                // Don't fire when the user is typing into an input, the CSS panel,
                // or a contentEditable text element.
                if (isEditableTarget(e.target))
                    return;
                const state = useCanvasStore.getState();
                if (state.selectedElementIds.length === 0)
                    return;
                if (state.editingElementId)
                    return;
                e.preventDefault();
                // Duplicate every selected element. Each call updates the store
                // and selects the new clone, so the final selection is the last
                // duplicate — fine for the common single-select case and reasonable
                // for multi-select too.
                for (const id of state.selectedElementIds) {
                    useCanvasStore.getState().duplicateElement(id);
                }
                return;
            }
            // Delete / Backspace — remove the selected element(s) (and any
            // descendants). The page root is protected by the store action.
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (isEditableTarget(e.target))
                    return;
                const state = useCanvasStore.getState();
                if (state.selectedElementIds.length === 0)
                    return;
                if (state.editingElementId)
                    return;
                e.preventDefault();
                // Phase 7: delete-prop-text-with-overrides warning. Only
                // relevant in the component editor — page-side deletes of
                // text don't have the prop concept. Walk the selection
                // for any prop-text whose name has an override on a
                // matching page instance.
                const activeName = state.activeComponent?.name ?? null;
                if (activeName !== null) {
                    const propsAtRisk = [];
                    for (const id of state.selectedElementIds) {
                        const el = state.elements[id];
                        if (!el || el.type !== 'text')
                            continue;
                        if (typeof el.prop !== 'string' || el.prop.length === 0)
                            continue;
                        propsAtRisk.push(el.prop);
                    }
                    if (propsAtRisk.length > 0) {
                        const usages = findInstanceUsagesAcrossPages(keyDeps.current.projectPages, activeName);
                        const overriding = usages.filter((u) => propsAtRisk.some((p) => Object.prototype.hasOwnProperty.call(u.propOverrides, p)));
                        if (overriding.length > 0) {
                            keyDeps.current.setDeletePropTextRequest({
                                elementIds: [...state.selectedElementIds],
                                propsAtRisk,
                                impactByPage: groupUsagesByPage(overriding),
                            });
                            return;
                        }
                    }
                }
                for (const id of state.selectedElementIds) {
                    if (id === state.rootElementId)
                        continue;
                    useCanvasStore.getState().deleteElement(id);
                }
                return;
            }
            // Arrow keys — nudge the selected element(s) by 1px, or 10px with
            // Shift. Only moves elements whose parent is non-flex (flex layout
            // owns the child's position). Matches Figma's convention.
            if (e.key === 'ArrowUp' ||
                e.key === 'ArrowDown' ||
                e.key === 'ArrowLeft' ||
                e.key === 'ArrowRight') {
                if (isEditableTarget(e.target))
                    return;
                const state = useCanvasStore.getState();
                if (state.selectedElementIds.length === 0)
                    return;
                if (state.editingElementId)
                    return;
                // Ignore modifier combos we don't own (Cmd/Ctrl+arrow is a
                // platform navigation shortcut; let the browser handle it).
                if (e.metaKey || e.ctrlKey || e.altKey)
                    return;
                const step = e.shiftKey ? 10 : 1;
                let dx = 0;
                let dy = 0;
                if (e.key === 'ArrowLeft')
                    dx = -step;
                else if (e.key === 'ArrowRight')
                    dx = step;
                else if (e.key === 'ArrowUp')
                    dy = -step;
                else if (e.key === 'ArrowDown')
                    dy = step;
                let moved = false;
                for (const id of state.selectedElementIds) {
                    if (id === state.rootElementId)
                        continue;
                    const el = state.elements[id];
                    if (!el || !el.parentId)
                        continue;
                    const parent = state.elements[el.parentId];
                    if (!parent)
                        continue;
                    // Flex layout owns child positions — nudge is meaningless.
                    if (parent.display === 'flex')
                        continue;
                    const clamped = clampToParent(el.x + dx, el.y + dy, el.widthValue, el.heightValue, parent.widthValue, parent.heightValue);
                    if (clamped.x !== el.x || clamped.y !== el.y) {
                        state.moveElement(id, Math.round(clamped.x), Math.round(clamped.y));
                        moved = true;
                    }
                }
                if (moved)
                    e.preventDefault();
                return;
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
        // Binds once: all closure values it reads (toggleTerminalPanel,
        // canPreview, openPreview, project.pages, setDeletePropTextRequest)
        // are read fresh via `keyDeps` (useLatest); everything else goes
        // through the store's getState().
    }, [keyDeps]);
    // Esc anywhere outside a text input exits the component editor
    // back to the prior page (or the project shell if entered from
    // the sidebar list). Only fires when activeComponent is non-null
    // — page-mode Esc is owned by the existing handlers above.
    const { activeComponent, latestExit } = componentEditor;
    useEffect(() => {
        // A view is a page's design: there is nothing to exit to.
        if (activeComponent === null || activeComponent.kind === 'view')
            return;
        const handler = (e) => {
            if (e.key !== 'Escape')
                return;
            // Skip when the user is mid-edit inside an input / textarea /
            // contentEditable — those have their own Esc semantics
            // (commit / cancel inline edits).
            const target = e.target;
            if (target) {
                const tag = target.tagName;
                if (tag === 'INPUT' ||
                    tag === 'TEXTAREA' ||
                    tag === 'SELECT' ||
                    target.isContentEditable) {
                    return;
                }
            }
            latestExit.current();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [activeComponent, latestExit]);
};
