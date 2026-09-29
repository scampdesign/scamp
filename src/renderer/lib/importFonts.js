/**
 * Families a browser resolves itself. Asking Google for "sans-serif"
 * would be a 400, and telling a user to install it would be absurd.
 */
const GENERIC_FAMILIES = new Set([
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
    'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
    'math', 'emoji', 'fangsong', 'inherit', 'initial', 'unset', 'revert',
]);
/**
 * Names that are a system stack rather than a typeface. A page asking
 * for `-apple-system` wants "whatever this OS uses", which every OS
 * already answers.
 */
const SYSTEM_STACK_NAMES = new Set([
    '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica neue',
    'helvetica', 'arial', 'noto sans', 'liberation sans', 'apple color emoji',
    'segoe ui emoji', 'segoe ui symbol', 'noto color emoji', 'sfmono-regular',
    'menlo', 'monaco', 'consolas', 'liberation mono', 'courier new', 'courier',
    'times new roman', 'times', 'georgia', 'cambria',
]);
/** Strip quotes and collapse whitespace: `"Inter Tight"` → `Inter Tight`. */
const cleanFamily = (raw) => raw.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
/**
 * The family a stack actually wants.
 *
 * `getComputedStyle` returns the whole stack — `Fraunces, "Fraunces
 * Fallback", Georgia, serif` — and only the head is a decision. The
 * rest is the author's fallback chain, which the browser will apply on
 * its own if the head is unavailable.
 *
 * A `… Fallback` entry is what Next.js and similar emit for a locally
 * metric-matched face; it is never something to install.
 */
export const primaryFamily = (stack) => {
    for (const part of stack.split(',')) {
        const family = cleanFamily(part);
        if (family.length === 0)
            continue;
        const lower = family.toLowerCase();
        if (GENERIC_FAMILIES.has(lower))
            return null;
        if (lower.endsWith(' fallback'))
            continue;
        return family;
    }
    return null;
};
/** Every family an element tree asks for, by how many elements want it. */
export const fontsNeededBy = (elements) => {
    const counts = new Map();
    for (const el of Object.values(elements)) {
        const stack = el.fontFamily;
        if (typeof stack !== 'string' || stack.length === 0)
            continue;
        if (stack.startsWith('var('))
            continue;
        const family = primaryFamily(stack);
        if (family === null)
            continue;
        counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([family, uses]) => ({ family, uses }))
        .sort((a, b) => b.uses - a.uses);
};
/** Is this name a typeface to find, or something the OS already answers? */
export const needsResolving = (family) => {
    const lower = family.toLowerCase();
    return !GENERIC_FAMILIES.has(lower) && !SYSTEM_STACK_NAMES.has(lower);
};
/**
 * Classify each family against what is installed and what Google
 * serves.
 *
 * `installed` is matched case-insensitively: the Local Font Access API
 * reports `Inter Tight` where CSS may say `inter tight`, and treating
 * those as different fonts would embed one the user already has.
 */
export const resolveFonts = (needs, installed, googleUrls) => {
    const have = new Set(installed.map((f) => f.toLowerCase()));
    const out = [];
    for (const need of needs) {
        if (!needsResolving(need.family))
            continue;
        if (have.has(need.family.toLowerCase())) {
            out.push({ ...need, status: 'system' });
            continue;
        }
        const url = googleUrls[need.family];
        if (typeof url === 'string' && url.length > 0) {
            out.push({ ...need, status: 'google', url });
            continue;
        }
        out.push({ ...need, status: 'missing' });
    }
    return out;
};
/**
 * Axis tags in the order Google's `css2` endpoint demands: registered
 * (lowercase) axes alphabetically, then custom (uppercase) ones. Any
 * other order is a 400, and a 400 means no font at all.
 */
const axisOrder = (a, b) => {
    const aCustom = a.tag[0] === a.tag[0]?.toUpperCase();
    const bCustom = b.tag[0] === b.tag[0]?.toUpperCase();
    if (aCustom !== bCustom)
        return aCustom ? 1 : -1;
    return a.tag.localeCompare(b.tag);
};
/**
 * One Google Fonts URL for every embeddable family.
 *
 * Google's `css2` endpoint takes repeated `family=` parameters, so the
 * whole import is a single request and a single `@import` line rather
 * than one per face. A weight range is requested because a page that
 * used a bold heading and a light caption needs both, and asking for
 * the default would silently flatten them.
 *
 * `axesByFamily` is the same kind of argument as `installed` above: a
 * fact about what Google serves, which this function cannot know and
 * must not go and find out. Supply it and every axis is requested across
 * its full range; omit it and only weights are, which is the old
 * behaviour and still correct for a family whose only axis is weight.
 *
 * **Naming the axes matters more than it looks.** Google INSTANCES the
 * font to the axes you ask for, so a request for `wght` alone returns a
 * file with every other axis frozen at its default. Fraunces defaults to
 * `opsz` 14, and a 60px headline set in 14px-optical glyphs is about 7%
 * wider — enough to wrap a line that fits on the real site, which then
 * pushes every section below it down the page. 158 of Google's ~1950
 * families have an axis beyond weight, so this is not a curiosity.
 * see docs/notes/import-variable-fonts.md
 */
export const googleFontsUrlFor = (families, axesByFamily = {}) => {
    const wanted = families.filter((f) => f.trim().length > 0);
    if (wanted.length === 0)
        return null;
    const params = wanted
        .map((f) => {
        const name = encodeURIComponent(f.trim()).replace(/%20/g, '+');
        const axes = [...(axesByFamily[f.trim()] ?? [])].sort(axisOrder);
        if (axes.length === 0)
            return `family=${name}:wght@300;400;500;600;700;800`;
        const tags = axes.map((a) => a.tag).join(',');
        const ranges = axes.map((a) => `${a.min}..${a.max}`).join(',');
        return `family=${name}:${tags}@${ranges}`;
    })
        .join('&');
    return `https://fonts.googleapis.com/css2?${params}&display=swap`;
};
