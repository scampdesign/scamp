import { useEffect } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { SVG_SRC_ATTR } from '@lib/element';
/** Basename of an asset reference path (`/assets/foo.svg` → `foo.svg`). */
const basenameOf = (path) => path ? (path.split(/[\\/]/).pop() ?? null) : null;
/**
 * Listen for external changes to imported SVG asset files and, when one
 * is referenced by an inline SVG element on the current canvas, stage a
 * reload offer (consumed by `SvgReloadBanner`). Mounted once by
 * ProjectShell. see docs/archive/2026-07-14-svg-color-editing-plan.md
 */
export const useSvgAssetReload = () => {
    useEffect(() => {
        return window.scamp.onSvgAssetChanged((payload) => {
            const elements = useCanvasStore.getState().elements;
            const referenced = Object.values(elements).some((el) => el.tag === 'svg' &&
                basenameOf(el.attributes?.[SVG_SRC_ATTR]) === payload.fileName);
            if (referenced)
                useCanvasStore.getState().setPendingSvgReload(payload);
        });
    }, []);
};
