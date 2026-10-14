import type { SectionFit } from '@lib/multiEdit';
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
export declare const previewStyle: (elementId: string, styleProperty: keyof CSSStyleDeclaration, fits?: SectionFit) => ((value: string) => void);
