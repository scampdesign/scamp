import { useMemo, useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import type { ScampElement } from '@lib/element';
import { SegmentedControl } from './controls/SegmentedControl';
import {
  REQUEST_REMOVE_SLOT_EVENT,
  type RequestRemoveSlotEventDetail,
} from './ElementContextMenu';
import { BindingSections, hasBindableData } from './DataBindings';
import { collectViewProps, enclosingRepeat } from '@lib/viewProps';
import styles from './DataPanel.module.css';
import propStyles from './PropertiesPanel.module.css';

// Data tab: component-only prop/locked toggle + per-instance overrides.
// see docs/notes/components-data-model.md
const PROP_NAME_RE = /^[a-z][a-zA-Z0-9]*$/;

/** Prop→Locked toggle dispatch; ProjectShell decides whether to warn. */
export const REQUEST_LOCK_PROP_EVENT = 'scamp:request-lock-prop';
export type RequestLockPropEventDetail = {
  elementId: string;
  componentName: string;
  propName: string;
};

type TextRow = {
  id: string;
  text: string;
  prop: string | undefined;
};

const collectTextDescendants = (
  elements: Record<string, ScampElement>,
  rootId: string
): TextRow[] => {
  const rows: TextRow[] = [];
  const walk = (id: string): void => {
    const el = elements[id];
    if (!el) return;
    if (el.type === 'text' && id !== rootId) {
      rows.push({ id, text: el.text ?? '', prop: el.prop });
    }
    for (const childId of el.childIds) walk(childId);
  };
  walk(rootId);
  return rows;
};

const TOGGLE_OPTIONS = [
  { value: 'locked' as const, label: 'Locked' },
  { value: 'prop' as const, label: 'Prop' },
];

type SlotRowData = { id: string; slot: string };

const collectSlotRows = (
  elements: Record<string, ScampElement>,
  rootId: string
): SlotRowData[] => {
  const rows: SlotRowData[] = [];
  const walk = (id: string): void => {
    const el = elements[id];
    if (!el) return;
    if (typeof el.slot === 'string' && el.slot.length > 0) {
      rows.push({ id, slot: el.slot });
    }
    for (const childId of el.childIds) walk(childId);
  };
  walk(rootId);
  return rows;
};

/** One slot row: a rename input + a "Remove" affordance. Slots are the
 *  `children`/`ReactNode` analog of text props. */
const SlotRow = ({
  row,
  otherSlotNames,
}: {
  row: SlotRowData;
  otherSlotNames: ReadonlyArray<string>;
}): JSX.Element => {
  const renameSlot = useCanvasStore((s) => s.renameSlot);
  const toggleSlotOnRect = useCanvasStore((s) => s.toggleSlotOnRect);
  const selectElement = useCanvasStore((s) => s.selectElement);
  const activeComponentName = useCanvasStore(
    (s) => s.activeComponent?.name ?? null
  );
  const [draftName, setDraftName] = useState(row.slot);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setDraftName(row.slot);
  }, [row.slot]);

  const commitRename = (): void => {
    const next = draftName.trim();
    if (next === row.slot) {
      setValidationError(null);
      return;
    }
    if (!PROP_NAME_RE.test(next)) {
      setValidationError('Use a lowercase identifier (e.g. header).');
      return;
    }
    if (otherSlotNames.includes(next)) {
      setValidationError('Slot names must be unique.');
      return;
    }
    setValidationError(null);
    renameSlot(row.id, next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setDraftName(row.slot);
      setValidationError(null);
      e.currentTarget.blur();
    }
  };

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={styles.slotBadge}
        onClick={() => selectElement(row.id)}
        title="Select this slot on the canvas"
      >
        ✦ slot
      </button>
      <div className={styles.renameWrap}>
        <input
          className={styles.renameInput}
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          aria-label="Slot name"
        />
        {validationError && (
          <div className={styles.renameError}>{validationError}</div>
        )}
      </div>
      <button
        type="button"
        className={styles.slotRemove}
        onClick={() => {
          // Route through ProjectShell so it can warn when instances on other
          // pages have content in this slot. see docs/archive/2026-07-16-component-slots-plan.md
          if (activeComponentName === null) {
            toggleSlotOnRect(row.id);
            return;
          }
          window.dispatchEvent(
            new CustomEvent<RequestRemoveSlotEventDetail>(
              REQUEST_REMOVE_SLOT_EVENT,
              {
                detail: {
                  elementId: row.id,
                  componentName: activeComponentName,
                  slotName: row.slot,
                },
              }
            )
          );
        }}
        title="Remove slot"
      >
        Remove
      </button>
    </div>
  );
};

