import { useCanvasStore } from '@store/canvasSlice';
import { useListField } from '@store/hooks/useListField';
import { useMixedFields } from '@store/hooks/useMixedFields';
import { selectionPatchers } from '@store/selectionPatch';
import { SECTION_FITS } from '@lib/multiEdit';
import { useGroupToggle, useResolvedElement } from '@store/useResolvedElement';
import type { TransformDef, TransformKind } from '@lib/element';

import { Button } from '../controls/Button';
import { EnumSelect } from '../controls/EnumSelect';
import { NumberInput } from '../controls/NumberInput';
import { PrefixSuffixInput } from '../controls/PrefixSuffixInput';
import { Tooltip } from '../controls/Tooltip';
import { Section, Row } from './Section';
import { SectionEmptyState } from './SectionEmptyState';
import styles from './TransformSection.module.css';

type Props = {
  elementId: string;
};

const KIND_OPTIONS: ReadonlyArray<{ value: TransformKind; label: string }> = [
  { value: 'translate', label: 'Translate' },
  { value: 'rotate', label: 'Rotate' },
  { value: 'scale', label: 'Scale' },
  { value: 'skew', label: 'Skew' },
];

const KIND_TOOLTIPS: Record<TransformKind, string> = {
  translate: 'Move the element by an offset without affecting layout (px, %, or a token)',
  rotate: 'Rotate around the transform origin, in degrees',
  scale: 'Scale from the transform origin (1 = unchanged)',
  skew: 'Slant along each axis, in degrees',
};

/**
 * A no-op default so adding a row never moves the element; the user
 * dials in what they want. A visible default (a rotation) would jump
 * the element the moment the row appeared.
 */
const makeTransform = (kind: TransformKind): TransformDef => {
  switch (kind) {
    case 'translate':
      return { kind, x: '0px', y: '0px' };
    case 'rotate':
      return { kind, angle: 0 };
    case 'scale':
      return { kind, x: 1, y: 1 };
    case 'skew':
      return { kind, x: 0, y: 0 };
  }
};

/** Common `transform-origin` values; anything else shows as Custom. */
const ORIGIN_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'Center' },
  { value: 'top left', label: 'Top left' },
  { value: 'top', label: 'Top' },
  { value: 'top right', label: 'Top right' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'bottom left', label: 'Bottom left' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'bottom right', label: 'Bottom right' },
];
const CUSTOM_ORIGIN = '__custom__';

export const TransformSection = ({ elementId }: Props): JSX.Element | null => {
  const element = useResolvedElement(elementId);
  const { patchElement } = selectionPatchers(SECTION_FITS.box);
  const { isMixed } = useMixedFields(SECTION_FITS.box);
  const transformsMixed = isMixed('transforms');
  const groupToggle = useGroupToggle(
    elementId,
    'transform',
    (element?.transforms.length ?? 0) > 0 ||
      (element?.transformOrigin.length ?? 0) > 0
  );
  const listField = useListField<TransformDef>(
    () => (transformsMixed ? [] : element?.transforms ?? []),
    (next) => patchElement(elementId, { transforms: next })
  );
  if (!element) return null;

  const transforms = transformsMixed ? [] : element.transforms;
  const origin = element.transformOrigin;
  const originIsPreset = ORIGIN_PRESETS.some((p) => p.value === origin);
  const originOptions = originIsPreset
    ? ORIGIN_PRESETS
    : [...ORIGIN_PRESETS, { value: CUSTOM_ORIGIN, label: 'Custom…' }];

  return (
    <Section
      title="Transform"
      collapsible
      defaultOpen={transforms.length > 0 || origin.length > 0}
      elementId={elementId}
      groupToggle={groupToggle}
      fields={['transforms', 'transformOrigin']}
      cssProperties={['transform', 'transform-origin']}
    >
      {transforms.length === 0 && <SectionEmptyState testId="transform-empty">{transformsMixed ? 'Mixed' : undefined}</SectionEmptyState>}
      {transforms.map((transform, idx) => (
        <TransformRow
          key={idx}
          index={idx}
          transform={transform}
          onReplace={(next) =>
            patchElement(elementId, {
              transforms: transforms.map((t, i) => (i === idx ? next : t)),
            })
          }
          onRemove={() => listField.remove(idx)}
        />
      ))}
      <Row label="">
        <Button
          variant="addRow"
          onClick={() => listField.add(makeTransform('translate'))}
        >
          + Add transform
        </Button>
      </Row>

      <div className={styles.originDivider} />
      <div className={styles.originTitle}>Origin</div>
      <Row label="" tooltip="The point rotate, scale and skew pivot around (transform-origin). Center is the CSS default.">
        <EnumSelect<string>
          value={originIsPreset ? origin : CUSTOM_ORIGIN}
          mixed={isMixed('transformOrigin')}
          options={originOptions}
          onChange={(value) => {
            if (value === CUSTOM_ORIGIN) return;
            patchElement(elementId, { transformOrigin: value });
          }}
          title="Transform origin"
        />
        <PrefixSuffixInput
          prefix="At"
          title="transform-origin — any CSS value, e.g. 20px 40px or 100% 0"
          value={origin}
          mixed={isMixed('transformOrigin')}
          placeholder="50% 50%"
          onCommit={(value) =>
            patchElement(elementId, { transformOrigin: value.trim() })
          }
        />
      </Row>
    </Section>
  );
};

