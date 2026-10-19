import { useState, type KeyboardEvent } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { variantKey, type VariantAxis } from '@lib/element';
import {
  addVariantValue,
  nextValueName,
  parseVariantKey,
  removeVariantAxis,
  removeVariantValue,
  renameVariantAxis,
  renameVariantValue,
  variantAxisError,
  variantValueError,
} from '@lib/variantAxes';
import styles from './VariantBar.module.css';

type Props = {
  axis: VariantAxis;
  /** Variants are desktop only, like states. */
  disabled: boolean;
  /** A value to open for renaming when the row first draws: a just-added axis's new value. */
  renameOnMount?: string;
};

/** What's being renamed or confirmed: the axis itself, or one of its values. */
type Target = { kind: 'axis' } | { kind: 'value'; value: string };

const sameTarget = (a: Target | null, b: Target): boolean =>
  a !== null && a.kind === b.kind && (a.kind === 'axis' || (b.kind === 'value' && a.value === b.value));

/**
 * One variant axis: its values as segments. Click a value to edit it,
 * double-click a name to rename it, and use × to remove the selected
 * value or the axis. see docs/plans/component-variants-plan.md
 */
export const VariantAxisRow = ({ axis, disabled, renameOnMount }: Props): JSX.Element => {
  const activeVariantKey = useCanvasStore((s) => s.activeVariantKey);
  const setActiveVariant = useCanvasStore((s) => s.setActiveVariant);
  const editVariants = useCanvasStore((s) => s.editVariants);
  const [renaming, setRenaming] = useState<{ target: Target; draft: string } | null>(
    renameOnMount === undefined ? null : { target: { kind: 'value', value: renameOnMount }, draft: renameOnMount }
  );
  const [confirming, setConfirming] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = activeVariantKey === null ? null : parseVariantKey(activeVariantKey);
  // Another axis's value leaves this one at its default.
  const selected = active !== null && active.axis === axis.prop ? active.value : axis.defaultValue;
  const keyFor = (value: string): string | null => (value === axis.defaultValue ? null : variantKey(axis.prop, value));

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
        const nextKey = active !== null && active.axis === axis.prop ? variantKey(name, active.value) : undefined;
        editVariants((elements) => renameVariantAxis(elements, axis.prop, name), nextKey);
      }
    } else if (name !== target.value) {
      const problem = variantValueError(axis, name, target.value);
      if (problem !== null) return setError(problem);
      const nextKey = selected === target.value && target.value !== axis.defaultValue ? variantKey(axis.prop, name) : undefined;
      editVariants((elements) => renameVariantValue(elements, axis.prop, target.value, name), nextKey);
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
    // The new value starts as a copy of the look being edited.
    editVariants((elements) => addVariantValue(elements, axis.prop, name, selected), variantKey(axis.prop, name));
    startRename({ kind: 'value', value: name });
  };

  const handleRemove = (target: Target): void => {
    setConfirming(null);
    if (target.kind === 'axis') editVariants((elements) => removeVariantAxis(elements, axis.prop));
    else editVariants((elements) => removeVariantValue(elements, axis.prop, target.value));
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
    <div className={styles.row} data-testid={`variant-axis-${axis.prop}`}>
      {sameTarget(renaming?.target ?? null, axisTarget) ? (
        renameInput('Axis name')
      ) : (
        <span
          className={styles.axisName}
          onDoubleClick={() => startRename(axisTarget)}
          title="Double-click to rename"
        >
          {axis.prop}
        </span>
      )}
      <div className={styles.segments} role="radiogroup" aria-label={`${axis.prop} value`}>
        {axis.values.map((value) => {
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
              className={`${styles.segment} ${isSelected ? styles.segmentActive : ''}`}
              onClick={() => setActiveVariant(keyFor(value))}
              onDoubleClick={() => startRename(target)}
              title={value === axis.defaultValue ? 'The default value. Double-click to rename' : 'Double-click to rename'}
            >
              {value}
            </button>
          );
        })}
        <button
          type="button"
          className={styles.segment}
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
          : (
            <>
              {selected !== axis.defaultValue && (
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setConfirming({ kind: 'value', value: selected })}
                  aria-label={`Remove ${selected}`}
                  title={`Remove ${selected}`}
                >
                  Remove value
                </button>
              )}
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setConfirming(axisTarget)}
                aria-label={`Remove the ${axis.prop} axis`}
                title={`Remove the ${axis.prop} axis`}
              >
                Remove axis
              </button>
            </>
          )}
      {error !== null && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
};
