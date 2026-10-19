import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import type { VariantAxis } from '@lib/element';
import {
  addVariantValue,
  combinationLimitError,
  keyFor,
  makeVariantDefault,
  moveVariantValue,
  nextValueName,
  removeVariantAxis,
  removeVariantValue,
  renameVariantAxis,
  renameVariantValue,
  variantAxisError,
  variantValueError,
} from '@lib/variantAxes';
import styles from './VariantsSection.module.css';

type Props = {
  axis: VariantAxis;
  /** Every axis, for the keys an edit leaves you on. */
  axes: ReadonlyArray<VariantAxis>;
  /** The frame being edited: each axis's value. */
  picks: Readonly<Record<string, string>>;
  /** Variants are desktop only, like states. */
  disabled: boolean;
  /** A value to open for renaming when the row first draws: a just-added axis's new value. */
  renameOnMount?: string;
};

/** What's being renamed or confirmed: the axis itself, or one of its values. */
type Target = { kind: 'axis' } | { kind: 'value'; value: string };

const sameTarget = (a: Target | null, b: Target): boolean =>
  a !== null && a.kind === b.kind && (a.kind === 'axis' || (b.kind === 'value' && a.value === b.value));

const DRAG_MIME = 'application/x-scamp-variant-value';

/**
 * One variant property: its values as chips, in order. Click a value to
 * edit that frame, drag one to reorder, double-click a name to rename
 * it. The selected value can be made the default or removed.
 * see docs/plans/component-variants-plan.md, phase 6
 */