type RowProps = {
  index: number;
  transform: TransformDef;
  /** Replaces the whole def — a kind change swaps its shape. */
  onReplace: (next: TransformDef) => void;
  onRemove: () => void;
};

const TransformRow = ({
  index,
  transform,
  onReplace,
  onRemove,
}: RowProps): JSX.Element => {
  // Switching kind resets to that kind's no-op rather than carrying
  // numbers across — a 45° rotation is not a 45px translate.
  const handleKindChange = (next: TransformKind): void => {
    if (next !== transform.kind) onReplace(makeTransform(next));
  };

  return (
    <div className={styles.transformRow}>
      <div className={styles.rowHeader}>
        <span className={styles.rowTitle}>Transform {index + 1}</span>
        <Tooltip label={`Remove transform ${index + 1}`}>
          <Button
            variant="removeRow"
            onClick={onRemove}
            ariaLabel={`Remove transform ${index + 1}`}
          >
            ×
          </Button>
        </Tooltip>
      </div>
      <Row label="">
        <EnumSelect<TransformKind>
          value={transform.kind}
          options={KIND_OPTIONS}
          onChange={handleKindChange}
          title={KIND_TOOLTIPS[transform.kind]}
        />
        {transform.kind === 'rotate' && (
          <NumberInput
            prefix="Angle"
            suffix="deg"
            title={KIND_TOOLTIPS.rotate}
            value={transform.angle}
            onChange={(value) =>
              value !== undefined && onReplace({ kind: 'rotate', angle: value })
            }
          />
        )}
      </Row>
      {transform.kind === 'translate' && (
        <Row label="">
          <PrefixSuffixInput
            prefix="X"
            title="Horizontal offset — px, %, or var(--token)"
            value={transform.x}
            placeholder="0px"
            onCommit={(value) => onReplace({ ...transform, x: value.trim() || '0px' })}
          />
          <PrefixSuffixInput
            prefix="Y"
            title="Vertical offset — px, %, or var(--token)"
            value={transform.y}
            placeholder="0px"
            onCommit={(value) => onReplace({ ...transform, y: value.trim() || '0px' })}
          />
        </Row>
      )}
      {transform.kind === 'scale' && (
        <Row label="">
          <NumberInput
            prefix="X"
            title="Horizontal scale factor (1 = unchanged)"
            value={transform.x}
            onChange={(value) => value !== undefined && onReplace({ ...transform, x: value })}
          />
          <NumberInput
            prefix="Y"
            title="Vertical scale factor (1 = unchanged)"
            value={transform.y}
            onChange={(value) => value !== undefined && onReplace({ ...transform, y: value })}
          />
        </Row>
      )}
      {transform.kind === 'skew' && (
        <Row label="">
          <NumberInput
            prefix="X"
            suffix="deg"
            title="Horizontal skew angle"
            value={transform.x}
            onChange={(value) => value !== undefined && onReplace({ ...transform, x: value })}
          />
          <NumberInput
            prefix="Y"
            suffix="deg"
            title="Vertical skew angle"
            value={transform.y}
            onChange={(value) => value !== undefined && onReplace({ ...transform, y: value })}
          />
        </Row>
      )}
    </div>
  );
};
