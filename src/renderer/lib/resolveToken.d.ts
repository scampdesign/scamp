import type { ThemeToken } from '@shared/types';
/**
 * Follow a `var(--name)` reference through the theme tokens to a concrete
 * value. Semantic tokens (`--color-brand: var(--color-brand-500)`) point at
 * primitives, which point at hex — so resolution must chase the whole chain,
 * not stop at the first hop (the single-level gap this closes).
 *
 * Returns `null` when a reference is missing or a cycle is detected. A value
 * that isn't exactly `var(--x)` — a literal, or `var(--x, fallback)` /
 * `calc(var(--x) * 2)`, which we don't resolve yet — passes straight through
 * unchanged. see docs/archive/2026-07-23-design-system-plan.md
 */
export declare const resolveTokenChain: (value: string, tokens: ReadonlyArray<ThemeToken>) => string | null;
