import type { AvailableFont } from '@store/fontsSlice';
import type { TextStyle, TextStyleProp } from '@lib/typographyModel';
import type { ThemeToken } from '@shared/types';
type Props = {
    style: TextStyle;
    /** Base tokens — resolve the preview + feed the field pickers. */
    tokens: ReadonlyArray<ThemeToken>;
    allFonts: ReadonlyArray<AvailableFont>;
    onProp: (prop: TextStyleProp, value: string) => void;
    onRename: (newName: string) => void;
    onDelete: () => void;
};
/**
 * One text style in the theme panel: a live preview of the style (the name
 * rendered in its own font / size / weight / …) that opens a popover editor
 * with the same typography controls as the WYSIWYG panel — the design-system
 * equivalent of the colour-swatch → picker pattern.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
export declare const TextStyleRow: ({ style, tokens, allFonts, onProp, onRename, onDelete, }: Props) => JSX.Element;
export {};
