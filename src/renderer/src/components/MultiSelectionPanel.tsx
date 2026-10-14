import { useCanvasStore } from '@store/canvasSlice';
import { leadFor, SECTION_FITS, type SectionFit } from '@lib/multiEdit';
import { SizeSection } from './sections/SizeSection';
import { LayoutSection } from './sections/LayoutSection';
import { DisplaySection } from './sections/DisplaySection';
import { SpacingSection } from './sections/SpacingSection';
import { BackgroundSection } from './sections/BackgroundSection';
import { BorderSection } from './sections/BorderSection';
import { TypographySection } from './sections/TypographySection';
import { VisibilitySection } from './sections/VisibilitySection';
import { ShadowsSection } from './sections/ShadowsSection';
import { FiltersSection } from './sections/FiltersSection';
import { TransformSection } from './sections/TransformSection';
import { TransitionsSection } from './sections/TransitionsSection';
import { ExportSection } from './sections/ExportSection';
import styles from './PropertiesPanel.module.css';

const useLead = (fits: SectionFit): string | null =>
  useCanvasStore((s) => leadFor(s.selectedElementIds, s.elements, fits));

/**
 * The typed panel for two or more selected elements: the sections that
 * can edit a set, each reading from the first selected element it fits
 * and writing to all of them; a field the elements disagree on reads
 * **Mixed**. Sections that edit one element's own things (name, tag,
 * image, SVG source, position, table style) and Animation show only for
 * a single element. see docs/archive/2026-10-14-multi-select-edit-plan.md
 */
export const MultiSelectionPanel = (): JSX.Element => {
  const count = useCanvasStore((s) => s.selectedElementIds.length);
  const typography = useLead(SECTION_FITS.typography);
  const size = useLead(SECTION_FITS.size);
  const layout = useLead(SECTION_FITS.layout);
  const display = useLead(SECTION_FITS.display);
  const box = useLead(SECTION_FITS.box);

  return (
    <div className={styles.uiPanelBody}>
      <p className={styles.multiNote} data-testid="multi-select-note">
        {count} elements selected. A change applies to each one it fits.
      </p>
      {typography !== null && <TypographySection elementId={typography} />}
      {size !== null && <SizeSection elementId={size} />}
      {layout !== null && <LayoutSection elementId={layout} />}
      {display !== null && <DisplaySection elementId={display} />}
      {box !== null && <SpacingSection elementId={box} />}
      {box !== null && <BackgroundSection elementId={box} />}
      {box !== null && <BorderSection elementId={box} />}
      {box !== null && <ShadowsSection elementId={box} />}
      {box !== null && <FiltersSection elementId={box} />}
      {box !== null && <TransformSection elementId={box} />}
      {box !== null && <VisibilitySection elementId={box} />}
      {box !== null && <TransitionsSection elementId={box} />}
      <ExportSection />
    </div>
  );
};
