import type { ThemeToken } from '@shared/types';
/**
 * A WYSIWYG control that offers a theme-token picker. Each field maps to
 * the tokens that make sense for it — the single source of truth that
 * replaces the `themeTokens.filter(classifyToken(...) === '…')` snippets
 * that were scattered across the property sections.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
export type TokenField = 'fontSize' | 'lineHeight' | 'fontFamily' | 'letterSpacing' | 'spacing' | 'borderWidth' | 'radius' | 'shadow';
/**
 * Tokens eligible for a WYSIWYG field, filtered by category and ordered
 * so the property-relevant prefix floats to the top (without hiding the
 * rest — a user can still pick any length token in a length field).
 */
export declare const tokensForField: (field: TokenField, tokens: ReadonlyArray<ThemeToken>) => ThemeToken[];
