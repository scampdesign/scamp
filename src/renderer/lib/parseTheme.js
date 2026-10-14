import postcss from 'postcss';
/** Class selector for a theme override block. `theme-<slug>` for customs. */
const THEME_CLASS_RE = /^\.(dark|theme-[\w-]+)$/;
/**
 * Derive a `ThemeDef` from a theme block's CSS class. `dark` → the
 * built-in Dark theme; `theme-<slug>` → a custom theme whose id is the
 * slug and whose label is the slug title-cased.
 */
export const themeDefFromClass = (cssClass) => {
    if (cssClass === 'dark')
        return { id: 'dark', label: 'Dark', cssClass };
    const slug = cssClass.startsWith('theme-')
        ? cssClass.slice('theme-'.length)
        : cssClass;
    const label = slug
        .split('-')
        .filter((w) => w.length > 0)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    return { id: slug, label: label || slug, cssClass };
};
/** The light theme is always present, backed by the `:root` block. */
export const LIGHT_THEME = { id: 'light', label: 'Light', cssClass: '' };
/**
 * The ordered theme list for a parsed file: Light (always) followed by
 * each override block in source order.
 */
export const themeDefsFromParsed = (parsed) => [
    LIGHT_THEME,
    ...(parsed.themes ?? []).map((b) => themeDefFromClass(b.cssClass)),
];
/**
 * Flatten to the token list for one theme: the base `:root` tokens with
 * the theme's semantic overrides applied by name. Primitives and
 * typography (which never appear in override blocks) pass through
 * unchanged; an override naming a token absent from the base is appended.
 */
export const deriveThemeTokens = (base, overrides) => {
    if (overrides.length === 0)
        return [...base];
    const overrideMap = new Map(overrides.map((t) => [t.name, t.value]));
    const baseNames = new Set(base.map((t) => t.name));
    const merged = base.map((t) => {
        const o = overrideMap.get(t.name);
        return o !== undefined ? { name: t.name, value: o } : t;
    });
    const extra = overrides.filter((o) => !baseNames.has(o.name));
    return [...merged, ...extra];
};
const IMPORT_URL_RE = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)\s]+))\s*\)/;
/**
 * Pull the URL out of an `@import` at-rule's params. Supports the
 * `url("…")`, `url('…')`, `url(…)`, and bare-string (`"…"` / `'…'`)
 * forms CSS lets users write.
 */
const extractImportUrl = (params) => {
    const trimmed = params.trim();
    if (trimmed.length === 0)
        return null;
    const m = trimmed.match(IMPORT_URL_RE);
    if (m) {
        return (m[1] ?? m[2] ?? m[3] ?? '').trim() || null;
    }
    // Bare-string form: `@import "foo.css";` / `@import 'foo.css';`.
    if ((trimmed.startsWith('"') && trimmed.slice(1).includes('"')) ||
        (trimmed.startsWith("'") && trimmed.slice(1).includes("'"))) {
        const quote = trimmed[0];
        const end = trimmed.indexOf(quote, 1);
        if (end > 1)
            return trimmed.slice(1, end);
    }
    return null;
};
/** Collect the `--*` declarations from a rule into an ordered token list. */
const tokensFromRule = (rule) => {
    const map = new Map();
    rule.walkDecls((decl) => {
        if (decl.prop.startsWith('--'))
            map.set(decl.prop, decl.value);
    });
    return [...map.entries()].map(([name, value]) => ({ name, value }));
};
/**
 * Parse a CSS file and extract all custom properties (`--*`) from
 * `:root` rule blocks, every `.dark` / `.theme-*` theme override block,
 * plus every top-level `@import` URL. Returns the `:root` tokens (last
 * declaration wins on duplicates, same as CSS cascade), the per-theme
 * override blocks in source order, and an ordered list of import URLs.
 *
 * Other rules and non-custom-property declarations are ignored.
 * Malformed CSS returns empty lists rather than throwing.
 */
export const parseThemeFile = (css) => {
    if (typeof css !== 'string' || css.trim().length === 0) {
        return { tokens: [], themes: [], fontImportUrls: [] };
    }
    let root;
    try {
        root = postcss.parse(css);
    }
    catch {
        return { tokens: [], themes: [], fontImportUrls: [] };
    }
    const tokenMap = new Map();
    const urls = [];
    const themes = [];
    root.walkAtRules('import', (atRule) => {
        const url = extractImportUrl(atRule.params);
        if (url && !urls.includes(url))
            urls.push(url);
    });
    root.walkRules((rule) => {
        const selector = rule.selector.trim();
        if (selector === ':root') {
            rule.walkDecls((decl) => {
                if (decl.prop.startsWith('--'))
                    tokenMap.set(decl.prop, decl.value);
            });
            return;
        }
        const m = selector.match(THEME_CLASS_RE);
        if (m && m[1] !== undefined) {
            const cssClass = m[1];
            const tokens = tokensFromRule(rule);
            if (tokens.length === 0)
                return;
            const existing = themes.find((t) => t.cssClass === cssClass);
            if (existing)
                existing.tokens.push(...tokens);
            else
                themes.push({ cssClass, tokens });
        }
    });
    return {
        tokens: [...tokenMap.entries()].map(([name, value]) => ({ name, value })),
        themes,
        fontImportUrls: urls,
    };
};
/**
 * Backward-compatible token extractor. Prefer `parseThemeFile` when
 * you also need the import URLs.
 */
