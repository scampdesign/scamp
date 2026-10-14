import { useCanvasStore } from '@store/canvasSlice';
import { selectionPatchers } from '@store/selectionPatch';
import { SECTION_FITS } from '@lib/multiEdit';
import { useResolvedElement } from '@store/useResolvedElement';

import { DisplaySelect } from '../controls/DisplaySelect';
import { Row, Section } from './Section';

type Props = {
  elementId: string;
};

/**
 * Display for elements that get no Layout section — text and inputs —
 * which is where most `inline` values live.
 */
export const DisplaySection = ({ elementId }: Props): JSX.Element | null => {
  const element = useResolvedElement(elementId);
  const { patchElement } = selectionPatchers(SECTION_FITS.display);
  if (!element || element.visibilityMode === 'none') return null;
  return (
    <Section title="Display" elementId={elementId} fields={['display', 'displayOuter']} cssProperties={['display']}>
      <Row label="Display">
        <DisplaySelect
          display={element.display}
          outer={element.displayOuter}
          onChange={(displayOuter) => patchElement(elementId, { displayOuter })}
        />
      </Row>
    </Section>
  );
};
