import { useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID, type VariantAxis, type VariantInteraction, type VariantTrigger } from '@lib/element';
import { classNameFor } from '@lib/generateCode';
import {
  TRIGGER_LABEL,
  addVariantInteraction,
  interactionError,
  isCssTrigger,
  removeVariantInteraction,
} from '@lib/variantInteractions';

import { EnumSelect } from './controls/EnumSelect';
import styles from './VariantsSection.module.css';

type Props = {
  axes: ReadonlyArray<VariantAxis>;
  /** The frame being edited, which a new interaction starts from. */
  picks: Readonly<Record<string, string>>;
  disabled: boolean;
};

const CSS_TRIGGERS: ReadonlyArray<VariantTrigger> = ['hover', 'press', 'focus'];
const RUNTIME_TRIGGERS: ReadonlyArray<VariantTrigger> = ['click', 'outside', 'escape'];
const ANY = '*';
const NONE: ReadonlyArray<VariantInteraction> = [];

/**
 * The component's interactions, Figma's **Change to**: on a trigger, a
 * property goes from one value to another by itself. Hover, press, and
 * focus are CSS; click, a click outside, and Escape need the Scamp
 * framework's handler, so only its projects offer them.
 * see docs/plans/component-variants-plan.md, phase 7
 */
export const VariantInteractions = ({ axes, picks, disabled }: Props): JSX.Element => {
  const interactions = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.variantInteractions ?? NONE);
  const elements = useCanvasStore((s) => s.elements);
  const isFramework = useCanvasStore((s) => s.projectFormat === 'scamp');
  const editVariants = useCanvasStore((s) => s.editVariants);
  const [draft, setDraft] = useState<VariantInteraction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggers = isFramework ? [...CSS_TRIGGERS, ...RUNTIME_TRIGGERS] : CSS_TRIGGERS;
  const nameOf = (id: string | undefined): string => {
    const el = elements[id ?? ROOT_ELEMENT_ID];
    return el === undefined || el.id === ROOT_ELEMENT_ID ? 'the component' : classNameFor(el);
  };

  const startDraft = (): void => {
    const axis = axes[0];
    if (axis === undefined) return;
    const from = picks[axis.prop] ?? axis.defaultValue;
    const to = axis.values.find((v) => v !== from && v !== axis.defaultValue) ?? axis.values.find((v) => v !== from) ?? from;
    setError(null);
    setDraft({ axis: axis.prop, from, trigger: 'hover', to });
  };

  const handleAdd = (): void => {
    if (draft === null) return;
    // Only a click has an element; the root is the whole component.
    const { target, ...rest } = draft;
    const interaction: VariantInteraction =
      draft.trigger === 'click' && target !== undefined && target !== ROOT_ELEMENT_ID ? { ...rest, target } : rest;
    const problem = interactionError(axes, interaction);
    if (problem !== null) {
      setError(problem);
      return;
    }
    editVariants((current) => addVariantInteraction(current, interaction));
    setDraft(null);
    setError(null);
  };

  const draftAxis = draft === null ? undefined : axes.find((a) => a.prop === draft.axis);

  return (
    <div className={styles.interactions} data-testid="variant-interactions">
      <span className={styles.axisName}>Interactions</span>
      {interactions.length > 0 && (
        <ul className={styles.interactionList}>
          {interactions.map((i, index) => (
            <li key={`${i.trigger}-${i.axis}-${i.from ?? ANY}-${i.target ?? ''}`} className={styles.interaction}>
              <span>
                {TRIGGER_LABEL[i.trigger]}
                {i.trigger === 'click' ? ` on ${nameOf(i.target)}` : ''}: {i.axis} {i.from ?? 'any'} → {i.to}
              </span>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => editVariants((current) => removeVariantInteraction(current, i))}
                aria-label={`Remove ${TRIGGER_LABEL[i.trigger].toLowerCase()} ${i.from ?? 'any'} to ${i.to}`}
                disabled={disabled}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {draft === null ? (
        <button type="button" className={styles.addAxis} onClick={startDraft} disabled={disabled}>
          + Add interaction
        </button>
      ) : (
        <div className={styles.interactionForm} role="group" aria-label="New interaction">
          <EnumSelect
            value={draft.trigger}
            options={triggers.map((t) => ({ value: t, label: TRIGGER_LABEL[t] }))}
            onChange={(trigger) => setDraft({ ...draft, trigger })}
            title="Trigger"
          />
          {axes.length > 1 && (
            <EnumSelect
              value={draft.axis}
              options={axes.map((a) => ({ value: a.prop, label: a.prop }))}
              onChange={(axis) => {
                const next = axes.find((a) => a.prop === axis);
                if (next === undefined) return;
                setDraft({ ...draft, axis, from: next.defaultValue, to: next.values.find((v) => v !== next.defaultValue) ?? next.defaultValue });
              }}
              title="Property"
            />
          )}
          <EnumSelect
            value={draft.from ?? ANY}
            options={[{ value: ANY, label: 'From any value' }, ...(draftAxis?.values ?? []).map((v) => ({ value: v, label: `From ${v}` }))]}
            onChange={(from) => setDraft({ ...draft, from: from === ANY ? null : from })}
            title="Changes from"
          />
          <EnumSelect
            value={draft.to}
            options={(draftAxis?.values ?? []).map((v) => ({ value: v, label: `Change to ${v}` }))}
            onChange={(to) => setDraft({ ...draft, to })}
            title="Changes to"
          />
          {draft.trigger === 'click' && (
            <EnumSelect
              value={draft.target ?? ROOT_ELEMENT_ID}
              options={[
                { value: ROOT_ELEMENT_ID, label: 'On the component' },
                ...Object.values(elements)
                  .filter((el) => el.id !== ROOT_ELEMENT_ID)
                  .map((el) => ({ value: el.id, label: `On ${classNameFor(el)}` })),
              ]}
              onChange={(target) => setDraft({ ...draft, target })}
              title="The element clicked"
            />
          )}
          {isCssTrigger(draft.trigger) ? null : (
            <span className={styles.interactionNote}>Runs in the browser through the Scamp framework.</span>
          )}
          <div className={styles.valueActions}>
            <button type="button" className={styles.confirmCancel} onClick={handleAdd}>
              Add
            </button>
            <button type="button" className={styles.confirmCancel} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
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
