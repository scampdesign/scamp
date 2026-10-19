import { useEffect, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { DESKTOP_BREAKPOINT_ID } from '@shared/types';
import { ROOT_ELEMENT_ID, variantKey, type VariantAxis } from '@lib/element';
import { addVariantAxis, variantAxisError } from '@lib/variantAxes';

import { VariantAxisRow } from './VariantAxisRow';
import styles from './VariantBar.module.css';

const EMPTY_AXES: ReadonlyArray<VariantAxis> = [];

/** `variant`, then `size`, then `variant2`, … — the first name that's free. */
const nextAxisName = (elements: Parameters<typeof variantAxisError>[0]): string => {
  for (const name of ['variant', 'size']) if (variantAxisError(elements, name) === null) return name;
  for (let n = 2; ; n += 1) if (variantAxisError(elements, `variant${n}`) === null) return `variant${n}`;
};

/**
 * The component editor's variant axes, above the artboard. Each value
 * is a look you edit by selecting it; the canvas draws the others
 * beside it. see docs/plans/component-variants-plan.md
 */
export const VariantBar = (): JSX.Element => {
  const axes = useCanvasStore((s) => s.elements[ROOT_ELEMENT_ID]?.variantAxes ?? EMPTY_AXES);
  const nonDesktop = useCanvasStore((s) => s.activeBreakpointId !== DESKTOP_BREAKPOINT_ID);
  const activeVariantKey = useCanvasStore((s) => s.activeVariantKey);
  const setActiveVariant = useCanvasStore((s) => s.setActiveVariant);
  const editVariants = useCanvasStore((s) => s.editVariants);
  const [justAdded, setJustAdded] = useState<{ prop: string; value: string } | null>(null);

  // Routing drops variant edits at other breakpoints, so leave the variant.
  useEffect(() => {
    if (nonDesktop && activeVariantKey !== null) setActiveVariant(null);
  }, [nonDesktop, activeVariantKey, setActiveVariant]);

  const handleAddAxis = (): void => {
    const prop = nextAxisName(useCanvasStore.getState().elements);
    const second = `${prop}-2`;
    editVariants(
      (elements) => addVariantAxis(elements, { prop, values: ['default', second], defaultValue: 'default' }),
      variantKey(prop, second)
    );
    setJustAdded({ prop, value: second });
  };

  return (
    <div className={styles.bar} data-testid="variant-bar">
      {axes.map((axis) => (
        <VariantAxisRow
          key={axis.prop}
          axis={axis}
          disabled={nonDesktop}
          renameOnMount={justAdded?.prop === axis.prop ? justAdded.value : undefined}
        />
      ))}
      <button
        type="button"
        className={styles.addAxis}
        onClick={handleAddAxis}
        disabled={nonDesktop}
        title={nonDesktop ? 'Variants are edited at the desktop breakpoint' : undefined}
      >
        {axes.length === 0 ? '+ Add variant' : '+ Add axis'}
      </button>
    </div>
  );
};
