import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { COMPONENT_THUMBNAIL_UPDATED_EVENT, } from '../lib/componentThumbnail';
import { Tooltip } from './controls/Tooltip';
import styles from './ComponentSidebarItem.module.css';
import projectStyles from './ProjectShell.module.css';
/** Sidebar row with thumbnail. see docs/notes/components-thumbnails.md */
export const ComponentSidebarItem = ({ componentName, projectPath, isActive, onClick, onContextMenu, draggable = true, onDragStart, }) => {
    const [thumbnailUrl, setThumbnailUrl] = useState(null);
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const result = await window.scamp.readComponentThumbnail({
                    projectPath,
                    componentName,
                });
                if (cancelled)
                    return;
                setThumbnailUrl(result.base64 ? `data:image/png;base64,${result.base64}` : null);
            }
            catch {
                if (!cancelled)
                    setThumbnailUrl(null);
            }
        };
        void load();
        const handler = (e) => {
            const detail = e.detail;
            if (!detail)
                return;
            if (detail.componentName !== componentName)
                return;
            void load();
        };
        window.addEventListener(COMPONENT_THUMBNAIL_UPDATED_EVENT, handler);
        return () => {
            cancelled = true;
            window.removeEventListener(COMPONENT_THUMBNAIL_UPDATED_EVENT, handler);
        };
    }, [componentName, projectPath]);
    return (_jsxs("button", { className: `${projectStyles.pageButton} ${styles.row} ${isActive ? projectStyles.pageActive : ''}`, onClick: onClick, onContextMenu: onContextMenu, type: "button", draggable: draggable, onDragStart: draggable ? onDragStart : undefined, children: [thumbnailUrl !== null ? (_jsx("img", { className: styles.thumbnail, src: thumbnailUrl, alt: "", "aria-hidden": "true" })) : (_jsx("span", { className: styles.placeholder, "aria-hidden": "true" })), _jsx(Tooltip, { label: componentName, onlyWhenTruncated: true, children: _jsx("span", { className: styles.label, children: componentName }) })] }));
};
