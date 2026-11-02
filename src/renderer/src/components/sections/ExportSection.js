import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { classNameFor } from '@lib/generateCode';
import { capturePng, captureSvg, suggestExportFilename, } from '@renderer/src/lib/exportCapture';
import { Button } from '../controls/Button';
import { EnumSelect } from '../controls/EnumSelect';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Section, Row } from './Section';
import styles from './ExportSection.module.css';
import { canvasNodeById, canvasQuery, isHtmlNode } from '../../canvas/canvasDom';
const FORMAT_OPTIONS = [
    { value: 'png', label: 'PNG' },
    { value: 'svg', label: 'SVG' },
];
const SCALE_OPTIONS = [
    { value: '1', label: '1×' },
    { value: '2', label: '2×' },
    { value: '3', label: '3×' },
];
// The iframe canvas draws the page inside the frame, in its own body.
const findCanvasFrame = () => {
    const frame = document.querySelector('[data-testid="canvas-frame"]');
    const body = canvasQuery(frame, 'body');
    return isHtmlNode(body) ? body : frame;
};
/**
 * Look up an element node by id, *scoped to the canvas frame*. The
 * layers panel (`ElementTree`) also tags its rows with
 * `data-element-id`, so a top-level `document.querySelector` would
 * return the layers-panel badge — a small Scamp UI element — instead
 * of the rendered canvas element. Scoping to the frame guarantees we
 * grab the actual design content.
 */
const findElementNode = (elementId) => canvasNodeById(elementId);
/**
 * Read the live intrinsic size of a DOM node. The canvas frame and
 * its descendants are sized in CSS px regardless of the user's zoom
 * (zoom applies via `transform: scale`, which doesn't affect
 * `offsetWidth` / `offsetHeight`), so this returns the design's
 * native dimensions every time.
 */
const readSize = (node) => ({
    width: node.offsetWidth,
    height: node.offsetHeight,
});
export const EXPORT_SECTION_DOM_ID = 'scamp-export-section';
export const ExportSection = () => {
    const selectedIds = useCanvasStore((s) => s.selectedElementIds);
    const elements = useCanvasStore((s) => s.elements);
    const activePage = useCanvasStore((s) => s.activePage);
    const projectPath = useCanvasStore((s) => s.projectPath);
    const exportSettings = useCanvasStore((s) => s.exportSettings);
    const setExportFormat = useCanvasStore((s) => s.setExportFormat);
    const setExportPngScale = useCanvasStore((s) => s.setExportPngScale);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const scope = (() => {
        if (selectedIds.length === 0)
            return { kind: 'page' };
        if (selectedIds.length > 1) {
            return {
                kind: 'disabled',
                reason: 'Select a single element or nothing to export.',
            };
        }
        const id = selectedIds[0];
        const el = elements[id];
        if (!el)
            return { kind: 'disabled', reason: 'Selection unavailable.' };
        return { kind: 'element', elementId: id, className: classNameFor(el) };
    })();
    const sizeReadout = useSizeReadout(scope, exportSettings.lastFormat, exportSettings.lastPngScale);
    const handleExport = async () => {
        if (scope.kind === 'disabled')
            return;
        setError(null);
        const frame = findCanvasFrame();
        if (!frame) {
            setError('Canvas not found.');
            return;
        }
        const node = scope.kind === 'element'
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
        const baseName = scope.kind === 'page'
            ? activePage?.name ?? 'page'
            : scope.className;
        const filename = suggestExportFilename(baseName);
        const savePath = await window.scamp.exportChooseSavePath({
            filename,
            format: exportSettings.lastFormat,
            defaultDir: projectPath || undefined,
        });
        if (savePath.canceled || !savePath.path)
            return;
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
                if (!result.ok)
                    setError(result.error ?? 'Failed to write PNG.');
            }
            else {
                const svgString = await captureSvg({
                    node,
                    backgroundColor: null,
                    width: size.width,
                    height: size.height,
                });
                const result = await window.scamp.exportSvg({ svgString, path: savePath.path });
                if (!result.ok)
                    setError(result.error ?? 'Failed to write SVG.');
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Export failed.');
        }
        finally {
            setBusy(false);
        }
    };
    const buttonLabel = scope.kind === 'element'
        ? `Export ${scope.className}`
        : 'Export page';
    const disabled = scope.kind === 'disabled' || busy;
    return (_jsx("div", { id: EXPORT_SECTION_DOM_ID, children: _jsxs(Section, { title: "Export", children: [_jsx(Row, { label: "Format", children: _jsx(EnumSelect, { value: exportSettings.lastFormat, options: FORMAT_OPTIONS, onChange: setExportFormat, title: "Export format" }) }), exportSettings.lastFormat === 'png' && (_jsx(Row, { label: "Scale", children: _jsx(SegmentedControl, { value: String(exportSettings.lastPngScale), options: SCALE_OPTIONS, onChange: (v) => setExportPngScale(Number(v)), title: "PNG scale factor" }) })), exportSettings.lastFormat === 'svg' && (_jsx("div", { className: styles.hint, children: "SVG export works best for simple layouts. Complex CSS effects may not be fully captured." })), _jsx(Row, { label: "Size", children: _jsx("span", { className: styles.sizeReadout, children: sizeReadout }) }), scope.kind === 'disabled' && (_jsx("div", { className: styles.hint, children: scope.reason })), error && _jsx("div", { className: styles.error, children: error }), _jsx(Row, { label: "", children: _jsx(Button, { variant: "addRow", onClick: () => void handleExport(), disabled: disabled, children: busy ? 'Exporting…' : buttonLabel }) })] }) }));
};
/**
 * Live size readout. Reads `offsetWidth` / `offsetHeight` from the
 * canvas frame or the selected element each time the dependencies
 * change so the user sees the actual export dimensions, not a
 * stale cached pair.
 */
const useSizeReadout = (scope, format, pngScale) => {
    const frame = findCanvasFrame();
    let width = 0;
    let height = 0;
    if (scope.kind === 'page' && frame) {
        ({ width, height } = readSize(frame));
    }
    else if (scope.kind === 'element') {
        const node = findElementNode(scope.elementId);
        if (node)
            ({ width, height } = readSize(node));
    }
    if (width === 0 || height === 0)
        return '—';
    if (format === 'png') {
        return `${width * pngScale} × ${height * pngScale}px`;
    }
    return `${width} × ${height}px`;
};
