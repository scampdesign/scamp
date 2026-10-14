import type { ThemeToken } from '@shared/types';

import { classifyToken } from './tokenClassify';
import { isTextStyleToken } from './typographyModel';
import { isDesignRoleToken, isRoleToken, prioritizeByPrefix } from './tokenRoles';

/**
 * A WYSIWYG control that offers a theme-token picker. Each field maps to
 * the tokens that make sense for it — the single source of truth that
 * replaces the `themeTokens.filter(classifyToken(...) === '…')` snippets
 * that were scattered across the property sections.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
export type TokenField =
  | 'fontSize'
  | 'lineHeight'
  | 'fontFamily'
  | 'letterSpacing'
  | 'spacing'
  | 'borderWidth'
  | 'radius'
  | 'shadow';

// Type fields (font size / line height / family) exclude BOTH text-style
// group internals AND the length/shadow roles — those classify as lengths
// by value but are never type.
const typeEligible = (name: string): boolean =>
  !isTextStyleToken(name) && !isDesignRoleToken(name);

// Length fields (spacing / border / radius / letter-spacing) keep the
// design-role tokens — those are the point — but drop text-style internals
// (`--text-h1-size`) which are only applied via the Text style dropdown.
const lengthEligible = (name: string): boolean => !isTextStyleToken(name);

const isLength = (t: ThemeToken): boolean => classifyToken(t.value) === 'fontSize';

/**
 * Tokens eligible for a WYSIWYG field, filtered by category and ordered
 * so the property-relevant prefix floats to the top (without hiding the
 * rest — a user can still pick any length token in a length field).
 */
export const tokensForField = (
  field: TokenField,
  tokens: ReadonlyArray<ThemeToken>
): ThemeToken[] => {
  switch (field) {
    case 'fontFamily':
      return tokens.filter(
        (t) => classifyToken(t.value) === 'fontFamily' && typeEligible(t.name)
      );
    case 'lineHeight':
      return tokens.filter(
        (t) => classifyToken(t.value) === 'lineHeight' && typeEligible(t.name)
      );
    case 'fontSize':
      return prioritizeByPrefix(
        tokens.filter((t) => isLength(t) && typeEligible(t.name)),
        '--text-'
      );
    case 'spacing':
      return prioritizeByPrefix(
        tokens.filter((t) => isLength(t) && lengthEligible(t.name)),
        '--space-'
      );
    case 'letterSpacing':
      return prioritizeByPrefix(
        tokens.filter((t) => isLength(t) && lengthEligible(t.name)),
        '--space-'
      );
    case 'borderWidth':
      return prioritizeByPrefix(
        tokens.filter((t) => isLength(t) && lengthEligible(t.name)),
        '--border-'
      );
    case 'radius':
      return prioritizeByPrefix(
        tokens.filter((t) => isLength(t) && lengthEligible(t.name)),
        '--radius-'
      );
    case 'shadow':
      return tokens.filter((t) => isRoleToken('shadow', t.name));
  }
};
