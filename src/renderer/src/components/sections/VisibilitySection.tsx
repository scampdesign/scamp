import { IconPercentage } from '@tabler/icons-react';
import { useCanvasStore } from '@store/canvasSlice';
import { selectionPatchers } from '@store/selectionPatch';
import { useMixedFields } from '@store/hooks/useMixedFields';
import { SECTION_FITS } from '@lib/multiEdit';
import { useResolvedElement } from '@store/useResolvedElement';
import type { BlendMode } from '@lib/element';
import { BlendModeSelect } from '../controls/BlendModeSelect';
import { NumberInput } from '../controls/NumberInput';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Section, Row } from './Section';

type Props = {
  elementId: string;
};

type VisibilityMode = 'visible' | 'hidden' | 'none';

const VISIBILITY_OPTIONS: ReadonlyArray<{ value: VisibilityMode; label: string }> = [
  { value: 'visible', label: 'Visible' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'none', label: 'None' },
];

/** Map 0–1 opacity in the model to a 0–100 integer percent for the UI. */
const toPercent = (opacity: number): number => Math.round(opacity * 100);

export const VisibilitySection = ({ elementId }: Props): JSX.Element | null => {
  const element = useResolvedElement(elementId);
  const { patchElement } = selectionPatchers(SECTION_FITS.box);
  const { isMixed } = useMixedFields(SECTION_FITS.box);
  if (!element) return null;

  const currentPercent = toPercent(element.opacity);

  const commitPercent = (next: number | undefined): void => {
    if (next === undefined) return;
    const clamped = Math.max(0, Math.min(100, next));
    patchElement(elementId, { opacity: clamped / 100 });
  };

  return (
    <Section
      title="Visibility"
      elementId={elementId}
      fields={['opacity', 'visibilityMode', 'mixBlendMode']}
      cssProperties={['opacity', 'visibility', 'mix-blend-mode']}
    >
      <Row label="Opacity">
        <NumberInput
          value={currentPercent}
          mixed={isMixed('opacity')}
          onChange={commitPercent}
          min={0}
          max={100}
          title="Opacity (%)"
          suffix={<IconPercentage size={14} stroke={1.75} />}
        />
      </Row>
      <Row label="Display">
        <SegmentedControl<VisibilityMode>
          value={element.visibilityMode}
          mixed={isMixed('visibilityMode')}
          options={VISIBILITY_OPTIONS}
          onChange={(value) => patchElement(elementId, { visibilityMode: value })}
          title="Visibility"
        />
      </Row>
      <Row label="Blend">
        <BlendModeSelect
          value={element.mixBlendMode}
          mixed={isMixed('mixBlendMode')}
          onChange={(value: BlendMode) =>
            patchElement(elementId, { mixBlendMode: value })
          }
          title="Mix blend mode — how this element blends with content behind it"
        />
      </Row>
    </Section>
  );
};
