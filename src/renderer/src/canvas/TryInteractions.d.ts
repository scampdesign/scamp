type Props = {
    scale: number;
};
/**
 * The component, read-only, reacting to its interactions as it will in
 * the browser: hover, press, focus, a click, a click outside, and
 * Escape change the value drawn. Outside the editing frame, so trying it
 * never selects or edits anything. The canvas draws with inline styles,
 * which CSS `:hover` can't reach, so the values are tracked here.
 * see docs/plans/component-variants-plan.md, phase 7
 */
export declare const TryInteractions: ({ scale }: Props) => JSX.Element;
export {};
