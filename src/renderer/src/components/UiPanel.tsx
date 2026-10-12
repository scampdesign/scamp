import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { PositionSection } from './sections/PositionSection';
import { SizeSection } from './sections/SizeSection';
import { LayoutSection } from './sections/LayoutSection';
import { SpacingSection } from './sections/SpacingSection';
import { TableStyleSection } from './sections/TableStyleSection';
import { BackgroundSection } from './sections/BackgroundSection';
import { BorderSection } from './sections/BorderSection';
import { ElementSection } from './sections/ElementSection';
import { TypographySection } from './sections/TypographySection';
import { ImageSection } from './sections/ImageSection';
import { SvgSection } from './sections/SvgSection';
import { VisibilitySection } from './sections/VisibilitySection';
import { ShadowsSection } from './sections/ShadowsSection';
import { FiltersSection } from './sections/FiltersSection';
import { TransformSection } from './sections/TransformSection';
import { TransitionsSection } from './sections/TransitionsSection';
import { AnimationSection } from './sections/AnimationSection';
import { ExportSection } from './sections/ExportSection';
import styles from './PropertiesPanel.module.css';

/**
 * The typed view of the properties panel. Reads the primary selected
 * element from the store and renders the sections that apply to its
 * element type. Root is treated like a regular rectangle — it just
 * has no parent, so Position is hidden.
 *
 * Each section is its own small component that reads its own slice of
 * the store and writes via `patchElement`. The UI panel is a thin
 * orchestrator with no edit logic of its own.
 */
export const UiPanel = (): JSX.Element => {
  const elementId = useCanvasStore((s) => s.selectedElementIds[0] ?? null);
  const element = useCanvasStore((s) => (elementId ? s.elements[elementId] : undefined));
  const parentIsFlex = useCanvasStore((s) => {
    if (!element || !element.parentId) return false;
    const parent = s.elements[element.parentId];
    return parent?.display === 'flex';
  });

  if (!elementId || !element) return <></>;

  const isRoot = elementId === ROOT_ELEMENT_ID;
  const isText = element.type === 'text';
  const isImage = element.type === 'image';
  const isInput = element.type === 'input';
  const isSvg = element.tag === 'svg';
  const isInstance = element.type === 'component-instance';
  // Position is only meaningful when there's a non-flex parent to
  // anchor against. Root has no parent; flex children flow with the
  // layout engine.
  const showPosition = !isRoot && !parentIsFlex;

  // A component instance's appearance belongs to the component
  // definition, and the page can't override it — the only thing the
  // page owns is the instance's size. Showing background / border /
  // spacing here would offer edits that silently vanish on the next
  // reload, because the generator has nowhere to write them.
  // see docs/notes/components-data-model.md
  if (isInstance) {
    return (
      <div className={styles.uiPanelBody}>
        <ElementSection elementId={elementId} />
        <SizeSection elementId={elementId} />
        <ExportSection />
      </div>
    );
  }

  return (
    <div className={styles.uiPanelBody}>
      {/* Element section handles tag, link controls, and tag-specific
          attributes. Not rendered for root because the root's tag is
          always `<div>` (the wrapping page component) and the section
          has nothing meaningful to show there. */}
      {!isRoot && <ElementSection elementId={elementId} />}
      {/* Typography sits right below Element type: for a text element it's
          the primary thing to edit, so it leads the style sections. Image
          leads for the same reason — the source and fit are what you came
          for, not the twelfth section down past Filters. */}
      {isText && <TypographySection elementId={elementId} />}
      {isImage && <ImageSection elementId={elementId} />}
      {showPosition && <PositionSection elementId={elementId} />}
      <SizeSection elementId={elementId} />
      {!isText && !isInput && <LayoutSection elementId={elementId} />}
      {element.tag === 'table' && <TableStyleSection elementId={elementId} />}
      <SpacingSection elementId={elementId} hideMargin={isRoot} />
      {/* An icon's own colors and stroke come before the box's background
          and border, which an SVG rarely uses. */}
      {isSvg && <SvgSection elementId={elementId} />}
      <BackgroundSection elementId={elementId} />
      <BorderSection elementId={elementId} />
      <ShadowsSection elementId={elementId} />
      <FiltersSection elementId={elementId} />
      <TransformSection elementId={elementId} />
      <VisibilitySection elementId={elementId} />
      <TransitionsSection elementId={elementId} />
      <AnimationSection elementId={elementId} />
      <ExportSection />
    </div>
  );
};
