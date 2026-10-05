import { type ScampElement } from '@lib/element';
import type { ThemeToken } from '@shared/types';
import type { NewRectInput, NewTextInput, NewImageInput, NewSvgInput, NewInputInput, NewComponentInstanceInput } from '../canvasSlice';
export declare const makeRootElement: () => ScampElement;
/**
 * Default fill color for any rectangle created via the canvas tool. We
 * deliberately override `DEFAULT_RECT_STYLES.backgroundColor` (transparent)
 * here because a transparent rect on the white page frame is invisible —
 * the user just sees their click do nothing. Light grey is visible and
 * still neutral enough that the user can recolor it from the panel.
 */
export declare const NEW_RECT_BACKGROUND = "#e5e5e5";
export declare const makeRectangle: (input: NewRectInput, id: string) => ScampElement;
export declare const TEXT_DEFAULT_WIDTH = 120;
export declare const TEXT_DEFAULT_HEIGHT = 24;
export declare const makeText: (input: NewTextInput, id: string, fontFamily: string) => ScampElement;
/**
 * Pick the default `font-family` for a freshly-created text element.
 * Prefers the project's `--font-sans` token (so new text inherits the
 * project's chosen default font), falling back to the literal system
 * font stack when the token isn't declared. Setting an explicit value
 * — rather than relying on body-level inheritance — makes the
 * Typography section reflect "Sans" as the current font, gives the
 * user a clear surface to override per-element, and keeps the
 * generated CSS self-documenting.
 */
export declare const defaultTextFontFamily: (themeTokens: ReadonlyArray<ThemeToken>) => string;
export declare const makeImage: (input: NewImageInput, id: string) => ScampElement;
/**
 * Inline `<svg>` element from a sanitized/normalized source. Image-family
 * type with the `svg` tag override; `svgSource` is the (already-prepared)
 * inner markup. see docs/plans/svg-improvements-plan.md
 */
export declare const makeSvg: (input: NewSvgInput, id: string) => ScampElement;
/**
 * Default visual treatment for an input drawn on the canvas — a
 * subtle outlined box so the user can see what they drew. Users are
 * free to re-style from the panel.
 */
export declare const NEW_INPUT_BACKGROUND = "#ffffff";
export declare const NEW_INPUT_BORDER_COLOR = "#cbd5e1";
export declare const makeInput: (input: NewInputInput, id: string) => ScampElement;
export declare const makeComponentInstance: (input: NewComponentInstanceInput, id: string) => ScampElement;
export declare const tagForListChildContext: (parent: ScampElement | undefined, type?: "rectangle" | "text") => string | undefined;