const DataRow = ({
  row,
  otherPropNames,
}: {
  row: TextRow;
  otherPropNames: ReadonlyArray<string>;
}): JSX.Element => {
  const togglePropOnText = useCanvasStore((s) => s.togglePropOnText);
  const renamePropOnText = useCanvasStore((s) => s.renamePropOnText);
  const activeComponentName = useCanvasStore(
    (s) => s.activeComponent?.name ?? null
  );
  const [draftName, setDraftName] = useState(row.prop ?? '');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Resync draft when prop changes externally (undo, reload).
  useEffect(() => {
    setDraftName(row.prop ?? '');
  }, [row.prop]);

  const elements = useCanvasStore((s) => s.elements);
  const isProp = row.prop !== undefined;
  const validationError = (() => {
    if (!isProp) return null;
    if (draftName === row.prop) return null;
    // Inside a repeat, a text may bind a row field: `item.label`.
    if (draftName.includes('.')) {
      const repeat = enclosingRepeat(elements, row.id);
      if (repeat === null) return 'A row field needs a repeat above this element.';
      const [head, ...rest] = draftName.split('.');
      if (head !== repeat.as) return `Row fields start with ${repeat.as}.`;
      if (rest.length !== 1 || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rest[0] ?? '')) return 'Use one field: item.field';
      return null;
    }
    if (!PROP_NAME_RE.test(draftName)) {
      return 'Use lowerCamelCase letters / digits only.';
    }
    if (otherPropNames.includes(draftName)) {
      return 'Already used by another prop.';
    }
    return null;
  })();

  const commitRename = (): void => {
    if (!isProp) return;
    if (draftName === row.prop) return;
    if (validationError) return;
    renamePropOnText(row.id, draftName);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraftName(row.prop ?? '');
      inputRef.current?.blur();
    }
  };

  return (
    <div className={styles.row}>
      <div className={styles.preview} title={row.text || '(empty)'}>
        {row.text.length > 0 ? row.text : <em className={styles.emptyText}>(empty)</em>}
      </div>
      <SegmentedControl
        value={isProp ? 'prop' : 'locked'}
        options={TOGGLE_OPTIONS}
        onChange={(next) => {
          if ((next === 'prop') === isProp) return;
          if (next === 'prop') {
            togglePropOnText(row.id);
            return;
          }
          // Prop → Locked may warn cross-page; defer to ProjectShell.
          if (!activeComponentName || !row.prop) {
            togglePropOnText(row.id);
            return;
          }
          window.dispatchEvent(
            new CustomEvent<RequestLockPropEventDetail>(REQUEST_LOCK_PROP_EVENT, {
              detail: {
                elementId: row.id,
                componentName: activeComponentName,
                propName: row.prop,
              },
            })
          );
        }}
      />
      {isProp && (
        <div className={styles.renameWrap}>
          <input
            ref={inputRef}
            className={styles.renameInput}
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            aria-label="Prop name"
          />
          {validationError && (
            <div className={styles.renameError}>{validationError}</div>
          )}
        </div>
      )}
    </div>
  );
};

