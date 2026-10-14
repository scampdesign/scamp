import type { ThemeToken } from '@shared/types';
/**
 * Design-system token roles that are all CSS LENGTHS (or shadow strings)
 * and therefore can't be told apart by value — they're routed by NAME
 * prefix instead. Colours (`--color-*`) and text styles (`--text-*-*`)
 * have their own models; these four cover the rest of the system.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
export type TokenRole = 'spacing' | 'border' | 'radius' | 'shadow';
export declare const TOKEN_ROLES: ReadonlyArray<TokenRole>;
/** Human heading for a role's panel section. */
export declare const ROLE_LABEL: Record<TokenRole, string>;
/** The `--…-` prefix that identifies a role's tokens. */
export declare const roleTokenPrefix: (role: TokenRole) => string;
/** True when `name` belongs to the given role (by prefix). */
export declare const isRoleToken: (role: TokenRole, name: string) => boolean;
/** True when `name` belongs to ANY of the four length/shadow roles. */
export declare const isDesignRoleToken: (name: string) => boolean;
/** The step/label part of a role token, e.g. `--space-4` → `4`. */
export declare const roleTokenLabel: (role: TokenRole, name: string) => string;
/** Build the token name for a role + step label, e.g. `radius`,`md` → `--radius-md`. */
export declare const roleTokenName: (role: TokenRole, label: string) => string;
export type RoleToken = {
    name: string;
    label: string;
    value: string;
};
/** All tokens of a role, in source order, with their step label extracted. */
export declare const tokensForRole: (role: TokenRole, tokens: ReadonlyArray<ThemeToken>) => RoleToken[];
export declare const DEFAULT_SPACING_TOKENS: ReadonlyArray<ThemeToken>;
export declare const DEFAULT_BORDER_TOKENS: ReadonlyArray<ThemeToken>;
export declare const DEFAULT_RADIUS_TOKENS: ReadonlyArray<ThemeToken>;
export declare const DEFAULT_SHADOW_TOKENS: ReadonlyArray<ThemeToken>;
/**
 * Stable-reorder tokens so those whose name starts with `prefix` come
 * first — used to float the property-relevant tokens (`--border-*` for a
 * border-width picker, `--radius-*` for a radius picker, …) to the top of
 * the WYSIWYG token list without hiding the rest. see docs/archive/2026-07-23-design-system-plan.md
 */
export declare const prioritizeByPrefix: (tokens: ReadonlyArray<ThemeToken>, prefix: string) => ThemeToken[];
/** The default token set for a role (the "+ Add default …" action). */
export declare const defaultTokensForRole: (role: TokenRole) => ReadonlyArray<ThemeToken>;
