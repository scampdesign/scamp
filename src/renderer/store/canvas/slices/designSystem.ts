// store/canvas/slices/designSystem.ts — domain slice split from canvasSlice.ts (5.1).
import type { StateCreator } from 'zustand';
import {
  cloneElementSubtree,
  generateElementId,
  groupSiblings,
  reorderElementPure,
  ROOT_ELEMENT_ID,
  ungroupSiblings,
  wrapElement,
  type BreakpointOverride,
  type ElementAnimation,
  type ElementStateName,
  type KeyframesBlock,
  type PropertyGroup,
  type ScampElement,
} from '@lib/element';
import { canonicalizeGroupList } from '@lib/propertyGroups';
import { useHistoryStore, type HistoryCommitInput } from '../../historySlice';
import { PRESETS_BY_NAME, isPresetName } from '@lib/animationPresets';
import { classNameFor } from '@lib/generateCode';
import { resolveElementAtState } from '@lib/stateCascade';
import { DEFAULT_RECT_STYLES, DEFAULT_ROOT_STYLES } from '@lib/defaults';
import { DEFAULT_BODY_FONT_FAMILY } from '@shared/agentMd';
import {
  DEFAULT_BREAKPOINTS,
  type Breakpoint,
  type ProjectFormat,
  type ThemeDef,
  type ThemeToken,
} from '@shared/types';
import {
  LIGHT_THEME,
  deriveThemeTokens,
  themeDefsFromParsed,
  type ParsedTheme,
  type ThemeBlock,
} from '@lib/parseTheme';
import type { DesignProse } from '@lib/designMd';
import {
  defaultTextFontFamily,
  makeComponentInstance,
  makeImage,
  makeInput,
  makeRectangle,
  makeRootElement,
  makeText,
  tagForListChildContext,
} from '../factories';
import {
  BASE_ONLY_PATCH_FIELDS,
  applyPatchWithAxisRouting,
} from '../patchRouting';
import { commitElementsToHistory, freshId } from '../history';
import {
  useCanvasStore,
  type CanvasState,
  type ActivePage,
  type ActiveComponent,
  type ComponentTree,
  type PageSource,
  type Tool,
  type NewRectInput,
  type NewTextInput,
  type NewImageInput,
  type NewInputInput,
  type NewComponentInstanceInput,
} from '../../canvasSlice';

export const createDesignSystemSlice: StateCreator<
  CanvasState,
  [],
  [],
  Pick<
  CanvasState,
  | 'activeBreakpointId'
  | 'activeStateName'
  | 'breakpoints'
  | 'themeTokens'
  | 'themeBaseTokens'
  | 'themeOverrides'
  | 'themes'
  | 'activeThemeId'
  | 'themeCssRaw'
  | 'designProse'
  | 'setActiveBreakpoint'
  | 'setActiveState'
  | 'setBreakpoints'
  | 'setThemeTokens'
  | 'setThemeData'
  | 'setActiveTheme'
  | 'setThemeCssRaw'
  | 'setDesignProse'
>
> = (set) => ({
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
  setDesignProse: (designProse: DesignProse) => set({ designProse }),

  // Simple setter: replaces the whole design system with a single Light
  // theme backed by `tokens`. Kept for callers that only carry a flat
  // list; the multi-theme path uses `setThemeData`.
  setThemeTokens: (tokens) =>
    set({
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
  setThemeData: (parsed: ParsedTheme) =>
    set((state) => {
      const themes = themeDefsFromParsed(parsed);
      const activeThemeId = themes.some((t) => t.id === state.activeThemeId)
        ? state.activeThemeId
        : 'light';
      const active = themes.find((t) => t.id === activeThemeId) ?? LIGHT_THEME;
      const overrides =
        (parsed.themes ?? []).find((b) => b.cssClass === active.cssClass)
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
  setActiveTheme: (id: string) =>
    set((state) => {
      const active = state.themes.find((t) => t.id === id) ?? LIGHT_THEME;
      const overrides =
        state.themeOverrides.find((b) => b.cssClass === active.cssClass)
          ?.tokens ?? [];
      return {
        activeThemeId: active.id,
        themeTokens: deriveThemeTokens(state.themeBaseTokens, overrides),
      };
    }),

});
