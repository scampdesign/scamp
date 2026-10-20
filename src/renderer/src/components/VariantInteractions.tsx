import { useState } from 'react';
import { IconMinus, IconPlus } from '@tabler/icons-react';
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

import { usePopover } from '../hooks/usePopover';
import { EnumSelect } from './controls/EnumSelect';
import { Section } from './sections/Section';
import styles from './VariantsSection.module.css';

type Props = {
  axes: ReadonlyArray<VariantAxis>;
  /** The frame being edited, which a new interaction starts from. */
  picks: Readonly<Record<string, string>>;
  disabled: boolean;
};

const CSS_TRIGGERS: ReadonlyArray<VariantTrigger> = ['hover', 'press', 'focus'];
const RUNTIME_TRIGGERS: ReadonlyArray<VariantTrigger> = ['click', 'outside', 'escape'];
const NONE: ReadonlyArray<VariantInteraction> = [];
const POPOVER = { width: 240, desiredMaxHeight: 320, align: 'right' } as const;

/**
 * The component's interactions, as Figma has them: **+** on the header
 * opens a panel with a **Trigger** and an **Action** (Change to), and
 * each interaction is one line. A new one starts from the frame being
 * edited. Hover, press, and focus are CSS; click, a click outside, and
 * Escape need the Scamp framework's handler, so only its projects offer
 * them. see docs/plans/component-variants-plan.md, phase 7
 */
export const VariantInteractions = ({ axes, picks, disabled }: Props): JSX.Element => {
  const interactions = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.variantInteractions ?? NONE);
  const elements = useCanvasStore((s) => s.elements);
  const isFramework = useCanvasStore((s) => s.projectFormat === 'scamp');
  const editVariants = useCanvasStore((s) => s.editVariants);
  const [trigger, setTrigger] = useState<VariantTrigger>('hover');
  const [target, setTarget] = useState<string>(ROOT_ELEMENT_ID);
  // `axis=value`, the value the action changes to.
  const [destination, setDestination] = useState('');
  const [error, setError] = useState<string | null>(null);
  const popover = usePopover<HTMLButtonElement>({ position: POPOVER });

  const triggers = isFramework ? [...CSS_TRIGGERS, ...RUNTIME_TRIGGERS] : CSS_TRIGGERS;
  const destinations = axes.flatMap((a) =>
    a.values
      .filter((v) => v !== picks[a.prop])
      .map((v) => ({ value: `${a.prop}=${v}`, label: axes.length > 1 ? `${a.prop}: ${v}` : v }))
  );
  const nameOf = (id: string | undefined): string => {
    const el = elements[id ?? ROOT_ELEMENT_ID];
    return el === undefined || el.id === ROOT_ELEMENT_ID ? 'component' : classNameFor(el);
  };
  const describe = (i: VariantInteraction): string =>
    `${TRIGGER_LABEL[i.trigger]}${i.trigger === 'click' ? ` ${nameOf(i.target)}` : ''} · ${i.from ?? 'any'} → ${i.to}`;

  const handleOpen = (): void => {
    if (popover.open) {
      popover.setOpen(false);
      return;
    }
    setTrigger('hover');
    setTarget(ROOT_ELEMENT_ID);
    setDestination(destinations[0]?.value ?? '');
    setError(null);
    popover.setOpen(true);
  };

  const handleAdd = (): void => {
    const at = destination.indexOf('=');
    const axis = destination.slice(0, at);
    const interaction: VariantInteraction = {
      axis,
      from: picks[axis] ?? null,
      trigger,
      to: destination.slice(at + 1),
      ...(trigger === 'click' && target !== ROOT_ELEMENT_ID ? { target } : {}),
    };
    const problem = interactionError(axes, interaction);
    if (problem !== null) {
      setError(problem);
      return;
    }
    editVariants((current) => addVariantInteraction(current, interaction));
    popover.setOpen(false);
  };

  const plus = (
    <button
      ref={popover.triggerRef}
      type="button"
      className={styles.headerButton}
      onClick={handleOpen}
      disabled={disabled}
      aria-label="Add interaction"
      aria-expanded={popover.open}
      title="Add interaction"
    >
      <IconPlus size={14} />
    </button>
  );

  return (
    <div data-testid="variant-interactions">
      <Section title="Interactions" titleAccessory={plus}>
        {interactions.length > 0 && (
          <ul className={styles.interactionList}>
            {interactions.map((i) => (
              <li key={describe(i)} className={styles.interaction}>
                <span className={styles.interactionText} title={describe(i)}>
                  {describe(i)}
                </span>
                <button
                  type="button"
                  className={styles.headerButton}
                  onClick={() => editVariants((current) => removeVariantInteraction(current, i))}
                  aria-label={`Remove ${describe(i)}`}
                  title="Remove interaction"
                  disabled={disabled}
                >
                  <IconMinus size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {popover.open && popover.position !== null && (
        <div
          ref={popover.popoverRef}
          className={styles.interactionPopover}
          role="dialog"
          aria-label="New interaction"
          style={{
            left: popover.position.left,
            top: popover.position.top,
            bottom: popover.position.bottom,
            maxHeight: popover.position.maxHeight,
          }}
        >
          <div className={styles.popoverRow}>
            <span className={styles.popoverLabel}>Trigger</span>
            <EnumSelect
              value={trigger}
              options={triggers.map((t) => ({ value: t, label: TRIGGER_LABEL[t] }))}
              onChange={setTrigger}
              title="Trigger"
            />
          </div>
          {trigger === 'click' && (
            <div className={styles.popoverRow}>
              <span className={styles.popoverLabel}>On</span>
              <EnumSelect
                value={target}
                options={[
                  { value: ROOT_ELEMENT_ID, label: 'The component' },
                  ...Object.values(elements)
                    .filter((el) => el.id !== ROOT_ELEMENT_ID)
                    .map((el) => ({ value: el.id, label: classNameFor(el) })),
                ]}
                onChange={setTarget}
                title="The element clicked"
              />
            </div>
          )}
          <div className={styles.popoverRow}>
            <span className={styles.popoverLabel}>Action</span>
            <EnumSelect value={destination} options={destinations} onChange={setDestination} title="Change to" />
          </div>
          <span className={styles.interactionNote}>
            From {picks[destination.slice(0, destination.indexOf('='))] ?? 'this frame'}, the frame you're editing.
            {isCssTrigger(trigger) ? '' : ' Runs in the browser through the Scamp framework.'}
          </span>
          {error !== null && (
            <span className={styles.error} role="alert">
              {error}
            </span>
          )}
          <button type="button" className={styles.popoverAdd} onClick={handleAdd} disabled={destination === ''}>
            Add
          </button>
        </div>
      )}
    </div>
  );
};
