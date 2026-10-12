import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import styles from '../ProjectShell.module.css';
import { PageGroupNameInput } from './PageGroupNameInput';
/** A group's row in the Pages list: disclosure and name, or its rename field. */
export const PageGroupHeader = ({ name, collapsed, holdsActivePage, renaming, dropClass, drag, onToggle, onContextMenu, nameError, onRename, onCancelRename, }) => {
    if (renaming) {
        return (_jsx(PageGroupNameInput, { initialValue: name, nameError: nameError, onConfirm: onRename, onCancel: onCancelRename }));
    }
    return (_jsxs("button", { type: "button", className: `${styles.groupHeader} ${dropClass}`, "aria-expanded": !collapsed, "data-testid": "page-group", "data-group": name, onClick: onToggle, onContextMenu: onContextMenu, ...drag, children: [collapsed ? _jsx(IconChevronRight, { size: 12 }) : _jsx(IconChevronDown, { size: 12 }), _jsx("span", { className: styles.groupName, children: name }), collapsed && holdsActivePage && (_jsx("span", { className: styles.groupActiveDot, "data-testid": "page-group-active", "aria-label": "Holds the open page" }))] }));
};
