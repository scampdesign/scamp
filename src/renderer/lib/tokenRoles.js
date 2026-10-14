export const TOKEN_ROLES = [
    'spacing',
    'border',
    'radius',
    'shadow',
];
const ROLE_PREFIX = {
    spacing: '--space-',
    border: '--border-',
    radius: '--radius-',
    shadow: '--shadow-',
};
/** Human heading for a role's panel section. */
export const ROLE_LABEL = {
    spacing: 'Spacing',
    border: 'Border widths',
    radius: 'Radius',
    shadow: 'Shadows',
};
/** The `--…-` prefix that identifies a role's tokens. */
export const roleTokenPrefix = (role) => ROLE_PREFIX[role];
/** True when `name` belongs to the given role (by prefix). */
export const isRoleToken = (role, name) => name.startsWith(ROLE_PREFIX[role]);
/** True when `name` belongs to ANY of the four length/shadow roles. */
export const isDesignRoleToken = (name) => TOKEN_ROLES.some((r) => isRoleToken(r, name));
/** The step/label part of a role token, e.g. `--space-4` → `4`. */
export const roleTokenLabel = (role, name) => name.slice(ROLE_PREFIX[role].length);
/** Build the token name for a role + step label, e.g. `radius`,`md` → `--radius-md`. */
export const roleTokenName = (role, label) => `${ROLE_PREFIX[role]}${label}`;
/** All tokens of a role, in source order, with their step label extracted. */
export const tokensForRole = (role, tokens) => tokens
    .filter((t) => isRoleToken(role, t.name))
    .map((t) => ({
    name: t.name,
    label: roleTokenLabel(role, t.name),
    value: t.value,
}));
// --- PRD default token sets (add-on-demand) ---
export const DEFAULT_SPACING_TOKENS = [
    { name: '--space-1', value: '4px' },
    { name: '--space-2', value: '8px' },
    { name: '--space-3', value: '12px' },
    { name: '--space-4', value: '16px' },
    { name: '--space-5', value: '20px' },
    { name: '--space-6', value: '24px' },
    { name: '--space-8', value: '32px' },
    { name: '--space-10', value: '40px' },
    { name: '--space-12', value: '48px' },
    { name: '--space-16', value: '64px' },
];
export const DEFAULT_BORDER_TOKENS = [
    { name: '--border-thin', value: '1px' },
    { name: '--border-medium', value: '2px' },
    { name: '--border-thick', value: '4px' },
];
export const DEFAULT_RADIUS_TOKENS = [
    { name: '--radius-none', value: '0' },
    { name: '--radius-sm', value: '4px' },
    { name: '--radius-md', value: '8px' },
    { name: '--radius-lg', value: '12px' },
    { name: '--radius-xl', value: '16px' },
    { name: '--radius-2xl', value: '24px' },
    { name: '--radius-full', value: '9999px' },
];
export const DEFAULT_SHADOW_TOKENS = [
    { name: '--shadow-sm', value: '0 1px 2px rgba(0, 0, 0, 0.05)' },
    {
        name: '--shadow-md',
        value: '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.06)',
    },
    {
        name: '--shadow-lg',
        value: '0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
    },
    {
        name: '--shadow-xl',
        value: '0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)',
    },
];
/**
 * Stable-reorder tokens so those whose name starts with `prefix` come
 * first — used to float the property-relevant tokens (`--border-*` for a
 * border-width picker, `--radius-*` for a radius picker, …) to the top of
 * the WYSIWYG token list without hiding the rest. see docs/archive/2026-07-23-design-system-plan.md
 */
export const prioritizeByPrefix = (tokens, prefix) => {
    const match = [];
    const rest = [];
    for (const t of tokens) {
        if (t.name.startsWith(prefix))
            match.push(t);
        else
            rest.push(t);
    }
    return [...match, ...rest];
};
const ROLE_DEFAULTS = {
    spacing: DEFAULT_SPACING_TOKENS,
    border: DEFAULT_BORDER_TOKENS,
    radius: DEFAULT_RADIUS_TOKENS,
    shadow: DEFAULT_SHADOW_TOKENS,
};
/** The default token set for a role (the "+ Add default …" action). */
export const defaultTokensForRole = (role) => ROLE_DEFAULTS[role];
