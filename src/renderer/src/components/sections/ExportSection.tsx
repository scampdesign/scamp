import { useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { classNameFor } from '@lib/generateCode';
import {
  capturePng,
  captureSvg,
  suggestExportFilename,
} from '@renderer/src/lib/exportCapture';
import type { ExportFormat } from '@shared/types';
import { Button } from '../controls/Button';
import { EnumSelect } from '../controls/EnumSelect';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Section, Row } from './Section';
import styles from './ExportSection.module.css';
import { canvasNodeById } from '../../canvas/canvasDom';

type Scope =
  | { kind: 'page' }
  | { kind: 'element'; elementId: string; className: string }
  | { kind: 'disabled'; reason: string };

const FORMAT_OPTIONS: ReadonlyArray<{ value: ExportFormat; label: string }> = [
  { value: 'png', label: 'PNG' },
  { value: 'svg', label: 'SVG' },
];

const SCALE_OPTIONS: ReadonlyArray<{ value: '1' | '2' | '3'; label: string }> = [
  { value: '1', label: '1×' },
  { value: '2', label: '2×' },
  { value: '3', label: '3×' },
];

const findCanvasFrame = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-testid="canvas-frame"]');

/**
 * Look up an element node by id, *scoped to the canvas frame*. The
 * layers panel (`ElementTree`) also tags its rows with
 * `data-element-id`, so a top-level `document.querySelector` would
 * return the layers-panel badge — a small Scamp UI element — instead
 * of the rendered canvas element. Scoping to the frame guarantees we
 * grab the actual design content.
 */
const findElementNode = (elementId: string): HTMLElement | null => canvasNodeById(elementId);

/**
 * Read the live intrinsic size of a DOM node. The canvas frame and
 * its descendants are sized in CSS px regardless of the user's zoom
 * (zoom applies via `transform: scale`, which doesn't affect
 * `offsetWidth` / `offsetHeight`), so this returns the design's
 * native dimensions every time.
 */
const readSize = (
  node: HTMLElement
): { width: number; height: number } => ({
  width: node.offsetWidth,
  height: node.offsetHeight,
});

export const EXPORT_SECTION_DOM_ID = 'scamp-export-section';

export const ExportSection = (): JSX.Element | null => {
  const selectedIds = useCanvasStore((s) => s.selectedElementIds);
  const elements = useCanvasStore((s) => s.elements);
  const activePage = useCanvasStore((s) => s.activePage);
  const projectPath = useCanvasStore((s) => s.projectPath);
  const exportSettings = useCanvasStore((s) => s.exportSettings);
  const setExportFormat = useCanvasStore((s) => s.setExportFormat);
  const setExportPngScale = useCanvasStore((s) => s.setExportPngScale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope: Scope = (() => {
    if (selectedIds.length === 0) return { kind: 'page' };
    if (selectedIds.length > 1) {
      return {
        kind: 'disabled',
        reason: 'Select a single element or nothing to export.',
      };
    }
    const id = selectedIds[0]!;
    const el = elements[id];
    if (!el) return { kind: 'disabled', reason: 'Selection unavailable.' };
    return { kind: 'element', elementId: id, className: classNameFor(el) };
  })();

  const sizeReadout = useSizeReadout(scope, exportSettings.lastFormat,
    exportSettings.lastPngScale);

  const handleExport = async (): Promise<void> => {
    if (scope.kind === 'disabled') return;
    setError(null);

    const frame = findCanvasFrame();
    if (!frame) {
      setError('Canvas not found.');
      return;
    }

    const node =
      scope.kind === 'element'
        ? findElementNode(scope.elementId)
        : frame;
    if (!node) {
      setError('Export target not found in the DOM.');
      return;
    }
    const size = readSize(node);
    if (size.width === 0 || size.height === 0) {
      setError('Export target has zero size.');
      return;
    }

    const baseName =
      scope.kind === 'page'
        ? activePage?.name ?? 'page'
        : scope.className;
    const filename = suggestExportFilename(baseName);

    const savePath = await window.scamp.exportChooseSavePath({
      filename,
      format: exportSettings.lastFormat,
      defaultDir: projectPath || undefined,
    });
    if (savePath.canceled || !savePath.path) return;

    setBusy(true);
    try {
      if (exportSettings.lastFormat === 'png') {
        const dataUrl = await capturePng({
          node,
          backgroundColor: null,
          width: size.width,
          height: size.height,
          scale: exportSettings.lastPngScale,
        });
        const result = await window.scamp.exportPng({ dataUrl, path: savePath.path });
        if (!result.ok) setError(result.error ?? 'Failed to write PNG.');
      } else {
        const svgString = await captureSvg({
          node,
          backgroundColor: null,
          width: size.width,
          height: size.height,
        });
        const result = await window.scamp.exportSvg({ svgString, path: savePath.path });
        if (!result.ok) setError(result.error ?? 'Failed to write SVG.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const buttonLabel =
    scope.kind === 'element'
      ? `Export ${scope.className}`
      : 'Export page';

  const disabled = scope.kind === 'disabled' || busy;

  return (
    <div id={EXPORT_SECTION_DOM_ID}>
      <Section title="Export">
        <Row label="Format">
          <EnumSelect<ExportFormat>
            value={exportSettings.lastFormat}
            options={FORMAT_OPTIONS}
            onChange={setExportFormat}
            title="Export format"
          />
        </Row>
        {exportSettings.lastFormat === 'png' && (
          <Row label="Scale">
            <SegmentedControl<'1' | '2' | '3'>
              value={String(exportSettings.lastPngScale) as '1' | '2' | '3'}
              options={SCALE_OPTIONS}
              onChange={(v) =>
                setExportPngScale(Number(v) as 1 | 2 | 3)
              }
              title="PNG scale factor"
            />
          </Row>
        )}
        {exportSettings.lastFormat === 'svg' && (
          <div className={styles.hint}>
            SVG export works best for simple layouts. Complex CSS
            effects may not be fully captured.
          </div>
        )}
        <Row label="Size">
          <span className={styles.sizeReadout}>{sizeReadout}</span>
        </Row>
        {scope.kind === 'disabled' && (
          <div className={styles.hint}>{scope.reason}</div>
        )}
        {error && <div className={styles.error}>{error}</div>}
        <Row label="">
          <Button
            variant="addRow"
            onClick={() => void handleExport()}
            disabled={disabled}
          >
            {busy ? 'Exporting…' : buttonLabel}
          </Button>
        </Row>
      </Section>
    </div>
  );
};

/**
 * Live size readout. Reads `offsetWidth` / `offsetHeight` from the
 * canvas frame or the selected element each time the dependencies
 * change so the user sees the actual export dimensions, not a
 * stale cached pair.
 */
const useSizeReadout = (
  scope: Scope,
  format: ExportFormat,
  pngScale: 1 | 2 | 3
): string => {
  const frame = findCanvasFrame();
  let width = 0;
  let height = 0;
  if (scope.kind === 'page' && frame) {
    ({ width, height } = readSize(frame));
  } else if (scope.kind === 'element') {
    const node = findElementNode(scope.elementId);
    if (node) ({ width, height } = readSize(node));
  }
  if (width === 0 || height === 0) return '—';
  if (format === 'png') {
    return `${width * pngScale} × ${height * pngScale}px`;
  }
  return `${width} × ${height}px`;
};
