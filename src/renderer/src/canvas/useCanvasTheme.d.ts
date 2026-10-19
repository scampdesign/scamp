/**
 * The project's theme as a canvas frame needs it: every token as a CSS
 * custom property, and the body font. Shared by the live frame and the
 * read-only variant frames.
 */
export declare const useCanvasTheme: () => {
    themeCssVars: Record<string, string>;
    themeFontFamily: string;
};
