import type { DisplayMode, DisplayOuter } from './element';
/** The keyword to write. Flex and grid take only `inline`. */
export declare const displayKeyword: (display: DisplayMode, outer: DisplayOuter | undefined) => string;
/**
 * A keyword the model can hold, or null to keep it verbatim. `displayOuter`
 * is always present — `undefined` for block — so a breakpoint override of
 * `block` clears an inline base instead of inheriting it.
 */
export declare const parseDisplayKeyword: (raw: string) => {
    display: DisplayMode;
    displayOuter: DisplayOuter | undefined;
} | null;
