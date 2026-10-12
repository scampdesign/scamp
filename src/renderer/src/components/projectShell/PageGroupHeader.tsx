import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';

import styles from '../ProjectShell.module.css';
import { PageGroupNameInput } from './PageGroupNameInput';

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
export const PageGroupHeader = ({
  name,
  collapsed,
  holdsActivePage,
  renaming,
  dropClass,
  drag,
  onToggle,
  onContextMenu,
  nameError,
  onRename,
  onCancelRename,
}: Props): JSX.Element => {
  if (renaming) {
    return (
      <PageGroupNameInput initialValue={name} nameError={nameError} onConfirm={onRename} onCancel={onCancelRename} />
    );
  }

  return (
    <button
      type="button"
      className={`${styles.groupHeader} ${dropClass}`}
      aria-expanded={!collapsed}
      data-testid="page-group"
      data-group={name}
      onClick={onToggle}
      onContextMenu={onContextMenu}
      {...drag}
    >
      {collapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
      <span className={styles.groupName}>{name}</span>
      {collapsed && holdsActivePage && (
        <span className={styles.groupActiveDot} data-testid="page-group-active" aria-label="Holds the open page" />
      )}
    </button>
  );
};
