import type { CapturedTokens, CapturePayload } from '@shared/importCapture';
import type { ParsedTheme } from './parseTheme';
/** The project's theme with the app's tokens in it, and what didn't fit. */
export type AppThemeMerge = {
    theme: ParsedTheme;
    /** Tokens added to the project. */
    added: string[];
    /** Tokens the project already has with another value; their uses stay literal. */
    conflicts: string[];
};
/** A Scamp theme class for an app's theme name: `dark`, or `theme-<slug>`. */
export declare const themeClassFor: (name: string) => string;
/**
 * Merge the app's tokens into the project's theme. The theme the page was
 * showing becomes the base (`:root`); each other theme becomes a block,
 * holding only what differs from the base. A token the project already
 * declares with the same value is simply reused.
 */
export declare const themeFromTokens: (captured: CapturedTokens, existing: ParsedTheme) => AppThemeMerge;
/**
 * The capture with each tokenised property written as `var(--name)`, so
 * the reducer carries the reference into the element. Only properties the
 * capture kept (that differ from their initial value), only tokens the
 * page gave a value for, and none in `skip` — a token the project
 * already holds with another value keeps its literal.
 */
export declare const tokenizeCapture: (payload: CapturePayload, skip?: ReadonlySet<string>) => CapturePayload;
