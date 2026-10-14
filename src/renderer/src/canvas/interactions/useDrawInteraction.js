import { useEffect, useState } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';
import { clampToParent, MIN_SIZE } from '@lib/bounds';
import { resolveInsertParent } from '@lib/insertParent';
import { assetsDirSegment } from '@renderer/src/lib/path';
import { prepareSvgForInsert } from '@renderer/src/lib/svg';
import { hitTest, slotZoneAt } from './canvasHitTest';
import { CLICK_DRAG_THRESHOLD, DEFAULT_IMAGE_SIZE, DEFAULT_NEW_INPUT_HEIGHT, DEFAULT_NEW_INPUT_WIDTH, DEFAULT_NEW_RECT_SIZE, INLINE_SVG_MAX_BYTES, } from './constants';
import { importImage } from '@renderer/src/lib/importImage';
/**
 * Draw state machine for the rectangle / input / image tools, plus the
 * single-click text tool. Owns the `pendingImage` selection: activating
 * the image tool opens a file dialog, and once a file is chosen the
 * pointer drag draws the rect the image fills. A click (sub-threshold
 * drag) drops a default-sized element centered on the cursor.
 */
export const useDrawInteraction = (geometry) => {
    const [draw, setDraw] = useState(null);
    // Image tool: the chosen image's relative path + filename, set after the
    // user picks a file from the dialog. While this is non-null and the tool
    // is 'image', the pointer handlers work like the rectangle draw tool —
    // when the draw completes, an image element is created at the drawn rect.
    const [pendingImage, setPendingImage] = useState(null);
    const activeTool = useCanvasStore((s) => s.activeTool);
    const projectFormat = useCanvasStore((s) => s.projectFormat);
    const projectPath = useCanvasStore((s) => s.projectPath);
    const activePage = useCanvasStore((s) => s.activePage);
    const activeComponent = useCanvasStore((s) => s.activeComponent);
    const setTool = useCanvasStore((s) => s.setTool);
    const createRectangle = useCanvasStore((s) => s.createRectangle);
    const createText = useCanvasStore((s) => s.createText);
    const createImage = useCanvasStore((s) => s.createImage);
    const createSvgElement = useCanvasStore((s) => s.createSvgElement);
    const createInput = useCanvasStore((s) => s.createInput);
    const setElementSlotName = useCanvasStore((s) => s.setElementSlotName);
    const elements = useCanvasStore((s) => s.elements);
    const { toFrame, measureElementInFrame, parentSizeOf } = geometry;
    // When the image tool is activated, immediately open a file dialog so
    // the user picks a file before drawing. If they cancel, revert to the
    // select tool. If they pick a file, copy it into assets/ and store the
    // result so the draw handler can create an image element on pointer-up.
    useEffect(() => {
        if (activeTool !== 'image') {
            setPendingImage(null);
            return;
        }
        // Already have a pending image (e.g. re-render), don't re-open dialog.
        if (pendingImage)
            return;
        // Images land on a page, a view, or a component alike.
        if (!activePage && !activeComponent) {
            setTool('select');
            return;
        }
        if (!projectPath) {
            setTool('select');
            return;
        }
        const assetsPath = `${projectPath}/${assetsDirSegment(projectFormat)}`;
        let cancelled = false;
        void (async () => {
            const chosen = await window.scamp.chooseImage({ defaultPath: assetsPath });
            if (cancelled)
                return;
            if (chosen.canceled || !chosen.path) {
                setTool('select');
                return;
            }
            // Copy to assets in every case — SVGs keep the on-disk reference for
            // reload; rasters are referenced by `<img src>`.
            const copied = await importImage(chosen.path, projectPath);
            if (cancelled)
                return;
            if (copied === null) {
                setTool('select');
                return;
            }
            // New images/SVGs land inside the currently-selected container (or
            // its nearest container ancestor); with nothing selected they fall
            // back to the page root / draw-to-place.
            const store = useCanvasStore.getState();
            const selectedId = store.selectedElementIds[0] ?? null;
            const parentId = resolveInsertParent(store.elements, selectedId, ROOT_ELEMENT_ID);
            // SVG import: inline the (sanitized/normalized) markup so its colours
            // are editable, instead of an opaque <img>. Insert immediately at the
            // viewBox-derived size (ratio-locked in createSvgElement); the user
            // repositions/resizes after. Falls back to <img> for oversized or
            // unparseable files. see docs/archive/2026-07-14-svg-color-editing-plan.md
            if (chosen.path.toLowerCase().endsWith('.svg')) {
                let raw = '';
                try {
                    raw = await window.scamp.readFileText(chosen.path);
                }
                catch {
                    raw = '';
                }
                if (cancelled)
                    return;
                const prepared = raw.length > 0 && raw.length <= INLINE_SVG_MAX_BYTES
                    ? prepareSvgForInsert(raw)
                    : null;
                if (prepared) {
                    const width = Math.max(MIN_SIZE, Math.round(prepared.width ?? DEFAULT_IMAGE_SIZE));
                    const height = Math.max(MIN_SIZE, Math.round(prepared.height ?? DEFAULT_IMAGE_SIZE));
                    createSvgElement({
                        parentId,
                        x: 40,
                        y: 40,
                        width,
                        height,
                        svgSource: prepared.svgSource,
                        src: copied.relativePath,
                        ...(prepared.viewBox !== undefined ? { viewBox: prepared.viewBox } : {}),
                        ...(prepared.fill !== undefined ? { fill: prepared.fill } : {}),
                        ...(prepared.stroke !== undefined ? { stroke: prepared.stroke } : {}),
                        ...(prepared.strokeWidth !== undefined
                            ? { strokeWidth: prepared.strokeWidth }
                            : {}),
                    });
                    setTool('select');
                    return;
                }
                // Large / unparseable svg → fall through to the <img> flow.
            }
            // With a container selected, drop the image straight into it at a
            // default size (matching paste). With nothing selected, keep the
            // draw-to-place gesture so the user can size/position it freely.
            if (selectedId) {
                createImage({
                    parentId,
                    x: 20,
                    y: 20,
                    width: DEFAULT_IMAGE_SIZE,
                    height: DEFAULT_IMAGE_SIZE,
                    src: copied.relativePath,
                    alt: copied.fileName,
                });
                setTool('select');
                return;
            }
            setPendingImage({ src: copied.relativePath, alt: copied.fileName });
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTool]);
    const beginDrawAt = (e) => {
        // A component slot zone under the cursor routes the new element into the
        // owning instance as slot content; otherwise fall back to the deepest
        // hit element (or the page root). Only named slots carry a slotName tag;
        // the default `children` slot routes by parent alone.
        const slot = slotZoneAt(e.clientX, e.clientY);
        const hitId = slot?.ownerId ?? hitTest(e.clientX, e.clientY) ?? ROOT_ELEMENT_ID;
        const slotName = slot && slot.slotName !== 'children' ? slot.slotName : undefined;
        const parentRect = measureElementInFrame(hitId) ?? { x: 0, y: 0, w: 0, h: 0 };
        const { x, y } = toFrame(e.clientX, e.clientY);
        e.preventDefault();
        e.target.setPointerCapture(e.pointerId);
        setDraw({
            parentId: hitId,
            startX: x - parentRect.x,
            startY: y - parentRect.y,
            currentX: x - parentRect.x,
            currentY: y - parentRect.y,
            parentOffsetX: parentRect.x,
            parentOffsetY: parentRect.y,
            ...(slotName ? { slotName } : {}),
        });
    };
    const tryStart = (e) => {
        // Read-only while previewing a snapshot — no draws or marquee selects.
        if (useCanvasStore.getState().snapshotPreview !== null)
            return false;
        if (activeTool === 'rectangle' || activeTool === 'input') {
            beginDrawAt(e);
            return true;
        }
        if (activeTool === 'text') {
            const slot = slotZoneAt(e.clientX, e.clientY);
            const hitId = slot?.ownerId ?? hitTest(e.clientX, e.clientY) ?? ROOT_ELEMENT_ID;
            const slotName = slot && slot.slotName !== 'children' ? slot.slotName : undefined;
            const parentRect = measureElementInFrame(hitId) ?? { x: 0, y: 0, w: 0, h: 0 };
            const { x, y } = toFrame(e.clientX, e.clientY);
            const localX = x - parentRect.x;
            const localY = y - parentRect.y;
            // Keep the top-left inside the parent so the text isn't placed at
            // a negative offset, but don't force the whole text box to fit —
            // a `parent.w - TEXT_W` clamp drags the text leftward whenever the
            // parent is narrower than the click position plus the default
            // text width, which makes the text land well away from the cursor.
            // Landing at the click point matches user expectation; spill is
            // harmless because the text element sits in its own layer.
            const clampedX = Math.max(0, localX);
            const clampedY = Math.max(0, localY);
            e.preventDefault();
            const textId = createText({
                parentId: hitId,
                x: Math.round(clampedX),
                y: Math.round(clampedY),
            });
            if (slotName)
                setElementSlotName(textId, slotName);
            setTool('select');
            return true;
        }
        if (activeTool === 'image' && pendingImage) {
            // File already chosen — draw a rectangle for the image to fill.
            beginDrawAt(e);
            return true;
        }
        return false;
    };
    const onMove = (e) => {
        if (!draw)
            return false;
        const { x, y } = toFrame(e.clientX, e.clientY);
        setDraw({
            ...draw,
            currentX: x - draw.parentOffsetX,
            currentY: y - draw.parentOffsetY,
        });
        return true;
    };
    const onEnd = () => {
        if (!draw)
            return;
        const dragX = Math.min(draw.startX, draw.currentX);
        const dragY = Math.min(draw.startY, draw.currentY);
        const dragW = Math.abs(draw.currentX - draw.startX);
        const dragH = Math.abs(draw.currentY - draw.startY);
        const parent = parentSizeOf(draw.parentId);
        // If the gesture was effectively a click (no meaningful drag),
        // drop a default-sized rect centered on the cursor instead. The
        // clamp helper afterwards keeps it inside the parent bounds.
        const wasInput = activeTool === 'input';
        const defaultWidth = pendingImage
            ? DEFAULT_IMAGE_SIZE
            : wasInput
                ? DEFAULT_NEW_INPUT_WIDTH
                : DEFAULT_NEW_RECT_SIZE;
        const defaultHeight = pendingImage
            ? DEFAULT_IMAGE_SIZE
            : wasInput
                ? DEFAULT_NEW_INPUT_HEIGHT
                : DEFAULT_NEW_RECT_SIZE;
        const wasClick = dragW < CLICK_DRAG_THRESHOLD && dragH < CLICK_DRAG_THRESHOLD;
        const x = wasClick ? draw.startX - defaultWidth / 2 : dragX;
        const y = wasClick ? draw.startY - defaultHeight / 2 : dragY;
        const w = wasClick ? defaultWidth : dragW;
        const h = wasClick ? defaultHeight : dragH;
        // A flex or grid parent lays its children out itself, so the drawn
        // offset means nothing there — and neither does clamping the SIZE to
        // the parent. Draw the box you want; if it does not fit, a hug parent
        // grows around it and a fixed parent lets it overflow visibly, both
        // of which are what a browser does. The clamp only ever produced
        // surprises: `parentW - x` collapsed anything drawn near the right
        // edge, and reading the parent's model size collapsed anything drawn
        // inside a percentage-width container.
        //
        // x/y are zeroed to match what lands on disk — the generator emits no
        // left/top for a flow child, so a kept offset would vanish on the
        // next round trip anyway.
        // see docs/archive/2026-09-04-flex-sizing-contract-plan.md
        const parentDisplay = elements[draw.parentId]?.display;
        const parentOwnsLayout = parentDisplay === 'flex' || parentDisplay === 'grid';
        const clamped = parentOwnsLayout
            ? { x: 0, y: 0, w: Math.max(MIN_SIZE, w), h: Math.max(MIN_SIZE, h) }
            : clampToParent(x, y, w, h, parent.w, parent.h);
        if (clamped.w >= MIN_SIZE && clamped.h >= MIN_SIZE) {
            let createdId;
            if (pendingImage) {
                createdId = createImage({
                    parentId: draw.parentId,
                    x: Math.round(clamped.x),
                    y: Math.round(clamped.y),
                    width: Math.round(clamped.w),
                    height: Math.round(clamped.h),
                    src: pendingImage.src,
                    alt: pendingImage.alt,
                });
                setPendingImage(null);
            }
            else if (wasInput) {
                createdId = createInput({
                    parentId: draw.parentId,
                    x: Math.round(clamped.x),
                    y: Math.round(clamped.y),
                    width: Math.round(clamped.w),
                    height: Math.round(clamped.h),
                });
            }
            else {
                createdId = createRectangle({
                    parentId: draw.parentId,
                    x: Math.round(clamped.x),
                    y: Math.round(clamped.y),
                    width: Math.round(clamped.w),
                    height: Math.round(clamped.h),
                });
            }
            // Tag the new element as named-slot content when the draw began in a
            // slot zone (parentId is already the owning instance).
            if (draw.slotName)
                setElementSlotName(createdId, draw.slotName);
            setTool('select');
        }
        setDraw(null);
    };
    return { draw, tryStart, onMove, onEnd };
};
