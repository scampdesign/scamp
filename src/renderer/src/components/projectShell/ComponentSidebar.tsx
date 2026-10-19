import { type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';

import type { ComponentFile, ComponentKind } from '@shared/types';
import { componentKindOf } from '@shared/types';
import { STARTERS, freeStarterName, starterFiles } from '@lib/starterComponents';

import { COMPONENT_DRAG_MIME } from '../../canvas/interactions/useComponentDrop';

import { ComponentNameInput } from '../ComponentNameInput';
import { ComponentSidebarItem } from '../ComponentSidebarItem';
import type { ActiveComponent, ComponentEdit } from './types';
import styles from '../ProjectShell.module.css';

type Props = {
  /** Components and views together; only components are listed here. */
  components: ComponentFile[];
  projectPath: string;
  componentEdit: ComponentEdit;
  componentEditError: string | null;
  renamingComponent: boolean;
  creatingComponent: boolean;
  activeComponent: ActiveComponent | null;
  setComponentEdit: Dispatch<SetStateAction<ComponentEdit>>;
  setComponentEditError: Dispatch<SetStateAction<string | null>>;
  handleAddComponent: (name: string, kind: ComponentKind, files?: { tsx: string; css: string }) => Promise<void>;
  handleRenameComponent: (oldName: string, newName: string) => Promise<boolean>;
  openComponent: (name: string, fromPage: string | null) => void;
  openComponentMenu: (e: ReactMouseEvent, componentName: string) => void;
};

/** The Components section of the left sidebar: list + inline add/rename. */
export const ComponentSidebar = ({
  components: allComponents,
  projectPath,
  componentEdit,
  componentEditError,
  renamingComponent,
  creatingComponent,
  activeComponent,
  setComponentEdit,
  setComponentEditError,
  handleAddComponent,
  handleRenameComponent,
  openComponent,
  openComponentMenu,
}: Props): JSX.Element => {
  const kind: ComponentKind = 'component';
  // Views (a page's design) live in the Pages list; they share this
  // namespace (see componentOps), so the inline input rejects a name
  // either list already uses.
  const components = allComponents.filter((c) => componentKindOf(c) === kind);
  const allNames = allComponents.map((c) => c.name);
  return (
    <div className={styles.sidebarSection}>
      <h2 className={styles.sidebarTitle}>Components</h2>
      <ul className={styles.pageList}>
        {components.map((component) => {
          const isRenaming =
            componentEdit !== null &&
            'rename' in componentEdit &&
            componentEdit.rename === component.name;
          if (isRenaming) {
            return (
              <li key={component.name}>
                <ComponentNameInput
                  initialValue={component.name}
                  existingNames={allNames.filter((n) => n !== component.name)}
                  onConfirm={(name) =>
                    void handleRenameComponent(component.name, name)
                  }
                  onCancel={() => {
                    if (renamingComponent) return;
                    setComponentEdit(null);
                    setComponentEditError(null);
                  }}
                  error={componentEditError}
                  busy={renamingComponent}
                />
              </li>
            );
          }
          return (
            <li key={component.name}>
              <ComponentSidebarItem
                componentName={component.name}
                projectPath={projectPath}
                isActive={activeComponent?.name === component.name}
                onClick={() => openComponent(component.name, null)}
                onContextMenu={(e) =>
                  openComponentMenu(e, component.name)
                }
                // HTML5 DnD source: dragging a component onto the
                // canvas inserts an instance inside whatever container
                // is under the cursor. The canvas interaction layer
                // reads this mime to tell a component-drag apart from
                // any other drag.
                onDragStart={(e) => {
                  e.dataTransfer.setData(COMPONENT_DRAG_MIME, component.name);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              />
            </li>
          );
        })}
        {componentEdit !== null && 'new' in componentEdit && componentEdit.new === kind && (
          <li>
            <ComponentNameInput
              existingNames={allNames}
              onConfirm={(name) => void handleAddComponent(name, kind)}
              onCancel={() => {
                setComponentEdit(null);
                setComponentEditError(null);
              }}
              error={componentEditError}
              busy={creatingComponent}
            />
          </li>
        )}
      </ul>
      {componentEdit === null && (
        <button
          className={styles.addPageButton}
          onClick={() => {
            setComponentEditError(null);
            setComponentEdit({ new: kind });
          }}
          type="button"
        >
          + Add Component
        </button>
      )}
      {componentEdit === null && (
        <div className={styles.starterRow} role="group" aria-label="Add a starter component">
          <span>Starters:</span>
          {STARTERS.map((starter) => (
            <button
              key={starter.name}
              type="button"
              className={styles.starterButton}
              title={starter.description}
              disabled={creatingComponent}
              onClick={() => {
                const name = freeStarterName(starter.name, allNames);
                void handleAddComponent(name, kind, starterFiles(starter.name, name));
              }}
            >
              {starter.name}
            </button>
          ))}
        </div>
      )}
      {componentEdit === null && componentEditError !== null && (
        <div className={styles.starterError} role="alert">
          {componentEditError}
        </div>
      )}
    </div>
  );
};
