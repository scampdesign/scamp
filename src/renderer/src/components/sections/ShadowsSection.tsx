import { useMemo } from 'react';
import { IconShadow } from '@tabler/icons-react';

import { useCanvasStore } from '@store/canvasSlice';
import {
  useColorPickerContext,
  type ColorPickerContext,
} from '@store/hooks/useColorPickerContext';
import { useListField } from '@store/hooks/useListField';
import { useGroupToggle, useResolvedElement } from '@store/useResolvedElement';
import type { BoxShadowDef } from '@lib/element';
import { combineShadowColor, splitShadowColor } from '@lib/parsers';
import { parseBoxShadowShorthand } from '@lib/parsers/boxShadow';
import { tokensForField } from '@lib/tokensForField';
import { Button } from '../controls/Button';
import { ColorInput } from '../controls/ColorInput';
import { NumberInput } from '../controls/NumberInput';
import { PresetMenu } from '../controls/PresetMenu';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Tooltip } from '../controls/Tooltip';
import { Section, Row } from './Section';
import { SectionEmptyState } from './SectionEmptyState';
import styles from './ShadowsSection.module.css';

type Props = {
  elementId: string;
};

const DEFAULT_NEW_SHADOW: BoxShadowDef = {
  offsetX: 0,
  offsetY: 4,
  blur: 8,
  spread: 0,
  color: 'rgba(0, 0, 0, 0.15)',
  inset: false,
};

type InsetMode = 'outset' | 'inset';

const INSET_OPTIONS: ReadonlyArray<{ value: InsetMode; label: string }> = [
  { value: 'outset', label: 'Outset' },
  { value: 'inset', label: 'Inset' },
];

