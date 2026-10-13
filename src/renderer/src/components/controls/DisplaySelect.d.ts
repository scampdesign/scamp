import type { DisplayMode, DisplayOuter } from '@lib/element';
type Props = {
    display: DisplayMode;
    outer: DisplayOuter | undefined;
    onChange: (outer: DisplayOuter | undefined) => void;
};
/** The outer half of CSS `display`. see `displayKeyword.ts` */
export declare const DisplaySelect: ({ display, outer, onChange }: Props) => JSX.Element;
export {};
