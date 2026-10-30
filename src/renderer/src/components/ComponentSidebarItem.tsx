import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  COMPONENT_THUMBNAIL_UPDATED_EVENT,
  type ComponentThumbnailUpdatedDetail,
} from '../lib/componentThumbnail';
import { Tooltip } from './controls/Tooltip';
import styles from './ComponentSidebarItem.module.css';
import projectStyles from './ProjectShell.module.css';

type Props = {
  componentName: string;
  projectPath: string;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  /** Default true; views aren't draggable. */
  draggable?: boolean;
  onDragStart: (e: React.DragEvent<HTMLButtonElement>) => void;
};

/** Sidebar row with thumbnail. see docs/notes/components-thumbnails.md */
export const ComponentSidebarItem = ({
  componentName,
  projectPath,
  isActive,
  onClick,
  onContextMenu,
  draggable = true,
  onDragStart,
}: Props): JSX.Element => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const result = await window.scamp.readComponentThumbnail({
          projectPath,
          componentName,
        });
        if (cancelled) return;
        setThumbnailUrl(
          result.base64 ? `data:image/png;base64,${result.base64}` : null
        );
      } catch {
        if (!cancelled) setThumbnailUrl(null);
      }
    };
    void load();

    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<ComponentThumbnailUpdatedDetail>).detail;
      if (!detail) return;
      if (detail.componentName !== componentName) return;
      void load();
    };
    window.addEventListener(COMPONENT_THUMBNAIL_UPDATED_EVENT, handler);
    return () => {
      cancelled = true;
      window.removeEventListener(COMPONENT_THUMBNAIL_UPDATED_EVENT, handler);
    };
  }, [componentName, projectPath]);

  return (
    <button
      className={`${projectStyles.pageButton} ${styles.row} ${
        isActive ? projectStyles.pageActive : ''
      }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      type="button"
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
    >
      {thumbnailUrl !== null ? (
        <img
          className={styles.thumbnail}
          src={thumbnailUrl}
          alt=""
          aria-hidden="true"
        />
      ) : (
        <span className={styles.placeholder} aria-hidden="true" />
      )}
      <Tooltip label={componentName} onlyWhenTruncated>
        <span className={styles.label}>{componentName}</span>
      </Tooltip>
    </button>
  );
};
