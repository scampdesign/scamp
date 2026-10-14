import type { DisplayMode, DisplayOuter } from '@lib/element';
type Props = {
    display: DisplayMode;
    outer: DisplayOuter | undefined;
    onChange: (outer: DisplayOuter | undefined) => void;
    /** Several selected elements disagree: show **Mixed**, and commit whatever is picked. */
    mixed?: boolean;
};
/** The outer half of CSS `display`. see `displayKeyword.ts` */
export declare const DisplaySelect: ({ display, outer, onChange, mixed }: Props) => JSX.Element;
export {};
