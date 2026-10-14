import { useCanvasStore } from '@store/canvasSlice';
/**
 * Build a callback the color picker calls on every drag tick to
 * preview the value on the live canvas DOM. Direct style mutation,
 * bypasses React and Zustand entirely — the canvas updates at the
 * cursor's frame rate without paying the cost of the full sync
 * pipeline on every tick.
 *
 * On pointer release, the picker fires its `onChange` callback
 * which goes through `patchElement` and produces a normal React
 * re-render. That render overwrites the inline style we wrote
 * here with the Zustand-backed value. Same color, no flicker.
 *
 * Returns a no-op when the element isn't currently rendered
 * (selection changed, page switched mid-drag, etc.) — the next
 * commit handles the source-of-truth update anyway.
 *
 * With `fits`, a multi-selection previews on every selected element
 * the section writes to, as the commit will.
 */
export const previewStyle = (elementId, styleProperty, fits) => {
    return (value) => {
        const { selectedElementIds, elements } = useCanvasStore.getState();
        const ids = fits !== undefined && selectedElementIds.length > 1 && selectedElementIds.includes(elementId)
            ? selectedElementIds.filter((id) => {
                const el = elements[id];
                return el !== undefined && fits(el);
            })
            : [elementId];
        for (const id of ids) {
            const node = document.querySelector(`[data-scamp-id="${id}"]`);
            if (!node)
                continue;
            // CSSStyleDeclaration's typed setter expects a string. We
            // cast via `unknown` to a record-like type because the typed
            // surface doesn't permit indexed string assignment, but the
            // runtime semantics are exactly that.
            node.style[styleProperty] = value;
        }
    };
};
