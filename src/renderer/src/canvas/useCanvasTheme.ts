import { useMemo } from 'react';
import { useCanvasStore } from '@store/canvasSlice';
import { DEFAULT_BODY_FONT_FAMILY } from '@shared/agentMd';

/**
 * The project's theme as a canvas frame needs it: every token as a CSS
 * custom property, and the body font. Shared by the live frame and the
 * read-only variant frames.
 */
export const useCanvasTheme = (): { themeCssVars: Record<string, string>; themeFontFamily: string } => {
  const themeTokens = useCanvasStore((s) => s.themeTokens);
  // Mirrors the preview's `body { font-family: var(--font-sans) }` from
  // theme.css; projects without the token predate it.
  const themeFontFamily =
    themeTokens.find((t) => t.name === '--font-sans')?.value ??
    DEFAULT_BODY_FONT_FAMILY;
  // Tokens live on the frame as real custom properties so `var(--…)` in
  // typed styles and raw customProperties both resolve, as in the
  // preview where theme.css is in the page's `<head>`.
  const themeCssVars = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const token of themeTokens) {
      if (!token.name.startsWith('--')) continue;
      vars[token.name] = token.value;
    }
    return vars;
  }, [themeTokens]);
  return { themeCssVars, themeFontFamily };
};
