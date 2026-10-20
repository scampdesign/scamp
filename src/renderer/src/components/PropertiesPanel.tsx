import type { ReactNode } from 'react';
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

const SHORTCUTS: ReadonlyArray<{ keys: string; description: string }> = [
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

const ShortcutsTable = (): JSX.Element => (
  <table className={styles.shortcutsTable}>
      <tbody>
        {SHORTCUTS.map((s) => (
          <tr key={s.keys}>
            <td className={styles.shortcutKeys}>{s.keys}</td>
            <td className={styles.shortcutDesc}>{s.description}</td>
          </tr>
      ))}
    </tbody>
  </table>
);

type Props = {
  /**
   * Page-level content for the empty state, above the shortcuts: the
   * Routes section of a Scamp-framework project. Passed in rather than
   * read here so this panel stays about the selected element.
   */
  routesSection?: ReactNode;
  /**
   * An offer that belongs to the project rather than to an element: the
   * Next.js → Scamp framework migration. Below the page's own sections,
   * above the shortcuts. see docs/notes/nextjs-sunset.md
   */
  migrationNotice?: ReactNode;
};

export const PropertiesPanel = ({
  routesSection,
  migrationNotice,
}: Props): JSX.Element => {
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
    return (
      <aside
        className={styles.panel}
        data-testid="properties-panel"
        data-panel-mode="empty"
      >
        <div className={styles.emptyBody}>
          {isComponent && <VariantsSection />}
          {/* Routes point at pages, never at a component. */}
          {!isComponent && routesSection}
          {isComponentEditing && (
            <div data-testid="view-data-section">
              <Section title="Data" collapsible defaultOpen={false} count={dataCount}>
                <ViewDataSection />
              </Section>
            </div>
          )}
          {migrationNotice}
          <Section title="Keyboard Shortcuts" collapsible defaultOpen={false}>
            <ShortcutsTable />
          </Section>
          {/* Last and closed, with its count on the header to say when
              there's something to look at. see ChecksSection.tsx */}
          <ChecksSection />
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={styles.panel}
      data-testid="properties-panel"
      data-panel-mode={panelMode}
    >
      <PanelHeader />
      <PanelModeToggle />
      {panelMode === 'ui' && <StateSwitcher />}
      {panelMode === 'ui' && isComponent && selectedId === ROOT_ELEMENT_ID && <VariantsSection />}
      {panelMode === 'data' ? (
        <DataPanel />
      ) : panelMode === 'ui' ? (
        <UiPanel />
      ) : (
        <CssPanel />
      )}
    </aside>
  );
};