/** Component-editor: list text descendants with prop/locked toggle. */
type ViewBodyProps = {
  /**
   * The wrapper for the rows. The Data TAB owns the panel body and its
   * scroll; the Data SECTION in the empty state sits in a column that
   * scrolls as a whole, so it must not grab the height.
   */
  bodyClassName?: string;
  /**
   * Narrow to the selected element when it has data of its own. On in
   * the Data tab, off in the sidebar section, which is page-level and
   * shows regardless of what is selected.
   */
  followSelection?: boolean;
};

const ComponentDataView = ({
  bodyClassName = propStyles.uiPanelBody,
  followSelection = false,
}: ViewBodyProps = {}): JSX.Element => {
  const elements = useCanvasStore((s) => s.elements);
  const rootElementId = useCanvasStore((s) => s.rootElementId);
  const selectedId = useCanvasStore((s) => s.selectedElementIds[0] ?? null);

  const rows = useMemo(
    () => collectTextDescendants(elements, rootElementId),
    [elements, rootElementId]
  );

  // For each row's rename validator: every OTHER row's prop name.
  // Precomputing once means the rows don't each rebuild the same
  // set on every keystroke.
  const allPropNames = useMemo(
    () => rows.flatMap((r) => (r.prop !== undefined ? [r.prop] : [])),
    [rows]
  );

  const slotRows = useMemo(
    () => collectSlotRows(elements, rootElementId),
    [elements, rootElementId]
  );
  const allSlotNames = useMemo(() => slotRows.map((r) => r.slot), [slotRows]);

  const hasBindings = useMemo(
    () => collectViewProps(elements, rootElementId).some((p) => p.kind !== 'text' && p.kind !== 'slot'),
    [elements, rootElementId]
  );
  /**
   * Selecting a text element and opening Data should put its
   * prop/locked control in front of you, not a list of every text in
   * the view to hunt through. The tab narrows to the selected element
   * whenever that element has anything to show; `Show all` steps back
   * out, and changing the selection re-narrows.
   */
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setShowAll(false);
  }, [selectedId]);
  const selected = selectedId === null ? undefined : elements[selectedId];
  const canFocus =
    followSelection &&
    selectedId !== null &&
    selectedId !== rootElementId &&
    selected !== undefined &&
    (rows.some((r) => r.id === selectedId) ||
      slotRows.some((r) => r.id === selectedId) ||
      hasBindableData(selected));
  const focusedId = canFocus && !showAll ? selectedId : null;
  const visibleRows = focusedId === null ? rows : rows.filter((r) => r.id === focusedId);
  const visibleSlotRows =
    focusedId === null ? slotRows : slotRows.filter((r) => r.id === focusedId);

  const hasAttributeCandidates = useMemo(
    () =>
      Object.values(elements).some(
        (el) =>
          el.id !== rootElementId &&
          (el.type === 'component-instance' || Object.keys(el.attributes ?? {}).length > 0 ||
            ['a', 'button', 'input', 'textarea', 'select', 'form', 'dialog', 'video', 'iframe', 'label', 'time', 'blockquote'].includes(el.tag ?? ''))
      ),
    [elements, rootElementId]
  );

  if (rows.length === 0 && slotRows.length === 0 && !hasBindings && !hasAttributeCandidates) {
    return (
      <div className={bodyClassName}>
        <div className={styles.empty}>
          No props yet. Mark a text element as a prop, or right-click an
          element → "Repeat this…" or "Show only when…". A rectangle can
          also become a slot, so a page can nest content inside it.
        </div>
      </div>
    );
  }

  return (
    <div className={bodyClassName}>
      {focusedId !== null && (
        <div className={styles.filterBar} data-testid="data-filter-bar">
          <span>Showing the selected element</span>
          <button type="button" className={styles.filterReset} onClick={() => setShowAll(true)}>
            Show all
          </button>
        </div>
      )}
      {visibleRows.length > 0 && (
        <>
          {focusedId === null && (
            <div className={styles.intro}>
              Mark a text element as a prop to let pages override its content
              per-instance. Locked text stays the same on every instance.
            </div>
          )}
          <div className={styles.rows}>
            {visibleRows.map((row) => (
              <DataRow
                key={row.id}
                row={row}
                otherPropNames={allPropNames.filter((n) => n !== row.prop)}
              />
            ))}
          </div>
        </>
      )}
      {visibleSlotRows.length > 0 && (
        <>
          {focusedId === null && (
            <div className={styles.intro}>
              Slots let pages nest their own elements inside this component
              (React <code>children</code>). Rename or remove them here.
            </div>
          )}
          <div className={styles.rows}>
            {visibleSlotRows.map((row) => (
              <SlotRow
                key={row.id}
                row={row}
                otherSlotNames={allSlotNames.filter((n) => n !== row.slot)}
              />
            ))}
          </div>
        </>
      )}
      <BindingSections onlyElementId={focusedId} />
    </div>
  );
};

