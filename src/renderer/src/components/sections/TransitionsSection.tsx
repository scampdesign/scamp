import { useMemo, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { useListField } from '@store/hooks/useListField';
import { useMixedFields } from '@store/hooks/useMixedFields';
import { selectionPatchers } from '@store/selectionPatch';
import { SECTION_FITS } from '@lib/multiEdit';
import { useGroupToggle, useResolvedElement } from '@store/useResolvedElement';
import type { TransitionDef } from '@lib/element';
import { Button } from '../controls/Button';
import { EnumSelect } from '../controls/EnumSelect';
import { NumberInput } from '../controls/NumberInput';
import { PrefixSuffixInput } from '../controls/PrefixSuffixInput';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Tooltip } from '../controls/Tooltip';
import { Section, Row } from './Section';
import { SectionEmptyState } from './SectionEmptyState';

type Props = {
  elementId: string;
};

const PROPERTY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'all', label: 'all' },
  { value: 'opacity', label: 'opacity' },
  { value: 'transform', label: 'transform' },
  { value: 'background', label: 'background' },
  { value: 'color', label: 'color' },
  { value: 'border', label: 'border' },
  { value: 'width', label: 'width' },
  { value: 'height', label: 'height' },
];

const NAMED_EASINGS = ['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out'] as const;
type NamedEasing = (typeof NAMED_EASINGS)[number];
const CUSTOM_EASING_VALUE = '__custom__';

const isNamedEasing = (value: string): value is NamedEasing =>
  (NAMED_EASINGS as ReadonlyArray<string>).includes(value);

const EASING_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  ...NAMED_EASINGS.map((e) => ({ value: e, label: e })),
  { value: CUSTOM_EASING_VALUE, label: 'Custom…' },
];

type TimeUnit = 'ms' | 's';

const UNIT_OPTIONS: ReadonlyArray<{ value: TimeUnit; label: string }> = [
  { value: 'ms', label: 'ms' },
  { value: 's', label: 's' },
];

/** Convert canonical ms to whatever unit the row is currently displayed in. */
const msToDisplay = (ms: number, unit: TimeUnit): number =>
  unit === 's' ? ms / 1000 : ms;

const displayToMs = (n: number | undefined, unit: TimeUnit): number => {
  if (n === undefined) return 0;
  return unit === 's' ? Math.round(n * 1000) : Math.round(n);
};

export const TransitionsSection = ({ elementId }: Props): JSX.Element | null => {
  const element = useResolvedElement(elementId);
  const { patchElement } = selectionPatchers(SECTION_FITS.box);
  const { isMixed } = useMixedFields(SECTION_FITS.box);
  const transitionsMixed = isMixed('transitions');
  // Per-row, per-axis (duration / delay) display unit. The CSS storage
  // is always canonical ms; the unit is just a UI affordance for typing
  // shorter numbers when the user is working in seconds.
  const [unitState, setUnitState] = useState<
    Record<number, { duration: TimeUnit; delay: TimeUnit }>
  >({});
  // Hide the eye when no transitions are defined (or already off).
  const groupToggle = useGroupToggle(
    elementId,
    'transitions',
    (element?.transitions.length ?? 0) > 0
  );
  const transitionsField = useListField<TransitionDef>(
    () => (transitionsMixed ? [] : element?.transitions ?? []),
    (next) => patchElement(elementId, { transitions: next })
  );

  if (!element) return null;
  const transitions: ReadonlyArray<TransitionDef> = transitionsMixed ? [] : element.transitions;

  const unitFor = (idx: number): { duration: TimeUnit; delay: TimeUnit } =>
    unitState[idx] ?? { duration: 'ms', delay: 'ms' };

  const setUnit = (idx: number, axis: 'duration' | 'delay', unit: TimeUnit): void => {
    setUnitState((prev) => ({ ...prev, [idx]: { ...unitFor(idx), [axis]: unit } }));
  };

  // Wraps the shared remove to also drop the row's per-row unit state,
  // which is keyed by index and would otherwise leak onto the row that
  // shifts into this slot.
  const removeRow = (idx: number): void => {
    transitionsField.remove(idx);
    setUnitState((prev) => {
      const copy = { ...prev };
      delete copy[idx];
      return copy;
    });
  };

  const addRow = (): void => {
    transitionsField.add({
      property: 'all',
      durationMs: 200,
      easing: 'ease',
      delayMs: 0,
    });
  };

  return (
    <Section
      title="Transitions"
      collapsible
      defaultOpen={transitions.length > 0}
      elementId={elementId}
      groupToggle={groupToggle}
      fields={['transitions']}
      cssProperties={['transition']}
    >
      {transitions.length === 0 && (
        <SectionEmptyState testId="transitions-empty">{transitionsMixed ? 'Mixed' : undefined}</SectionEmptyState>
      )}
      {transitions.map((t, idx) => (
        <TransitionRow
          key={idx}
          transition={t}
          unit={unitFor(idx)}
          onChange={(patch) => transitionsField.update(idx, patch)}
          onUnitChange={(axis, unit) => setUnit(idx, axis, unit)}
          onRemove={() => removeRow(idx)}
        />
      ))}
      <Row label="">
        <Button variant="addRow" onClick={addRow}>
          + Add transition
        </Button>
      </Row>
    </Section>
  );
};