export const parseThemeCss = (css) => {
    return parseThemeFile(css).tokens;
};
const MANAGED_IMPORTS_COMMENT = '/* scamp: font imports — managed by Project Settings → Fonts */';
const MANAGED_IMPORTS_TEXT = 'scamp: font imports — managed by Project Settings → Fonts';
const SHADE_SUFFIX_RE = /^(.+)-(\d+)$/;
const TYPOGRAPHY_PREFIX_RE = /^--(font|text|leading|tracking|weight|line-height|letter-spacing)/;
/**
 * Group `:root` tokens into commented sections by role so the generated
 * theme.css stays organised: one "Primitives — <palette>" block per colour
 * palette (first-seen order), then Semantic (`--color-*` without a numeric
 * shade), Typography (`--font/text/leading/…`), then the length/shadow roles
 * (Spacing/Border widths/Radius/Shadows), then anything else (uncommented).
 * Purely name-driven — token order within a section follows the model.
 */
const groupRootTokens = (tokens) => {
    const palettes = new Map();
    const semantic = [];
    const typography = [];
    const spacing = [];
    const border = [];
    const radius = [];
    const shadow = [];
    const other = [];
    const paletteBucket = (name) => {
        const existing = palettes.get(name);
        if (existing)
            return existing;
        const fresh = [];
        palettes.set(name, fresh);
        return fresh;
    };
    for (const t of tokens) {
        if (t.name.startsWith('--color-')) {
            const suffix = t.name.slice('--color-'.length);
            const m = suffix.match(SHADE_SUFFIX_RE);
            if (m && m[1] !== undefined)
                paletteBucket(m[1]).push(t);
            else
                semantic.push(t);
        }
        else if (t.name.startsWith('--space-')) {
            spacing.push(t);
        }
        else if (t.name.startsWith('--border-')) {
            border.push(t);
        }
        else if (t.name.startsWith('--radius-')) {
            radius.push(t);
        }
        else if (t.name.startsWith('--shadow-')) {
            shadow.push(t);
        }
        else if (TYPOGRAPHY_PREFIX_RE.test(t.name)) {
            typography.push(t);
        }
        else {
            other.push(t);
        }
    }
    const sections = [];
    for (const [name, toks] of palettes)
        sections.push({ comment: `Primitives — ${name}`, tokens: toks });
    if (semantic.length > 0)
        sections.push({ comment: 'Semantic', tokens: semantic });
    if (typography.length > 0)
        sections.push({ comment: 'Typography', tokens: typography });
    if (spacing.length > 0)
        sections.push({ comment: 'Spacing', tokens: spacing });
    if (border.length > 0)
        sections.push({ comment: 'Border widths', tokens: border });
    if (radius.length > 0)
        sections.push({ comment: 'Radius', tokens: radius });
    if (shadow.length > 0)
        sections.push({ comment: 'Shadows', tokens: shadow });
    if (other.length > 0)
        sections.push({
            // Only label the trailing block when it sits alongside grouped
            // sections; a tokens-only file (no palettes/semantic) stays flat.
            comment: sections.length > 0 ? 'Other' : null,
            tokens: other,
        });
    return sections;
};
/**
 * Rebuild a `:root` rule's contents from the model: clears it, then
 * appends grouped section comments + declarations. The `:root` token
 * block is Scamp-managed, so this is authoritative (it self-heals files
 * where an older writer orphaned the section comments).
 */
const rebuildRootBlock = (target, tokens) => {
    target.removeAll();
    target.raws.after = '\n';
    target.raws.semicolon = true;
    let firstNode = true;
    for (const section of groupRootTokens(tokens)) {
        if (section.comment !== null) {
            const comment = postcss.comment({ text: section.comment });
            comment.raws.left = ' ';
            comment.raws.right = ' ';
            comment.raws.before = firstNode ? '\n  ' : '\n\n  ';
            target.append(comment);
            firstNode = false;
        }
        for (const t of section.tokens) {
            const decl = postcss.decl({ prop: t.name, value: t.value });
            decl.raws.before = '\n  ';
            decl.raws.between = ': ';
            target.append(decl);
            firstNode = false;
        }
    }
};
/**
 * Update an existing theme.css in place: rebuild the managed `:root` token
 * block (grouped, commented sections) and reconcile top-level `@import`s +
 * `.dark`/`.theme-*` blocks to match `parsed`, while leaving every other
 * rule and hand-written declaration (resets, `body {}`, user CSS) untouched.
 * Returns null if the CSS won't parse so the caller can fall back to a
 * from-scratch write. see docs/archive/2026-07-23-design-system-plan.md
 */