type PropDeclaration = {
  name: string;
  defaultText: string;
};

const collectPropDeclarations = (
  elements: Record<string, ScampElement>,
  rootId: string
): PropDeclaration[] => {
  const out: PropDeclaration[] = [];
  const seen = new Set<string>();
  const walk = (id: string): void => {
    const el = elements[id];
    if (!el) return;
    if (
      el.type === 'text' &&
      typeof el.prop === 'string' &&
      el.prop.length > 0 &&
      !seen.has(el.prop)
    ) {
      seen.add(el.prop);
      out.push({ name: el.prop, defaultText: el.text ?? '' });
    }
    for (const childId of el.childIds) walk(childId);
  };
  walk(rootId);
  return out;
};

/**
 * One row of the instance-side Data tab: prop name label + a
 * textarea bound to the override (or the component default when
 * no override is set). A "Reset" button surfaces only when an
 * override exists, so the row visually distinguishes
 * "overridden" from "showing default".
 */
const InstanceRow = ({
  instanceId,
  declaration,
  overrideValue,
}: {
  instanceId: string;
  declaration: PropDeclaration;
  overrideValue: string | undefined;
}): JSX.Element => {
  const setPropOverride = useCanvasStore((s) => s.setPropOverride);
  const clearPropOverride = useCanvasStore((s) => s.clearPropOverride);
  // Draft committed on blur — avoids one history entry per keystroke.
  const initial = overrideValue ?? declaration.defaultText;
  const [draft, setDraft] = useState(initial);
  useEffect(() => {
    setDraft(overrideValue ?? declaration.defaultText);
  }, [overrideValue, declaration.defaultText]);

  const isOverridden = overrideValue !== undefined;
  const commit = (): void => {
    if (draft === initial) return;
    setPropOverride(instanceId, declaration.name, draft);
  };

  return (
    <div className={styles.row}>
      <div className={styles.propLabelRow}>
        <code className={styles.propName}>{declaration.name}</code>
        {isOverridden && (
          <button
            type="button"
            className={styles.resetButton}
            onClick={() => clearPropOverride(instanceId, declaration.name)}
            aria-label={`Reset ${declaration.name} to component default`}
          >
            Reset
          </button>
        )}
      </div>
      <textarea
        className={styles.overrideInput}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        rows={2}
        spellCheck={false}
        aria-label={`Override value for ${declaration.name}`}
      />
    </div>
  );
};