type RowProps = {
  transition: TransitionDef;
  unit: { duration: TimeUnit; delay: TimeUnit };
  onChange: (patch: Partial<TransitionDef>) => void;
  onUnitChange: (axis: 'duration' | 'delay', unit: TimeUnit) => void;
  onRemove: () => void;
};

const TransitionRow = ({
  transition,
  unit,
  onChange,
  onUnitChange,
  onRemove,
}: RowProps): JSX.Element => {
  // Detect whether the stored easing is a named keyword or a custom
  // expression. The dropdown shows `Custom…` for anything outside the
  // named set, and an inline text input lets the user edit the
  // expression directly.
  const easingMode: NamedEasing | typeof CUSTOM_EASING_VALUE = useMemo(
    () =>
      isNamedEasing(transition.easing)
        ? (transition.easing as NamedEasing)
        : CUSTOM_EASING_VALUE,
    [transition.easing]
  );

  const handleEasingChange = (next: string): void => {
    if (next === CUSTOM_EASING_VALUE) {
      // Seed with a Material-standard cubic-bezier so the input has
      // something parseable to start from.
      onChange({ easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
      return;
    }
    onChange({ easing: next });
  };

  return (
    <>
      <Row label="">
        <EnumSelect
          value={transition.property}
          options={PROPERTY_OPTIONS}
          onChange={(value) => onChange({ property: value })}
          title="Property"
        />
        <Tooltip label="Remove transition">
          <Button variant="removeRow" onClick={onRemove} ariaLabel="Remove transition">
            ×
          </Button>
        </Tooltip>
      </Row>
      <Row label="">
        <NumberInput
          prefix="Dur"
          title="Duration"
          value={msToDisplay(transition.durationMs, unit.duration)}
          onChange={(value) =>
            onChange({ durationMs: displayToMs(value, unit.duration) })
          }
          min={0}
        />
        <SegmentedControl<TimeUnit>
          value={unit.duration}
          options={UNIT_OPTIONS}
          onChange={(next) => onUnitChange('duration', next)}
          title="Duration unit"
        />
      </Row>
      <Row label="">
        <EnumSelect
          value={easingMode}
          options={EASING_OPTIONS}
          onChange={handleEasingChange}
          title="Easing"
        />
      </Row>
      {easingMode === CUSTOM_EASING_VALUE && (
        <Row label="">
          <PrefixSuffixInput
            value={transition.easing}
            onCommit={(next) => onChange({ easing: next.trim() || 'ease' })}
            prefix="fn"
            title="Custom easing expression"
          />
        </Row>
      )}
      <Row label="">
        <NumberInput
          prefix="Delay"
          title="Delay"
          value={msToDisplay(transition.delayMs, unit.delay)}
          onChange={(value) =>
            onChange({ delayMs: displayToMs(value, unit.delay) })
          }
          min={0}
        />
        <SegmentedControl<TimeUnit>
          value={unit.delay}
          options={UNIT_OPTIONS}
          onChange={(next) => onUnitChange('delay', next)}
          title="Delay unit"
        />
      </Row>
    </>
  );
};