export const ShadowsSection = ({ elementId }: Props): JSX.Element | null => {
  const element = useResolvedElement(elementId);
  const patchElement = useCanvasStore((s) => s.patchElement);
  const colorContext = useColorPickerContext();
  const groupToggle = useGroupToggle(
    elementId,
    'shadow',
    (element?.boxShadows.length ?? 0) > 0 || element?.boxShadowToken !== undefined
  );
  const shadowField = useListField<BoxShadowDef>(
    () => element?.boxShadows ?? [],
    (next) => patchElement(elementId, { boxShadows: next })
  );
  const shadowTokens = useMemo(
    () => tokensForField('shadow', colorContext.themeTokens),
    [colorContext.themeTokens]
  );
  if (!element) return null;

  const shadows: ReadonlyArray<BoxShadowDef> = element.boxShadows;

  /**
   * Apply a shadow token as a PRESET: resolve its box-shadow value into
   * structured rows, replacing whatever the element currently has. The
   * element model stores shadows structurally (no `var()`), so this is a
   * one-time application rather than a live token link.
   * see docs/plans/design-system-plan.md
   */
  const applyShadowPreset = (name: string): void => {
    const token = shadowTokens.find((t) => t.name === name);
    if (!token) return;
    const parsed = parseBoxShadowShorthand(token.value);
    if (parsed === null) return;
    patchElement(elementId, { boxShadows: parsed, boxShadowToken: undefined });
  };

  // A shadow linked to a theme token: shown as the token, which follows
  // the theme. Detach copies its current value into editable layers.
  const linked = element.boxShadowToken;
  const linkedName = linked === undefined ? null : (/var\(\s*(--[\w-]+)/.exec(linked)?.[1] ?? linked);
  const handleDetach = (): void => {
    const value = colorContext.themeTokens.find((t) => t.name === linkedName)?.value;
    const parsed = value === undefined ? null : parseBoxShadowShorthand(value);
    patchElement(elementId, { boxShadows: parsed ?? [], boxShadowToken: undefined });
  };

  // The shadow preset picker sits in the section header, left of the
  // expand chevron (PresetMenu renders nothing when there are no tokens).
  const shadowPreset = (
    <PresetMenu
      icon={<IconShadow size={14} stroke={1.75} />}
      ariaLabel="Apply shadow preset"
      testId="shadow-preset-select"
      // Name only — a full box-shadow value is too long/noisy for this
      // compact preset menu (the shadow renders on the canvas anyway).
      options={shadowTokens.map((t) => ({
        value: t.name,
        label: t.name,
      }))}
      onSelect={applyShadowPreset}
    />
  );

  return (
    <Section
      title="Shadow"
      collapsible
      defaultOpen={shadows.length > 0 || linked !== undefined}
      elementId={elementId}
      groupToggle={groupToggle}
      groupAccessory={shadowPreset}
      fields={['boxShadows', 'boxShadowToken']}
      cssProperties={['box-shadow']}
    >
      {linked !== undefined && (
        <Row label="">
          <div className={styles.linkedToken} data-testid="shadow-token">
            <span className={styles.linkedName} title={linked}>
              {linkedName}
            </span>
            <Tooltip label="Detach — copy the token's shadow into layers you can edit">
              <Button variant="ghost" onClick={handleDetach}>
                Detach
              </Button>
            </Tooltip>
            <Tooltip label="Remove the shadow">
              <Button variant="ghost" onClick={() => patchElement(elementId, { boxShadowToken: undefined })}>
                Remove
              </Button>
            </Tooltip>
          </div>
        </Row>
      )}
      {linked === undefined && shadows.length === 0 && <SectionEmptyState testId="shadows-empty" />}
      {shadows.map((shadow, idx) => (
        <ShadowRow
          key={idx}
          index={idx}
          shadow={shadow}
          elementId={elementId}
          onChange={(patch) => shadowField.update(idx, patch)}
          onRemove={() => shadowField.remove(idx)}
          colorContext={colorContext}
        />
      ))}
      {linked === undefined && (
        <Row label="">
          <Button
            variant="addRow"
            onClick={() => shadowField.add({ ...DEFAULT_NEW_SHADOW })}
          >
            + Add shadow
          </Button>
        </Row>
      )}
    </Section>
  );
};

type RowProps = {
  index: number;
  shadow: BoxShadowDef;
  /** Element this shadow row edits — passed to the picker's history entry. */
  elementId: string;
  onChange: (patch: Partial<BoxShadowDef>) => void;
  onRemove: () => void;
  colorContext: ColorPickerContext;
};

const ShadowRow = ({
  index,
  shadow,
  elementId,
  onChange,
  onRemove,
  colorContext,
}: RowProps): JSX.Element => {
  return (
    <div className={styles.shadowRow}>
      <div className={styles.rowHeader}>
        <span className={styles.rowTitle}>
          Shadow {index + 1}
          {shadow.inset && (
            <Tooltip label="Inset shadow — drawn inside the box">
              <span className={styles.insetIcon} aria-hidden="true">
                ◧
              </span>
            </Tooltip>
          )}
        </span>
        <Tooltip label="Remove shadow">
          <Button
            variant="removeRow"
            onClick={onRemove}
            ariaLabel={`Remove shadow ${index + 1}`}
          >
            ×
          </Button>
        </Tooltip>
      </div>
      <Row label="">
        <SegmentedControl<InsetMode>
          value={shadow.inset ? 'inset' : 'outset'}
          options={INSET_OPTIONS}
          onChange={(next) => onChange({ inset: next === 'inset' })}
          title="Inset shadows are drawn inside the box rather than around it"
        />
      </Row>
      <Row label="">
        <NumberInput
          prefix="X"
          title="X offset"
          value={shadow.offsetX}
          onChange={(value) =>
            value !== undefined && onChange({ offsetX: value })
          }
        />
        <NumberInput
          prefix="Y"
          title="Y offset"
          value={shadow.offsetY}
          onChange={(value) =>
            value !== undefined && onChange({ offsetY: value })
          }
        />
      </Row>
      <Row label="">
        <NumberInput
          prefix="B"
          title="Blur radius"
          value={shadow.blur}
          onChange={(value) =>
            value !== undefined && onChange({ blur: value })
          }
          min={0}
        />
        <NumberInput
          prefix="S"
          title="Spread radius"
          value={shadow.spread}
          onChange={(value) =>
            value !== undefined && onChange({ spread: value })
          }
        />
      </Row>
      <Row label="">
        <ShadowColorRow
          color={shadow.color}
          elementId={elementId}
          onChange={(color) => onChange({ color })}
          colorContext={colorContext}
        />
      </Row>
    </div>
  );
};

type ColorRowProps = {
  color: string;
  /** Element id for the picker's history entry tag. */
  elementId: string;
  onChange: (next: string) => void;
  colorContext: ColorPickerContext;
};

/**
 * Splits the stored shadow color into a base hex (rendered through
 * ColorInput with `disableAlpha`) and an opacity percentage (rendered
 * as a separate NumberInput). Edits to either control re-combine into
 * an `rgba(...)` string the data layer stores.
 *
 * Token / named-color values can't be combined with a separate alpha
 * (you'd lose the reference), so the opacity input is disabled in
 * that case — the picker still lets the user switch back to a hex.
 */
const ShadowColorRow = ({
  color,
  elementId,
  onChange,
  colorContext,
}: ColorRowProps): JSX.Element => {
  const split = splitShadowColor(color);
  const opacityPercent = Math.round(split.alpha * 100);

  const handleColorChange = (next: string): void => {
    const nextSplit = splitShadowColor(next);
    if (!nextSplit.decomposable) {
      // var() / token / named — keep verbatim, can't carry separate
      // opacity here.
      onChange(next);
      return;
    }
    // The picker's `disableAlpha` keeps the SketchPicker's alpha at 1,
    // but the user might still type an `rgba(..., 0.5)` into the text
    // field. When they do, treat that explicit alpha as the new
    // opacity; otherwise carry the existing opacity over so changing
    // the hue doesn't reset the slider.
    const alpha = nextSplit.hasExplicitAlpha ? nextSplit.alpha : split.alpha;
    onChange(combineShadowColor(nextSplit.base, alpha));
  };

  const handleOpacityChange = (percent: number | undefined): void => {
    if (percent === undefined) return;
    const clamped = Math.max(0, Math.min(100, percent));
    if (!split.decomposable) return;
    onChange(combineShadowColor(split.base, clamped / 100));
  };

  return (
    <>
      <ColorInput
        value={color}
        onChange={handleColorChange}
        historyElementId={elementId}
        historyPropertyKey="boxShadows"
        presetColors={colorContext.presetColors}
        tokens={colorContext.themeTokens}
        onOpenTheme={colorContext.onOpenTheme}
        disableAlpha
      />
      <NumberInput
        prefix="O"
        suffix="%"
        title={
          split.decomposable
            ? 'Shadow opacity (0–100)'
            : 'Opacity is disabled for token / named-color shadows. Pick a hex color to enable.'
        }
        value={opacityPercent}
        onChange={handleOpacityChange}
        min={0}
        max={100}
        disabled={!split.decomposable}
      />
    </>
  );
};
