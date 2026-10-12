import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { viewNameForPage, viewSlugFor } from '@shared/templates';
import { ConfirmDialog } from '../ConfirmDialog';
import { CreateComponentDialog } from '../CreateComponentDialog';
import { PageContextMenu } from '../PageContextMenu';
import { ElementContextMenu } from '../ElementContextMenu';
/**
 * All of ProjectShell's floating UI: the page/component right-click menus,
 * the element context menu, and every confirmation dialog (delete page,
 * convert-to-component, lock-prop, delete-component, delete-prop-text,
 * detach). Purely presentational — state + handlers come from the page /
 * component / instance-flow hooks via props.
 */
export const ProjectModals = ({ components, instanceFlows, pageMenu, buildMenuItems, moveItemsFor, closePageMenu, deletingPageName, deletePageError, handleDeletePage, setDeletingPageName, setDeletePageError, componentMenu, closeComponentMenu, setComponentEdit, setComponentEditError, requestDeleteComponent, deletingComponent, componentDeleteBusy, handleConfirmDeleteComponent, setDeletingComponent, convertingPage, setConvertingPage, convertPageBusy, convertPageError, handleConfirmConvertPage, startRenameView, }) => {
    // Local binding so the `!== null` guard narrows it for the dialog's
    // onConfirm closure (a property access wouldn't narrow).
    const convertElementId = instanceFlows.convertElementId;
    return (_jsxs(_Fragment, { children: [pageMenu && (_jsx(PageContextMenu, { x: pageMenu.x, y: pageMenu.y, items: [...buildMenuItems(pageMenu.pageName), ...moveItemsFor(pageMenu.pageName)], onClose: closePageMenu })), componentMenu && (_jsx(PageContextMenu, { x: componentMenu.x, y: componentMenu.y, items: [
                    {
                        label: 'Rename…',
                        onSelect: () => {
                            if (componentMenu.kind === 'view') {
                                startRenameView(componentMenu.componentName);
                                return;
                            }
                            setComponentEditError(null);
                            setComponentEdit({ rename: componentMenu.componentName });
                        },
                    },
                    {
                        label: componentMenu.kind === 'view' ? 'Delete…' : 'Delete component…',
                        destructive: true,
                        onSelect: () => requestDeleteComponent(componentMenu.componentName),
                    },
                    ...(componentMenu.kind === 'view' ? moveItemsFor(viewSlugFor(componentMenu.componentName)) : []),
                ], onClose: closeComponentMenu })), _jsx(ElementContextMenu, {}), deletingPageName && (_jsx(ConfirmDialog, { title: `Delete page "${deletingPageName}"?`, message: `This will remove ${deletingPageName}.tsx and ${deletingPageName}.module.css from your project folder. This cannot be undone.`, confirmLabel: "Delete", cancelLabel: "Cancel", variant: "destructive", error: deletePageError, onConfirm: () => void handleDeletePage(deletingPageName), onCancel: () => {
                    setDeletingPageName(null);
                    setDeletePageError(null);
                } })), convertElementId !== null && (_jsx(CreateComponentDialog, { existingNames: components.map((c) => c.name), error: instanceFlows.convertError, busy: instanceFlows.convertingComponent, onConfirm: (name) => void instanceFlows.handleConvertToComponent(convertElementId, name), onCancel: instanceFlows.cancelConvert })), instanceFlows.lockPropRequest !== null && (_jsx(ConfirmDialog, { title: `Lock "${instanceFlows.lockPropRequest.propName}"?`, message: `This will drop the override on ${instanceFlows.lockPropRequest.impactByPage
                    .map((g) => `${g.count} instance${g.count === 1 ? '' : 's'} on ${g.pageName}`)
                    .join(', ')}. The component-side default will render in their place.`, confirmLabel: "Lock prop", variant: "destructive", onConfirm: instanceFlows.handleConfirmLockProp, onCancel: instanceFlows.cancelLockProp })), convertingPage !== null && (_jsx(ConfirmDialog, { title: `Convert "${convertingPage}" to a view?`, message: convertPageError ??
                    `The page's elements move to views/${viewNameForPage(convertingPage)}/ and the page file becomes a one-line wrapper that renders the view, so it still previews at the same route. A snapshot is taken first.`, confirmLabel: convertPageBusy ? 'Converting…' : 'Convert to view', onConfirm: () => void handleConfirmConvertPage(), onCancel: () => {
                    if (convertPageBusy)
                        return;
                    setConvertingPage(null);
                } })), deletingComponent !== null && (_jsx(ConfirmDialog, { title: deletingComponent.kind === 'view'
                    ? `Delete page "${viewSlugFor(deletingComponent.componentName)}"?`
                    : `Delete component "${deletingComponent.componentName}"?`, message: deletingComponent.kind === 'view'
                    ? `Removes views/${deletingComponent.componentName}/ (the page's design) and the route file that previews it.`
                    : deletingComponent.impactByPage.length === 0
                        ? `Removes the components/${deletingComponent.componentName}/ folder. No instances on any page.`
                        : `Removes the components/${deletingComponent.componentName}/ folder AND every instance from: ${deletingComponent.impactByPage
                            .map((g) => `${g.pageName} (${g.count} instance${g.count === 1 ? '' : 's'})`)
                            .join(', ')}. This cannot be undone.`, confirmLabel: componentDeleteBusy
                    ? 'Deleting…'
                    : deletingComponent.kind === 'view'
                        ? 'Delete page'
                        : 'Delete component', variant: "destructive", onConfirm: () => void handleConfirmDeleteComponent(), onCancel: () => {
                    if (componentDeleteBusy)
                        return;
                    setDeletingComponent(null);
                } })), instanceFlows.deletePropTextRequest !== null && (_jsx(ConfirmDialog, { title: instanceFlows.deletePropTextRequest.propsAtRisk.length === 1
                    ? `Delete prop "${instanceFlows.deletePropTextRequest.propsAtRisk[0]}"?`
                    : 'Delete prop text elements?', message: `Existing overrides on ${instanceFlows.deletePropTextRequest.impactByPage
                    .map((g) => `${g.count} instance${g.count === 1 ? '' : 's'} on ${g.pageName}`)
                    .join(', ')} will no longer have an effect. The pages keep the attribute on disk until they re-save.`, confirmLabel: "Delete", variant: "destructive", onConfirm: instanceFlows.handleConfirmDeletePropText, onCancel: instanceFlows.cancelDeletePropText })), instanceFlows.detachRequest !== null && (_jsx(ConfirmDialog, { title: `Detach ${instanceFlows.detachRequest.componentName} instance?`, message: instanceFlows.detachRequest.overrideCount > 0
                    ? `The component's design will be copied directly into this page. Future edits to ${instanceFlows.detachRequest.componentName} won't update this copy. Your ${instanceFlows.detachRequest.overrideCount} override${instanceFlows.detachRequest.overrideCount === 1 ? '' : 's'} will be baked in as literal text. This cannot be undone with re-attach.`
                    : `The component's design will be copied directly into this page. Future edits to ${instanceFlows.detachRequest.componentName} won't update this copy. This cannot be undone with re-attach.`, confirmLabel: "Detach", variant: "destructive", onConfirm: instanceFlows.handleConfirmDetach, onCancel: instanceFlows.cancelDetach })), instanceFlows.slotRemovalRequest !== null && (_jsx(ConfirmDialog, { title: `Remove slot "${instanceFlows.slotRemovalRequest.slotName}"?`, message: `Content in ${instanceFlows.slotRemovalRequest.impactByPage
                    .map((g) => `${g.count} instance${g.count === 1 ? '' : 's'} on ${g.pageName}`)
                    .join(', ')} will no longer render. The pages keep that content on disk until you re-place it.`, confirmLabel: "Remove slot", variant: "destructive", onConfirm: instanceFlows.handleConfirmRemoveSlot, onCancel: instanceFlows.cancelRemoveSlot }))] }));
};
