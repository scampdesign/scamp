import type { ThemeToken } from '@shared/types';

const VAR_RE = /^var\(\s*(--[\w-]+)\s*\)$/;

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
export const resolveTokenChain = (
  value: string,
  tokens: ReadonlyArray<ThemeToken>
): string | null => {
  let current = value;
  const seen = new Set<string>();
  // Depth cap is a pathological-input backstop, far above any real chain.
  for (let depth = 0; depth < 32; depth += 1) {
    const m = current.match(VAR_RE);
    if (!m) return current; // concrete value reached
    const name = m[1];
    if (name === undefined) return current;
    if (seen.has(name)) return null; // cycle
    seen.add(name);
    const found = tokens.find((t) => t.name === name);
    if (!found) return null; // dangling reference
    current = found.value;
  }
  return null;
};