/** Page-side: one row per declared prop of the selected instance. */
const InstanceDataView = (): JSX.Element => {
  const instance = useCanvasStore((s) => {
    const selectedId = s.selectedElementIds[0];
    if (!selectedId) return null;
    const el = s.elements[selectedId];
    return el && el.type === 'component-instance' ? el : null;
  });
  const componentTree = useCanvasStore((s) => {
    const name = instance?.componentName;
    if (!name) return undefined;
    return s.componentTrees[name];
  });

  const declarations = useMemo(() => {
    if (!componentTree) return [] as PropDeclaration[];
    return collectPropDeclarations(componentTree.elements, componentTree.rootId);
  }, [componentTree]);

  // The component's declared slots (rectangles with a `slot` marker).
  const slotNames = useMemo(() => {
    if (!componentTree) return [] as string[];
    return Object.values(componentTree.elements)
      .filter((e) => typeof e.slot === 'string' && e.slot.length > 0)
      .map((e) => e.slot as string);
  }, [componentTree]);

  // Count how much content the instance has placed in each slot.
  const elements = useCanvasStore((s) => s.elements);
  const slotCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const name of slotNames) counts.set(name, 0);
    const single = slotNames.length === 1;
    for (const id of instance?.childIds ?? []) {
      const child = elements[id];
      const eff =
        child?.slotName && child.slotName.length > 0 ? child.slotName : 'children';
      const target = single ? slotNames[0]! : eff;
      if (counts.has(target)) counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    return counts;
  }, [slotNames, instance?.childIds, elements]);

  if (!instance) {
    return (
      <div className={propStyles.uiPanelBody}>
        <div className={styles.empty}>Select a component on the canvas.</div>
      </div>
    );
  }
  if (declarations.length === 0 && slotNames.length === 0) {
    return (
      <div className={propStyles.uiPanelBody}>
        <div className={styles.empty}>
          {instance.componentName ?? 'This component'} has no props or slots.
          Open the component editor to add them.
        </div>
      </div>
    );
  }

  const overrides = instance.propOverrides ?? {};
  return (
    <div className={propStyles.uiPanelBody}>
      {declarations.length > 0 && (
        <>
          <div className={styles.intro}>
            Override the text content of this {instance.componentName} instance.
            Empty an override and Reset to restore the component default.
          </div>
          <div className={styles.rows}>
            {declarations.map((decl) => (
              <InstanceRow
                key={decl.name}
                instanceId={instance.id}
                declaration={decl}
                overrideValue={
                  Object.prototype.hasOwnProperty.call(overrides, decl.name)
                    ? overrides[decl.name]
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}
      {slotNames.length > 0 && (
        <>
          <div className={styles.intro}>
            Slots — drag elements onto this instance's slot areas on the
            canvas to fill them.
          </div>
          <div className={styles.rows}>
            {slotNames.map((name) => {
              const count = slotCounts.get(name) ?? 0;
              return (
                <div key={name} className={styles.row}>
                  <span className={styles.slotBadge}>✦ {name}</span>
                  <span
                    style={{
                      fontSize: 12,
                      color:
                        count > 0
                          ? 'var(--text-primary)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {count > 0
                      ? `● ${count} element${count === 1 ? '' : 's'}`
                      : '○ Empty'}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export const DataPanel = (): JSX.Element => {
  const isComponentEditing = useCanvasStore((s) => s.activeComponent !== null);
  return isComponentEditing ? (
    <ComponentDataView followSelection />
  ) : (
    <InstanceDataView />
  );
};

/**
 * The open view's data as a section of the properties panel's empty
 * state, beside Routes: its props, slots, repeats, show flags, bound
 * attributes, and events. Page-level, like a route, which is why it
 * doesn't wait for a selection. see docs/notes/routes-in-the-app.md
 */
/**
 * How many props the open view declares — what the Data section's
 * header shows, so a collapsed section still says whether there is
 * anything in it. Counts every kind: text, attribute, boolean,
 * repeat, show, event, slot.
 */
export const useViewDataCount = (): number => {
  const elements = useCanvasStore((s) => s.elements);
  const rootElementId = useCanvasStore((s) => s.rootElementId);
  return useMemo(
    () => collectViewProps(elements, rootElementId).length,
    [elements, rootElementId]
  );
};

export const ViewDataSection = (): JSX.Element => (
  <ComponentDataView bodyClassName={styles.sectionBody} />
);
