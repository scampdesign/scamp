import { DEFAULT_BREAKPOINTS, } from '@shared/types';
import { LIGHT_THEME, deriveThemeTokens, themeDefsFromParsed, } from '@lib/parseTheme';
export const createDesignSystemSlice = (set) => ({
    activeBreakpointId: 'desktop',
    activeStateName: null,
    breakpoints: [...DEFAULT_BREAKPOINTS],
    themeTokens: [],
    themeBaseTokens: [],
    themeOverrides: [],
    themes: [LIGHT_THEME],
    activeThemeId: 'light',
    themeCssRaw: '',
    designProse: { sections: {} },
    setActiveBreakpoint: (id) => set({ activeBreakpointId: id }),
    setActiveState: (activeStateName) => set({ activeStateName }),
    setBreakpoints: (breakpoints) => set({ breakpoints }),
    // Raw theme.css text, kept for the read-only Code panel. Set alongside
    // setThemeData at both parse sites (project open + chokidar change).
    setThemeCssRaw: (raw) => set({ themeCssRaw: raw }),
    // Authored DESIGN.md prose (name / description / section bodies). The
    // Design System forms edit this; useDesignMdSync writes it to DESIGN.md.
    setDesignProse: (designProse) => set({ designProse }),
    // Simple setter: replaces the whole design system with a single Light
    // theme backed by `tokens`. Kept for callers that only carry a flat
    // list; the multi-theme path uses `setThemeData`.
    setThemeTokens: (tokens) => set({
        themeTokens: tokens,
        themeBaseTokens: tokens,
        themeOverrides: [],
        themes: [LIGHT_THEME],
        activeThemeId: 'light',
    }),
    // Load a parsed theme.css: store the base (:root) tokens + per-theme
    // override blocks, rebuild the theme list, and re-derive the flat
    // `themeTokens` for the active theme (preserved if it still exists,
    // else Light). see docs/archive/2026-07-23-design-system-plan.md
    setThemeData: (parsed) => set((state) => {
        const themes = themeDefsFromParsed(parsed);
        const activeThemeId = themes.some((t) => t.id === state.activeThemeId)
            ? state.activeThemeId
            : 'light';
        const active = themes.find((t) => t.id === activeThemeId) ?? LIGHT_THEME;
        const overrides = (parsed.themes ?? []).find((b) => b.cssClass === active.cssClass)
            ?.tokens ?? [];
        return {
            themeBaseTokens: parsed.tokens,
            themeOverrides: parsed.themes ?? [],
            themes,
            activeThemeId,
            themeTokens: deriveThemeTokens(parsed.tokens, overrides),
        };
    }),
    // Switch the previewed/edited theme: re-derive `themeTokens` from the
    // base overlaid with that theme's semantic overrides. Primitives and
    // typography (which never appear in override blocks) are unchanged.
    setActiveTheme: (id) => set((state) => {
        const active = state.themes.find((t) => t.id === id) ?? LIGHT_THEME;
        const overrides = state.themeOverrides.find((b) => b.cssClass === active.cssClass)
            ?.tokens ?? [];
        return {
            activeThemeId: active.id,
            themeTokens: deriveThemeTokens(state.themeBaseTokens, overrides),
        };
    }),
});
