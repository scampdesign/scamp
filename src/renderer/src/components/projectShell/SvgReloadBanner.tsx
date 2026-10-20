import { useCanvasStore } from '@store/canvasSlice';
import { SVG_SRC_ATTR } from '@lib/element';
import { prepareSvgForInsert } from '@renderer/src/lib/svg';
import styles from '../ProjectShell.module.css';

/** Basename of an asset reference path (`/assets/foo.svg` → `foo.svg`). */
const basenameOf = (path: string | undefined): string | null =>
  path ? (path.split(/[\\/]/).pop() ?? null) : null;

/**
 * Offer to reload inline SVG elements when their source `.svg` file changed
 * on disk (external edit). Reloading re-runs `prepareSvgForInsert` and
 * replaces every matching element's `svgSource` — a clear warning that
 * in-Scamp colour edits are lost. see docs/archive/2026-07-14-svg-color-editing-plan.md
 */
export const SvgReloadBanner = (): JSX.Element | null => {
  const pending = useCanvasStore((s) => s.pendingSvgReload);
  const setPending = useCanvasStore((s) => s.setPendingSvgReload);
  const patchElement = useCanvasStore((s) => s.patchElement);
  if (!pending) return null;

  const handleReload = (): void => {
    const prepared = prepareSvgForInsert(pending.content);
    if (prepared) {
      const elements = useCanvasStore.getState().elements;
      for (const el of Object.values(elements)) {
        if (
          el.tag === 'svg' &&
          basenameOf(el.attributes?.[SVG_SRC_ATTR]) === pending.fileName
        ) {
          // Refresh the viewBox too (the artwork may have been reshaped),
          // merging so the asset-path attribute is preserved.
          const attributes =
            prepared.viewBox !== undefined
              ? { ...el.attributes, viewBox: prepared.viewBox }
              : el.attributes;
          patchElement(el.id, {
            svgSource: prepared.svgSource,
            ...(attributes !== undefined ? { attributes } : {}),
            ...(prepared.fill !== undefined ? { fill: prepared.fill } : {}),
            ...(prepared.stroke !== undefined ? { stroke: prepared.stroke } : {}),
            ...(prepared.strokeWidth !== undefined
              ? { strokeWidth: prepared.strokeWidth }
              : {}),
          });
        }
      }
    }
    setPending(null);
  };

  return (
    <div
      className={styles.noticeBanner}
      data-testid="svg-reload-banner"
    >
      <span>
        <strong>{pending.fileName}</strong> was updated externally. Reloading
        replaces the inline SVG — colour edits made in Scamp will be lost.
      </span>
      <div className={styles.snapshotPreviewActions}>
        <button
          type="button"
          className={styles.noticeBannerButton}
          onClick={handleReload}
        >
          Reload SVG
        </button>
        <button
          type="button"
          className={styles.noticeBannerButton}
          onClick={() => setPending(null)}
        >
          Keep current
        </button>
      </div>
    </div>
  );
};
