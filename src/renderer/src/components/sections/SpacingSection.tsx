import { IconBoxMargin, IconBoxPadding } from '@tabler/icons-react';

import { useMemo } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { useResolvedElement } from '@store/useResolvedElement';
import { tokensForField } from '@lib/tokensForField';
import { FourSideInput } from '../controls/FourSideInput';
import { Section, Row } from './Section';

type Props = {
  elementId: string;
  hideMargin?: boolean;
};

export const SpacingSection = ({ elementId, hideMargin = false }: Props): JSX.Element | null => {
  const element = useResolvedElement(elementId);
  const patchElement = useCanvasStore((s) => s.patchElement);
  const themeTokens = useCanvasStore((s) => s.themeTokens);
  const openThemePanel = useCanvasStore((s) => s.openThemePanel);
  // Padding / margin offer length tokens with `--space-*` floated first.
  const spacingTokens = useMemo(
    () => tokensForField('spacing', themeTokens),
    [themeTokens]
  );
  if (!element) return null;

  return (
    <Section
      title="Spacing"
      elementId={elementId}
      fields={hideMargin ? ['padding'] : ['padding', 'margin']}
      cssProperties={hideMargin ? ['padding'] : ['padding', 'margin']}
    >
      <Row label="">
        <FourSideInput
          prefix={
            <IconBoxPadding
              size={16}
              stroke={1.75}
              color="var(--text-secondary)"
              style={{ display: 'block' }}
            />
          }
          label="Padding"
          title="Padding (top right bottom left)"
          value={element.padding}
          onChange={(next) => patchElement(elementId, { padding: next })}
          min={0}
          tokens={spacingTokens}
          {...(openThemePanel ? { onOpenTheme: openThemePanel } : {})}
        />
      </Row>
      {!hideMargin && (
        <Row label="">
          <FourSideInput
            prefix={
              <IconBoxMargin
                size={16}
                stroke={1.75}
                color="var(--text-secondary)"
                style={{ display: 'block' }}
              />
            }
            label="Margin"
            title="Margin (top right bottom left) — a side can be auto: 0 auto centers"
            allowAuto
            value={element.margin}
            onChange={(next) => patchElement(elementId, { margin: next })}
            tokens={spacingTokens}
            {...(openThemePanel ? { onOpenTheme: openThemePanel } : {})}
          />
        </Row>
      )}
    </Section>
  );
};