export const VariantAxisRow = ({ axis, axes, picks, disabled, renameOnMount }: Props): JSX.Element => {
  const setActiveVariant = useCanvasStore((s) => s.setActiveVariant);
  const editVariants = useCanvasStore((s) => s.editVariants);
  const [renaming, setRenaming] = useState<{ target: Target; draft: string } | null>(
    renameOnMount === undefined ? null : { target: { kind: 'value', value: renameOnMount }, draft: renameOnMount }
  );
  const [confirming, setConfirming] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = picks[axis.prop] ?? axis.defaultValue;
  /** The axes after replacing this one, and the key `nextPicks` lands on with them. */
  const keyAfter = (next: VariantAxis | null, nextPicks: Record<string, string>): string | null => {
    const nextAxes = axes.flatMap((a) => (a.prop !== axis.prop ? [a] : next === null ? [] : [next]));
    return keyFor(nextAxes, nextPicks);
  };

  const startRename = (target: Target): void => {
    setConfirming(null);
    setError(null);
    setRenaming({ target, draft: target.kind === 'axis' ? axis.prop : target.value });
  };

  const commitRename = (): void => {
    if (renaming === null) return;
    const { target, draft } = renaming;
    const name = draft.trim();
    if (target.kind === 'axis') {
      if (name !== axis.prop) {
        const problem = variantAxisError(useCanvasStore.getState().elements, name, axis.prop);
        if (problem !== null) return setError(problem);
        const { [axis.prop]: value = axis.defaultValue, ...rest } = picks;
        editVariants(
          (elements) => renameVariantAxis(elements, axis.prop, name),
          keyAfter({ ...axis, prop: name }, { ...rest, [name]: value })
        );
      }
    } else if (name !== target.value) {
      const problem = variantValueError(axis, name, target.value);
      if (problem !== null) return setError(problem);
      const renamed: VariantAxis = {
        ...axis,
        values: axis.values.map((v) => (v === target.value ? name : v)),
        defaultValue: axis.defaultValue === target.value ? name : axis.defaultValue,
      };
      editVariants(
        (elements) => renameVariantValue(elements, axis.prop, target.value, name),
        keyAfter(renamed, { ...picks, [axis.prop]: selected === target.value ? name : selected })
      );
    }
    setRenaming(null);
    setError(null);
  };

  const handleRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') {
      setRenaming(null);
      setError(null);
    }
  };

  const handleAddValue = (): void => {
    const name = nextValueName(axis);
    const grown: VariantAxis = { ...axis, values: [...axis.values, name] };
    const problem = combinationLimitError(axes, axes.map((a) => (a.prop === axis.prop ? grown : a)));
    if (problem !== null) return setError(problem);
    // The new value starts as a copy of the look being edited.
    editVariants((elements) => addVariantValue(elements, axis.prop, name, selected), keyAfter(grown, { ...picks, [axis.prop]: name }));
    startRename({ kind: 'value', value: name });
  };

  const handleRemove = (target: Target): void => {
    setConfirming(null);
    if (target.kind === 'axis') {
      const { [axis.prop]: _dropped, ...rest } = picks;
      editVariants((elements) => removeVariantAxis(elements, axis.prop), keyAfter(null, rest));
      return;
    }
    const shrunk: VariantAxis = { ...axis, values: axis.values.filter((v) => v !== target.value) };
    editVariants(
      (elements) => removeVariantValue(elements, axis.prop, target.value),
      keyAfter(shrunk, { ...picks, [axis.prop]: selected === target.value ? axis.defaultValue : selected })
    );
  };

  const handleMakeDefault = (): void => {
    const next: VariantAxis = { ...axis, defaultValue: selected, values: [selected, ...axis.values.filter((v) => v !== selected)] };
    editVariants((elements) => makeVariantDefault(elements, axis.prop, selected), keyAfter(next, { ...picks }));
  };

  const handleDrop = (e: DragEvent<HTMLButtonElement>, toIndex: number): void => {
    const value = e.dataTransfer.getData(DRAG_MIME);
    if (value === '') return;
    e.preventDefault();
    editVariants((elements) => moveVariantValue(elements, axis.prop, value, toIndex));
  };

  const renameInput = (label: string): JSX.Element => (
    <input
      className={styles.renameInput}
      aria-label={label}
      autoFocus
      value={renaming?.draft ?? ''}
      onChange={(e) => setRenaming((r) => (r === null ? r : { ...r, draft: e.target.value }))}
      onKeyDown={handleRenameKeyDown}
      onBlur={commitRename}
    />
  );

  const confirmRow = (target: Target, text: string): JSX.Element => (
    <span className={styles.confirm} role="group" aria-label="Confirm removal">
      <span>{text}</span>
      <button type="button" className={styles.confirmRemove} onClick={() => handleRemove(target)}>
        Remove
      </button>
      <button type="button" className={styles.confirmCancel} onClick={() => setConfirming(null)}>
        Cancel
      </button>
    </span>
  );

  const axisTarget: Target = { kind: 'axis' };

  return (
    <div className={styles.axis} data-testid={`variant-axis-${axis.prop}`}>
      <div className={styles.axisHeader}>
        {sameTarget(renaming?.target ?? null, axisTarget) ? (
          renameInput('Property name')
        ) : (
          <span className={styles.axisName} onDoubleClick={() => startRename(axisTarget)} title="Double-click to rename">
            {axis.prop}
          </span>
        )}
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setConfirming(axisTarget)}
          aria-label={`Remove the ${axis.prop} property`}
          title={`Remove the ${axis.prop} property`}
        >
          Remove
        </button>
      </div>
      <div className={styles.chips} role="radiogroup" aria-label={`${axis.prop} value`}>
        {axis.values.map((value, index) => {
          const target: Target = { kind: 'value', value };
          if (sameTarget(renaming?.target ?? null, target)) return <span key={value}>{renameInput('Value name')}</span>;
          const isSelected = value === selected;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              draggable={!disabled}
              className={`${styles.chip} ${isSelected ? styles.chipActive : ''}`}
              onClick={() => setActiveVariant(keyFor(axes, { ...picks, [axis.prop]: value }))}
              onDoubleClick={() => startRename(target)}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_MIME, value);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault();
              }}
              onDrop={(e) => handleDrop(e, index)}
              title={value === axis.defaultValue ? 'The default. Drag to reorder, double-click to rename' : 'Drag to reorder, double-click to rename'}
            >
              {value}
              {value === axis.defaultValue && <span className={styles.defaultMark} aria-label="default"> ●</span>}
            </button>
          );
        })}
        <button
          type="button"
          className={styles.chip}
          disabled={disabled}
          onClick={handleAddValue}
          aria-label={`Add a ${axis.prop} value`}
          title={`Add a ${axis.prop} value`}
        >
          +
        </button>
      </div>
      {confirming !== null && confirming.kind === 'value'
        ? confirmRow(confirming, `Remove ${confirming.value} and its styles?`)
        : confirming !== null
          ? confirmRow(confirming, `Remove ${axis.prop}, its values, and their styles?`)
          : selected !== axis.defaultValue && (
              <div className={styles.valueActions}>
                <button type="button" className={styles.iconButton} onClick={handleMakeDefault} disabled={disabled}>
                  Make {selected} the default
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setConfirming({ kind: 'value', value: selected })}
                  aria-label={`Remove ${selected}`}
                >
                  Remove {selected}
                </button>
              </div>
            )}
      {error !== null && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
};
