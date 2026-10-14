type Props = {
    elementId: string;
};
/**
 * SVG Colours + stroke width for an inline `<svg>` element. Surfaces every
 * unique colour in the artwork as an editable swatch: concrete colours in
 * the source are rewritten in `svgSource`; the root-hoisted `fill`/`stroke`
 * are edited as typed fields; and `currentColor` maps to the element's CSS
 * `color`. Rendered by UiPanel only when `tag === 'svg'`.
 * see docs/archive/2026-07-14-svg-color-editing-plan.md
 */
export declare const SvgSection: ({ elementId }: Props) => JSX.Element | null;
export {};
