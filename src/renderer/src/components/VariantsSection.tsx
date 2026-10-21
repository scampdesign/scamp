import { useEffect, useState } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { useCanvasStore } from '@store/canvasSlice';
import { DESKTOP_BREAKPOINT_ID } from '@shared/types';
import { ROOT_ELEMENT_ID, type VariantAxis } from '@lib/element';
import {
  addVariantAxis,
  combinationLimitError,
  fullPicks,
  keyFor,
  nextValueName,
  variantAxisError,
} from '@lib/variantAxes';

import { Section } from './sections/Section';
import { VariantAxisRow } from './VariantAxisRow';
import { VariantInteractions } from './VariantInteractions';
import styles from './VariantsSection.module.css';

const EMPTY_AXES: ReadonlyArray<VariantAxis> = [];

/** `variant`, then `size`, then `variant2`, … — the first name that's free. */
const nextAxisName = (elements: Parameters<typeof variantAxisError>[0]): string => {
  for (const name of ['variant', 'size']) if (variantAxisError(elements, name) === null) return name;
  for (let n = 2; ; n += 1) if (variantAxisError(elements, `variant${n}`) === null) return `variant${n}`;
};

/**
 * The component's variant properties, Figma's Properties section for a
 * component set: each axis with its values (the selected chips are the
 * frame you're editing), and **+** on the header to add one. The canvas draws every combination as a frame.
 * see docs/plans/component-variants-plan.md, phase 6
 */
export const VariantsSection = (): JSX.Element => {
  const axes = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.variantAxes ?? EMPTY_AXES);
  const nonDesktop = useCanvasStore((s) => s.activeBreakpointId !== DESKTOP_BREAKPOINT_ID);
  const activeVariantKey = useCanvasStore((s) => s.activeVariantKey);
  const setActiveVariant = useCanvasStore((s) => s.setActiveVariant);
  const editVariants = useCanvasStore((s) => s.editVariants);
  const [justAdded, setJustAdded] = useState<{ prop: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Routing drops variant edits at other breakpoints, so leave the variant.
  useEffect(() => {
    if (nonDesktop && activeVariantKey !== null) setActiveVariant(null);
  }, [nonDesktop, activeVariantKey, setActiveVariant]);

  const picks = fullPicks(axes, activeVariantKey);

  const handleAddProperty = (): void => {
    const elements = useCanvasStore.getState().elements;
    const prop = nextAxisName(elements);
    const second = nextValueName({ prop, values: ['default'], defaultValue: 'default' });
    const axis = { prop, values: ['default', second], defaultValue: 'default' };
    const problem = combinationLimitError(axes, [...axes, axis]);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setError(null);
    editVariants((current) => addVariantAxis(current, axis), keyFor([...axes, axis], { ...picks, [prop]: second }));
    setJustAdded({ prop, value: second });
  };

  const label = axes.length === 0 ? 'Add variant' : 'Add property';
  const plus = (
    <button
      type="button"
      className={styles.headerButton}
      onClick={handleAddProperty}
      disabled={nonDesktop}
      aria-label={label}
      title={nonDesktop ? 'Variants are edited at the desktop breakpoint' : label}
    >
      <IconPlus size={14} />
    </button>
  );

  return (
    <div data-testid="variants-section">
      <Section title="Variants" titleAccessory={plus}>
        <div className={styles.axes}>
          {axes.map((axis) => (
            <VariantAxisRow
              key={axis.prop}
              axis={axis}
              axes={axes}
              picks={picks}
              disabled={nonDesktop}
              renameOnMount={justAdded?.prop === axis.prop ? justAdded.value : undefined}
            />
          ))}
        </div>
        {error !== null && (
          <span className={styles.error} role="alert">
            {error}
          </span>
        )}
      </Section>
      {axes.length > 0 && <VariantInteractions axes={axes} picks={picks} disabled={nonDesktop} />}
    </div>
  );
};
