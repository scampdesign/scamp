/**
 * CSS assembly for the HTML export.
 *
 * Every instance of a component gets its own copy of that component's CSS,
 * prefixed with the instance id, appended to the page's stylesheet. That is
 * what makes the export match the canvas: an instance's rules can't be
 * shared with, or overwritten by, another instance's, and the page's own
 * per-instance rule keeps applying on top exactly as it does in the app.
 *
 * The rewriting here is textual, so it's written to survive CSS the
 * generator didn't write — a hand-edited or agent-edited component module
 * can contain descendant selectors, attribute selectors and strings, all of
 * which a "prefix the first token" regex would corrupt.
 *
 * see docs/archive/2026-08-27-html-export-plan.md
 */
const IDENT_START = /[A-Za-z_-]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
/** Consume a quoted string starting at `i`, returning it verbatim. */
const readString = (css, i) => {
    const quote = css[i];
    let out = quote ?? '';
    let j = i + 1;
    while (j < css.length) {
        const ch = css[j] ?? '';
        out += ch;
        if (ch === '\\') {
            out += css[j + 1] ?? '';
            j += 2;
            continue;
        }
        j += 1;
        if (ch === quote)
            break;
    }
    return out;
};
/** Consume a CSS identifier starting at `i` (backslash escapes included). */
const readIdent = (css, i) => {
    let out = '';
    let j = i;
    while (j < css.length) {
        const ch = css[j] ?? '';
        if (ch === '\\') {
            out += ch + (css[j + 1] ?? '');
            j += 2;
            continue;
        }
        if (!IDENT_CHAR.test(ch))
            break;
        out += ch;
        j += 1;
    }
    return out;
};
/**
 * Prefix every class name in one selector list.
 *
 * Strings and attribute-selector bodies are copied through untouched: a
 * `[data-x=".foo"]` or `content: "."` must not be treated as a class.
 */
export const prefixSelectorClasses = (selector, prefix) => {
    let out = '';
    let i = 0;
    while (i < selector.length) {
        const ch = selector[i] ?? '';
        if (ch === '"' || ch === "'") {
            const str = readString(selector, i);
            out += str;
            i += str.length;
            continue;
        }
        if (ch === '[') {
            // Attribute selector — copy verbatim to the closing bracket.
            let j = i;
            let body = '';
            while (j < selector.length) {
                const c = selector[j] ?? '';
                if (c === '"' || c === "'") {
                    const str = readString(selector, j);
                    body += str;
                    j += str.length;
                    continue;
                }
                body += c;
                j += 1;
                if (c === ']')
                    break;
            }
            out += body;
            i = j;
            continue;
        }
        if (ch === '.' && IDENT_START.test(selector[i + 1] ?? '')) {
            const ident = readIdent(selector, i + 1);
            out += `.${prefix}${ident}`;
            i += 1 + ident.length;
            continue;
        }
        out += ch;
        i += 1;
    }
    return out;
};
/** Names declared by `@keyframes` blocks in this stylesheet. */
export const collectKeyframeNames = (css) => {
    const names = new Set();
    const re = /@(?:-[a-z]+-)?keyframes\s+([A-Za-z_-][A-Za-z0-9_-]*)/g;
    let match = re.exec(css);
    while (match !== null) {
        const name = match[1];
        if (name !== undefined)
            names.add(name);
        match = re.exec(css);
    }
    return names;
};
/**
 * Prefix `animation` / `animation-name` references to keyframes we renamed.
 * Only names actually declared in this stylesheet are touched, so a
 * reference to a globally-defined animation is left alone.
 */
