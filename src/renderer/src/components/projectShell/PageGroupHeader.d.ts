import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
type DragHandlers = {
    draggable: boolean;
    onDragStart: (e: DragEvent<HTMLElement>) => void;
    onDragOver: (e: DragEvent<HTMLElement>) => void;
    onDragLeave: () => void;
    onDrop: (e: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
};
type Props = {
    name: string;
    collapsed: boolean;
    /** The open page is inside this group while it's collapsed. */
    holdsActivePage: boolean;
    renaming: boolean;
    /** The drop indicator class for this header, if something is dragged over it. */
    dropClass: string;
    drag: DragHandlers;
    onToggle: () => void;
    onContextMenu: (e: ReactMouseEvent) => void;
    /** Why a proposed name can't be used, or null. */
    nameError: (name: string) => string | null;
    onRename: (name: string) => void;
    onCancelRename: () => void;
};
/** A group's row in the Pages list: disclosure and name, or its rename field. */
export declare const PageGroupHeader: ({ name, collapsed, holdsActivePage, renaming, dropClass, drag, onToggle, onContextMenu, nameError, onRename, onCancelRename, }: Props) => JSX.Element;
export {};