const mergeIntoExistingCss = (parsed, existingCss) => {
    let root;
    try {
        root = postcss.parse(existingCss);
    }
    catch {
        return null;
    }
    // Imports: the parser round-trips ALL top-level @import URLs through
    // fontImportUrls, so reconcile = drop existing imports (and any stale
    // managed-imports comment) and re-add the current list at the top.
    root.walkAtRules('import', (r) => {
        r.remove();
    });
    root.walkComments((c) => {
        if (c.text.trim() === MANAGED_IMPORTS_TEXT)
            c.remove();
    });
    if (parsed.fontImportUrls.length > 0) {
        const importCss = `${MANAGED_IMPORTS_COMMENT}\n${parsed.fontImportUrls
            .map((u) => `@import url("${u}");`)
            .join('\n')}\n\n`;
        root.prepend(...postcss.parse(importCss).nodes);
    }
    // Tokens: the `:root` block is Scamp-managed, so rebuild it wholesale
    // from the model with grouped, commented sections. This self-heals files
    // an older writer left with orphaned section comments (all values dumped
    // under the last comment). Secondary `:root` blocks are consolidated away.
    const roots = [];
    root.walkRules((rule) => {
        if (rule.selector.trim() === ':root')
            roots.push(rule);
    });
    let target = roots[0];
    if (!target) {
        target = postcss.rule({ selector: ':root' });
        target.raws.before = '\n\n';
        target.raws.between = ' ';
        root.append(target);
        roots.push(target);
    }
    rebuildRootBlock(target, parsed.tokens);
    for (let i = roots.length - 1; i >= 1; i -= 1) {
        const r = roots[i];
        if (r)
            r.remove();
    }
    // Theme blocks: reconcile `.dark` / `.theme-*` rules to match the model.
    // Strip their `--*` decls (keeping any hand-written non-custom CSS), then
    // rewrite each model theme's tokens; drop managed blocks the model dropped.
    const modelThemes = parsed.themes ?? [];
    const themeRules = [];
    root.walkRules((rule) => {
        if (THEME_CLASS_RE.test(rule.selector.trim()))
            themeRules.push(rule);
    });
    for (const r of themeRules) {
        r.walkDecls((decl) => {
            if (decl.prop.startsWith('--'))
                decl.remove();
        });
    }
    const modelClasses = new Set(modelThemes.map((t) => t.cssClass));
    for (const block of modelThemes) {
        const selector = `.${block.cssClass}`;
        let rule = themeRules.find((r) => r.selector.trim() === selector);
        if (!rule) {
            rule = postcss.rule({ selector });
            rule.raws.before = '\n\n';
            rule.raws.between = ' ';
            root.append(rule);
            themeRules.push(rule);
        }
        rule.raws.after = '\n';
        rule.raws.semicolon = true;
        for (const t of block.tokens) {
            const decl = postcss.decl({ prop: t.name, value: t.value });
            decl.raws.before = '\n  ';
            decl.raws.between = ': ';
            rule.append(decl);
        }
    }
    for (const r of themeRules) {
        const cls = r.selector.trim().replace(/^\./, '');
        if (!modelClasses.has(cls) && r.nodes.length === 0)
            r.remove();
    }
    return root.toString();
};
/**
 * Serialize tokens + font import URLs back to CSS.
 *
 * When `existingCss` is provided, tokens and imports are updated in
 * place and all other CSS (resets, `body {}`, comments) is preserved
 * (see `mergeIntoExistingCss`). Without it — or if that CSS won't parse
 * — this falls back to a full from-scratch write that emits the imports
 * above a single `:root` block.
 */
export const serializeThemeFile = (parsed, existingCss) => {
    if (typeof existingCss === 'string' && existingCss.trim().length > 0) {
        const merged = mergeIntoExistingCss(parsed, existingCss);
        if (merged !== null)
            return merged;
    }
    const parts = [];
    if (parsed.fontImportUrls.length > 0) {
        parts.push('/* scamp: font imports — managed by Project Settings → Fonts */');
        for (const url of parsed.fontImportUrls) {
            parts.push(`@import url("${url}");`);
        }
        parts.push('');
    }
    if (parsed.tokens.length === 0) {
        parts.push(':root {\n}');
    }
    else {
        const lines = parsed.tokens.map((t) => `  ${t.name}: ${t.value};`);
        parts.push(`:root {\n${lines.join('\n')}\n}`);
    }
    for (const block of parsed.themes ?? []) {
        if (block.tokens.length === 0)
            continue;
        const lines = block.tokens.map((t) => `  ${t.name}: ${t.value};`);
        parts.push('');
        parts.push(`.${block.cssClass} {\n${lines.join('\n')}\n}`);
    }
    return parts.join('\n') + '\n';
};