const prefixAnimationNames = (block, prefix, keyframeNames) => {
    if (keyframeNames.size === 0)
        return block;
    return block.replace(/(animation(?:-name)?\s*:)([^;}]*)/gi, (_full, prop, value) => {
        const rewritten = value.replace(/[A-Za-z_-][A-Za-z0-9_-]*/g, (token) => (keyframeNames.has(token) ? `${prefix}${token}` : token));
        return `${prop}${rewritten}`;
    });
};
/**
 * Namespace a whole stylesheet under `prefix`.
 *
 * Rewrites class selectors at every nesting level (so rules inside
 * `@media` are covered), `@keyframes` names, and the `animation`
 * declarations that reference them. At-rule preludes other than
 * `@keyframes` — `@media`, `@supports` — pass through untouched.
 */
export const prefixCss = (css, prefix) => prefix.length === 0 ? css : prefixCssInner(css, prefix, collectKeyframeNames(css));
/**
 * `keyframeNames` is threaded through the recursion rather than recomputed:
 * a rule nested in `@media` can reference a `@keyframes` declared at the top
 * level, and scanning only the nested block would miss it and leave that
 * reference pointing at a name no longer in the file.
 */
const prefixCssInner = (css, prefix, keyframeNames) => {
    let out = '';
    let prelude = '';
    let i = 0;
    const flushPrelude = () => {
        const trimmed = prelude.trimStart();
        if (trimmed.startsWith('@')) {
            out += prelude.replace(/(@(?:-[a-z]+-)?keyframes\s+)([A-Za-z_-][A-Za-z0-9_-]*)/g, (_f, head, name) => `${head}${prefix}${name}`);
        }
        else {
            out += prefixSelectorClasses(prelude, prefix);
        }
        prelude = '';
    };
    while (i < css.length) {
        const ch = css[i] ?? '';
        const next = css[i + 1] ?? '';
        if (ch === '/' && next === '*') {
            const end = css.indexOf('*/', i + 2);
            const stop = end === -1 ? css.length : end + 2;
            prelude += css.slice(i, stop);
            i = stop;
            continue;
        }
        if (ch === '"' || ch === "'") {
            const str = readString(css, i);
            prelude += str;
            i += str.length;
            continue;
        }
        if (ch === '{') {
            flushPrelude();
            out += '{';
            i += 1;
            // Copy the block body, rewriting animation references. Nested
            // blocks (@media, CSS nesting) recurse so their inner selectors
            // get prefixed too.
            let depth = 1;
            let body = '';
            while (i < css.length && depth > 0) {
                const c = css[i] ?? '';
                const n = css[i + 1] ?? '';
                if (c === '/' && n === '*') {
                    const end = css.indexOf('*/', i + 2);
                    const stop = end === -1 ? css.length : end + 2;
                    body += css.slice(i, stop);
                    i = stop;
                    continue;
                }
                if (c === '"' || c === "'") {
                    const str = readString(css, i);
                    body += str;
                    i += str.length;
                    continue;
                }
                if (c === '{')
                    depth += 1;
                if (c === '}') {
                    depth -= 1;
                    if (depth === 0) {
                        i += 1;
                        break;
                    }
                }
                body += c;
                i += 1;
            }
            // A body containing a nested block is itself a sequence of rules —
            // run it back through so those preludes get the same treatment.
            out += body.includes('{')
                ? prefixCssInner(body, prefix, keyframeNames)
                : prefixAnimationNames(body, prefix, keyframeNames);
            out += '}';
            continue;
        }
        prelude += ch;
        i += 1;
    }
    out += prelude;
    return out;
};
/**
 * Rewrite `url(...)` targets. Used to turn project-absolute asset paths
 * (`/assets/hero.webp`) into paths relative to the page that loads the
 * stylesheet. Quoted and bare forms both round-trip.
 */
export const rewriteCssUrls = (css, rewrite) => css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (_full, quote, url) => `url(${quote}${rewrite(url)}${quote})`);
export const assemblePageCss = (pageCss, instances) => {
    const chunks = [pageCss.trimEnd()];
    for (const instance of instances) {
        const prefixed = prefixCss(instance.css, instance.prefix).trim();
        if (prefixed.length === 0)
            continue;
        chunks.push(prefixed);
    }
    return `${chunks.filter((c) => c.length > 0).join('\n\n')}\n`;
};
