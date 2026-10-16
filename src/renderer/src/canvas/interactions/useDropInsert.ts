import { type DragEvent } from 'react';

import { useCanvasStore } from '@store/canvasSlice';
import { ROOT_ELEMENT_ID } from '@lib/element';

import { prepareSvgForInsert } from '../../lib/svg';
import { hitTest } from './canvasHitTest';
import { DEFAULT_IMAGE_SIZE, INLINE_SVG_MAX_BYTES } from './constants';
import type { CanvasGeometry } from './types';
import { importImage } from '@renderer/src/lib/importImage';
import { useAppLogStore } from '@store/appLogSlice';
import { imageUrlFromDrop } from '@lib/imageUrlFromDrop';

export type DropInsert = {
  handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: DragEvent<HTMLDivElement>) => void;
};

/**
 * Accepts images dropped onto the canvas: files from the OS file manager,
 * and images dragged from a web browser (a URL, or markup with an
 * `<img>`). Raster images are copied or downloaded into the project's
 * assets dir and inserted as `<img>`; a drop that can't be used says why.
 * see docs/plans/image-drop-plan.md SVGs are sanitized/normalized and inlined as an editable
 * `<svg>` element (so fill/stroke are editable), unless they're larger
 * than INLINE_SVG_MAX_BYTES, in which case they fall back to the asset +
 * `<img>` path. see docs/archive/2026-06-30-svg-improvements-plan.md
 */
/** A file's bytes as a `data:` URL. */
const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = (): void => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

export const useDropInsert = (geometry: CanvasGeometry): DropInsert => {
  const activePage = useCanvasStore((s) => s.activePage);
  const activeComponent = useCanvasStore((s) => s.activeComponent);
  const projectPath = useCanvasStore((s) => s.projectPath);
  const createImage = useCanvasStore((s) => s.createImage);
  const createSvgElement = useCanvasStore((s) => s.createSvgElement);

  const showCanvasNotice = useCanvasStore((s) => s.showCanvasNotice);

  /** Refuse a drop with a reason, on the canvas and in the app log. */
  const refuse = (message: string): void => {
    showCanvasNotice(message);
    useAppLogStore.getState().log('warn', `Drop: ${message}`);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    const types = e.dataTransfer.types;
    // Files from the file manager; a URL or markup from a web browser.
    if (types.includes('Files') || types.includes('text/uri-list') || types.includes('text/html')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (!activePage && !activeComponent) {
      refuse('Open a page to drop an image onto it.');
      return;
    }
    if (!projectPath) return;

    const hitId = hitTest(e.clientX, e.clientY) ?? ROOT_ELEMENT_ID;
    const parentRect =
      geometry.measureElementInFrame(hitId) ?? { x: 0, y: 0, w: 0, h: 0 };
    const { x, y } = geometry.toFrame(e.clientX, e.clientY);
    const parent = geometry.parentSizeOf(hitId);

    // Place a w×h box at the drop point in the parent's local space,
    // clamped inside the parent.
    const placement = (w: number, h: number): { x: number; y: number } => ({
      x: Math.round(Math.max(0, Math.min(x - parentRect.x, parent.w - w))),
      y: Math.round(Math.max(0, Math.min(y - parentRect.y, parent.h - h))),
    });

    const placeImage = (asset: { relativePath: string; fileName: string }): void => {
      const pos = placement(DEFAULT_IMAGE_SIZE, DEFAULT_IMAGE_SIZE);
      createImage({
        parentId: hitId,
        x: pos.x,
        y: pos.y,
        width: DEFAULT_IMAGE_SIZE,
        height: DEFAULT_IMAGE_SIZE,
        src: asset.relativePath,
        alt: asset.fileName,
      });
    };

    /** Download (or decode) an image URL into the project's assets, then place it. */
    const insertFromUrl = async (url: string, assetName?: string): Promise<void> => {
      const { setImageImportBusy } = useCanvasStore.getState();
      setImageImportBusy(true);
      try {
        const result = await window.scamp.fetchImportImage({
          url,
          projectPath,
          ...(assetName !== undefined ? { assetName } : {}),
        });
        if (result.ok) placeImage(result);
        else refuse(`Couldn't add the image: ${result.error}`);
      } finally {
        useCanvasStore.getState().setImageImportBusy(false);
      }
    };

    const insertRaster = async (file: File): Promise<void> => {
      const filePath = window.scamp.pathForFile(file);
      if (filePath === '') {
        // No file on disk (a browser handed the image over as bytes):
        // send it as a data: URL through the same import path.
        await insertFromUrl(await readAsDataUrl(file), file.name.replace(/\.[^.]*$/, ''));
        return;
      }
      const copied = await importImage(filePath, projectPath);
      if (copied === null) refuse(`Couldn't add ${file.name}. The app log has the details.`);
      else placeImage(copied);
    };

    const file = e.dataTransfer.files[0];
    if (file === undefined) {
      const url = imageUrlFromDrop({
        uriList: e.dataTransfer.getData('text/uri-list'),
        html: e.dataTransfer.getData('text/html'),
      });
      if (url === null) refuse("That drag didn't carry an image.");
      else void insertFromUrl(url);
      return;
    }
    if (!file.type.startsWith('image/')) {
      refuse(`${file.name} isn't an image. Drop a PNG, JPEG, WebP, GIF, or SVG.`);
      return;
    }

    const isSvg =
      file.type === 'image/svg+xml' ||
      file.name.toLowerCase().endsWith('.svg');
    if (isSvg) {
      void (async (): Promise<void> => {
        const text = await file.text();
        const prepared = prepareSvgForInsert(text);
        if (prepared && text.length <= INLINE_SVG_MAX_BYTES) {
          const w = Math.round(prepared.width ?? DEFAULT_IMAGE_SIZE);
          const h = Math.round(prepared.height ?? DEFAULT_IMAGE_SIZE);
          const pos = placement(w, h);
          createSvgElement({
            parentId: hitId,
            x: pos.x,
            y: pos.y,
            width: w,
            height: h,
            svgSource: prepared.svgSource,
            ...(prepared.viewBox !== undefined ? { viewBox: prepared.viewBox } : {}),
            ...(prepared.fill !== undefined ? { fill: prepared.fill } : {}),
            ...(prepared.stroke !== undefined ? { stroke: prepared.stroke } : {}),
            ...(prepared.strokeWidth !== undefined
              ? { strokeWidth: prepared.strokeWidth }
              : {}),
          });
          return;
        }
        await insertRaster(file);
      })();
      return;
    }

    void insertRaster(file);
  };

  return { handleDragOver, handleDrop };
};
