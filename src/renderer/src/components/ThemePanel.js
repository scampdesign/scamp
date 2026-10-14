import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState, } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasStore } from '@store/canvasSlice';
import { useFontsStore, selectAllFonts } from '@store/fontsSlice';
import { serializeThemeFile, themeDefFromClass, } from '@lib/parseTheme';
import { classifyToken } from '@lib/tokenClassify';
import { buildColorModel } from '@lib/colorModel';
import { generatePalette } from '@lib/palette';
import { buildTextStyles, defaultTextStyleTokens, isTextStyleToken, textStyleTokenName, textStyleTokensFromTemplate, TEXT_STYLE_PROPS, } from '@lib/typographyModel';
import { defaultTokensForRole, isDesignRoleToken, roleTokenName, tokensForRole, ROLE_LABEL, } from '@lib/tokenRoles';
import { errorMessage } from '@shared/errorMessage';
import { Button } from './controls/Button';
import { ColorInput } from './controls/ColorInput';
import { FontPicker } from './controls/FontPicker';
import { Tooltip } from './controls/Tooltip';
import { DesignDocSection } from './DesignDocSection';
import { FontsSection } from './sections/FontsSection';
import { TextStyleRow } from './TextStyleRow';
import styles from './ThemePanel.module.css';
/** Category → default seed value when the user changes a typography
 * token's type via the badge menu. The classifier picks up the
 * re-seeded value on the next render so the badge text, value input,
 * and row shape all line up. */
const TYPOGRAPHY_SEED = {
    fontSize: '1rem',
    lineHeight: '1.5',
    fontFamily: "'Inter', sans-serif",
};
const TYPOGRAPHY_CATEGORY_OPTIONS = [
    { value: 'fontSize', label: 'Size' },
    { value: 'lineHeight', label: 'Line-height' },
    { value: 'fontFamily', label: 'Font' },
];
const TYPOGRAPHY_CATEGORIES = new Set([
    'fontSize',
    'lineHeight',
    'fontFamily',
]);
const categoryBadge = (category) => {
    switch (category) {
        case 'fontSize':
            return 'Size';
        case 'lineHeight':
            return 'Line-H';
        case 'fontFamily':
            return 'Font';
        case 'color':
            return 'Color';
        default:
            return 'Unknown';
    }
};
/** Seed colour a freshly-added palette generates its ramp from. */
const DEFAULT_PALETTE_SEED = '#3b82f6';
/** A `var(--color-<palette>-<shade>)` reference the semantic dropdown targets. */
const SEMANTIC_REF_RE = /^var\(--color-(.+)-(\d+)\)$/;
/** True when `name` is a numeric-shade token of the given palette. */
const isPaletteShade = (name, palette) => new RegExp(`^--color-${palette}-\\d+$`).test(name);
/** Validate a token name: must start with --, no spaces. */
const validateTokenName = (name) => {
    if (!name.startsWith('--'))
        return 'Name must start with --';
    if (/\s/.test(name))
        return 'Name cannot contain spaces';
    if (name.length < 3)
        return 'Name is too short';
    return null;
};
/**
 * Count how many elements in the tree reference a token via var().
 * Checks every field that can hold a var() ref today.
 */
const countTokenUsage = (elements, tokenName) => {
    const varRef = `var(${tokenName})`;
    let count = 0;
    for (const raw of Object.values(elements)) {
        const el = raw;
        if (el.backgroundColor === varRef)
            count += 1;
        if (el.borderColor === varRef)
            count += 1;
        if (el.color === varRef)
            count += 1;
        if (el.fontSize === varRef)
            count += 1;
        if (el.lineHeight === varRef)
            count += 1;
        if (el.letterSpacing === varRef)
            count += 1;
        if (el.fontFamily?.includes(varRef))
            count += 1;
    }
    return count;
};
/**
 * Modal for managing project design tokens (CSS custom properties).
 * Tabs split tokens by inferred category (colors / typography / unknown).
 * Changes write to theme.css on disk; chokidar hot-reloads them.
 */
export const ThemePanel = ({ projectPath }) => {
    // `localTokens` mirrors the base (:root) tokens — primitives + light
    // semantic + typography, all GLOBAL across themes. `localOverrides`
    // holds the per-theme semantic overrides (.dark / .theme-*). The
    // Semantic area renders the Light block (base values) plus one block
    // per theme, each editable inline; preview lives in the canvas toolbar.
    // see docs/archive/2026-07-23-design-system-plan.md
    const themeBaseTokens = useCanvasStore((s) => s.themeBaseTokens);
    const storeOverrides = useCanvasStore((s) => s.themeOverrides);
    const elements = useCanvasStore((s) => s.elements);
    const allFonts = useFontsStore(selectAllFonts);
    const [localTokens, setLocalTokens] = useState([
        ...themeBaseTokens,
    ]);
    const [localOverrides, setLocalOverrides] = useState([
        ...storeOverrides,
    ]);
    const projectFormat = useCanvasStore((s) => s.projectFormat);
    const isLegacy = projectFormat === 'legacy';
    const [error, setError] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    /** Palette pending deletion — set only when a semantic token references it. */
    const [pendingPaletteDelete, setPendingPaletteDelete] = useState(null);
    /** Text style pending deletion — set only when elements reference it. */
    const [pendingTextStyleDelete, setPendingTextStyleDelete] = useState(null);
    /**
     * Which token's badge-picker menu is currently open. Carries the
     * trigger button's viewport rect so we can portal the menu out of
     * the (now-scrollable) token list — otherwise the dropdown would
     * be clipped at the list's overflow boundary.
     */
    const [badgeMenuFor, setBadgeMenuFor] = useState(null);
    const closeBadgeMenu = useCallback(() => setBadgeMenuFor(null), []);
    /**
     * Ref + signal pair for "scroll the token list to the bottom on the
     * next render". `handleAddToken` bumps `scrollToEndAfterAdd` and
     * the effect runs after React commits the new row so we read the
     * post-add `scrollHeight`.
     */
    const editorRef = useRef(null);
    const scrollTargetSection = useRef('colors');
    const [scrollToEndAfterAdd, setScrollToEndAfterAdd] = useState(0);
    useEffect(() => {
        if (scrollToEndAfterAdd === 0)
            return;
        const section = editorRef.current?.querySelector(`[data-theme-section="${scrollTargetSection.current}"]`);
        const rows = section?.querySelectorAll('[data-token-row]');
        const last = rows?.[rows.length - 1];
        if (last instanceof HTMLElement)
            last.scrollIntoView({ block: 'nearest' });
    }, [scrollToEndAfterAdd]);
    // Sync from store when the theme data changes externally (file edit,
    // theme switch, optimistic write). Base tokens + overrides both mirror
    // the store so the panel always reflects on-disk truth.
    useEffect(() => {
        setLocalTokens([...themeBaseTokens]);
    }, [themeBaseTokens]);
    useEffect(() => {
        setLocalOverrides([...storeOverrides]);
    }, [storeOverrides]);
    // Classify once per render so the tab lists and badges agree.
    const categories = useMemo(() => localTokens.map((t) => classifyToken(t.value)), [localTokens]);
    // Every `--color-*` token is owned by the Colors section (as a palette
    // shade or a semantic mapping). Its VALUE may classify as anything —
    // a semantic token's `var(--color-…)` reads as `unknown` — so we route
    // by NAME here, otherwise those tokens double-render in both Colors and
    // Typography/Unknown. see docs/archive/2026-07-23-design-system-plan.md
    const isColorToken = (name) => name.startsWith('--color-');
    const inColors = (category, name) => isColorToken(name) || category === 'color';
    const tabCounts = useMemo(() => {
        let colors = 0;
        let typography = 0;
        let unknown = 0;
        categories.forEach((c, i) => {
            const name = localTokens[i]?.name ?? '';
            // Text-style group tokens (`--text-h1-size`, …) and design-role
            // tokens (`--space/border/radius/shadow-*`) have their own sections;
            // keep them out of the generic buckets.
            if (isTextStyleToken(name) || isDesignRoleToken(name))
                return;
            if (inColors(c, name))
                colors += 1;
            else if (TYPOGRAPHY_CATEGORIES.has(c))
                typography += 1;
            else
                unknown += 1;
        });
        return { colors, typography, unknown };
    }, [categories, localTokens]);
    // Token indices grouped by section, in source order. Handlers get the
    // original index so the source array position is preserved.
    const grouped = useMemo(() => {
        const colors = [];
        const typography = [];
        const unknown = [];
        categories.forEach((c, i) => {
            const name = localTokens[i]?.name ?? '';
            // Owned by the Text styles / Spacing / Border / Radius / Shadow
            // sections (routed by name); keep out of the generic buckets.
            if (isTextStyleToken(name) || isDesignRoleToken(name))
                return;
            if (inColors(c, name))
                colors.push(i);
            else if (TYPOGRAPHY_CATEGORIES.has(c))
                typography.push(i);
            else
                unknown.push(i);
        });
        return { colors, typography, unknown };
    }, [categories, localTokens]);
    // Text styles: grouped `--text-<name>-<prop>` tokens, edited as a set.
    const textStyles = useMemo(() => buildTextStyles(localTokens), [localTokens]);
    // Structured VIEW over the flat colour tokens: primitive palettes +
    // semantic tokens. The flat list stays authoritative; every edit below
    // mutates it and reserializes. see docs/archive/2026-07-23-design-system-plan.md
    const colorModel = useMemo(() => buildColorModel(localTokens), [localTokens]);
    /**
     * The primitives, as tokens for the semantic row's picker. Only
     * primitives: offering the semantic tokens here would let one semantic
     * point at another and make a reference cycle reachable in two clicks.
     */
    const primitiveTokens = useMemo(() => colorModel.palettes.flatMap((p) => p.shades.map((s) => ({
        name: `--color-${p.name}-${s.shade}`,
        value: s.value,
    }))), [colorModel]);
    /**
     * Colour-classified tokens the structured model doesn't capture — i.e.
     * not prefixed `--color-` (arbitrary names in agent-seeded / legacy
     * projects). Rendered as a flat "Other" list so they stay editable
     * instead of silently vanishing from the panel.
     */
    const otherColorIndices = useMemo(() => {
        const captured = new Set();
        for (const p of colorModel.palettes)
            for (const s of p.shades)
                captured.add(s.name);
        for (const s of colorModel.semantic)
            captured.add(s.name);
        return grouped.colors.filter((i) => {
            const t = localTokens[i];
            return t ? !captured.has(t.name) : false;
        });
    }, [colorModel, grouped.colors, localTokens]);
    /**
     * Persist the full design system — base (:root) tokens + per-theme
     * override blocks — to theme.css. Optimistically pushes the model to
     * the store first so the canvas + pickers reflect the edit immediately
     * for the active theme; the chokidar reparse confirms it later. Font
     * imports and hand-written CSS are preserved (see serializeThemeFile).
     * see docs/archive/2026-07-23-design-system-plan.md
     */
    const persist = async (base, overrides) => {
        try {
            const urls = useFontsStore.getState().projectFontUrls;
            // Prune override tokens whose base definition is gone (renamed or
            // deleted semantic) and drop blocks left empty — keeps theme blocks
            // consistent without per-handler override bookkeeping.
            const baseNames = new Set(base.map((t) => t.name));
            const prunedOverrides = overrides
                .map((b) => ({
                cssClass: b.cssClass,
                tokens: b.tokens.filter((t) => baseNames.has(t.name)),
            }))
                .filter((b) => b.tokens.length > 0);
            const model = {
                tokens: base,
                themes: prunedOverrides,
                fontImportUrls: [...urls],
            };
            useCanvasStore.getState().setThemeData(model);
            const existing = await window.scamp.readTheme({ projectPath });
            await window.scamp.writeTheme({
                projectPath,
                content: serializeThemeFile(model, existing),
            });
            setError(null);
        }
        catch (e) {
            setError(errorMessage(e));
        }
    };
    /** Persist a base-token change, keeping the current theme overrides. */
    const writeTokens = (base) => {
        void persist(base, localOverrides);
    };
    const nextDefaultName = (prefix) => {
        const existing = new Set(localTokens.map((t) => t.name));
        let idx = 1;
        while (existing.has(`${prefix}-${idx}`))
            idx += 1;
        return `${prefix}-${idx}`;
    };
    // Colours have their own structured add flows (handleAddPalette /
    // handleAddSemantic); this drives the Typography section only.
    const handleAddToken = (section) => {
        let newToken;
        if (section === 'typography') {
            // Cycle through size / line / family so successive clicks create
            // a balanced set instead of ten `--text-*` tokens in a row.
            const sizes = tabCounts.typography;
            const pick = sizes % 3;
            if (pick === 0) {
                newToken = { name: nextDefaultName('--text'), value: '1rem' };
            }
            else if (pick === 1) {
                newToken = { name: nextDefaultName('--leading'), value: '1.5' };
            }
            else {
                newToken = {
                    name: nextDefaultName('--font'),
                    value: "'Inter', sans-serif",
                };
            }
        }
        else {
            newToken = { name: nextDefaultName('--token'), value: '' };
        }
        const next = [...localTokens, newToken];
        setLocalTokens(next);
        void writeTokens(next);
        // Make the new row visible — without this, adding a token to a
        // long list looks like a no-op because the new row sits below the
        // scroll viewport.
        scrollTargetSection.current = section;
        setScrollToEndAfterAdd((n) => n + 1);
    };
    const handleNameChange = (index, newName) => {
        const next = localTokens.map((t, i) => i === index ? { ...t, name: newName } : t);
        setLocalTokens(next);
    };
    const handleNameBlur = (index) => {
        const token = localTokens[index];
        if (!token)
            return;
        const nameError = validateTokenName(token.name);
        if (nameError) {
            setError(`${token.name}: ${nameError}`);
            setLocalTokens([...themeBaseTokens]);
            return;
        }
        const duplicate = localTokens.some((t, i) => i !== index && t.name === token.name);
        if (duplicate) {
            setError(`${token.name} already exists`);
            setLocalTokens([...themeBaseTokens]);
            return;
        }
        setError(null);
        void writeTokens(localTokens);
    };
    const handleValueChange = (index, newValue) => {
        const next = localTokens.map((t, i) => i === index ? { ...t, value: newValue } : t);
        setLocalTokens(next);
    };
    const commitValue = (index) => {
        void writeTokens(localTokens);
    };
    /** Color-tab shortcut: ColorInput commits immediately. */
    const handleColorChange = (index, newValue) => {
        const next = localTokens.map((t, i) => i === index ? { ...t, value: newValue } : t);
        setLocalTokens(next);
        void writeTokens(next);
    };
    const applyTokens = (next) => {
        setLocalTokens(next);
        void writeTokens(next);
    };
    /** Next free `palette`, `palette2`, … name (no numeric-shade suffix). */
    const nextPaletteName = () => {
        const names = new Set(colorModel.palettes.map((p) => p.name));
        if (!names.has('palette'))
            return 'palette';
        let i = 2;
        while (names.has(`palette${i}`))
            i += 1;
        return `palette${i}`;
    };
    /**
     * Next free semantic name. Deliberately avoids a `-<number>` suffix,
     * which buildColorModel would misread as a primitive palette shade.
     */
    const nextSemanticName = () => {
        const existing = new Set(localTokens.map((t) => t.name));
        if (!existing.has('--color-custom'))
            return '--color-custom';
        let i = 2;
        while (existing.has(`--color-custom${i}`))
            i += 1;
        return `--color-custom${i}`;
    };
    /** Add a fresh palette: a full generated ramp from the default seed. */
    const handleAddPalette = () => {
        const name = nextPaletteName();
        const shades = generatePalette(DEFAULT_PALETTE_SEED);
        const tokens = shades.map((s) => ({
            name: `--color-${name}-${s.shade}`,
            value: s.value,
        }));
        applyTokens([...localTokens, ...tokens]);
        scrollTargetSection.current = 'colors';
        setScrollToEndAfterAdd((n) => n + 1);
    };
    /**
     * Regenerate a palette's whole ramp from its current 500 shade (or the
     * middle shade if 500 is absent). Shade values are updated IN PLACE so
     * the palette keeps its position in the list (rebuilding it at the end
     * made the palette jump to the bottom). Semantic refs to this palette
     * are left untouched, so the mappings survive.
     */
    const handleRegeneratePalette = (palette) => {
        const seedShade = palette.shades.find((s) => s.shade === 500) ??
            palette.shades[Math.floor(palette.shades.length / 2)];
        if (!seedShade)
            return;
        const shades = generatePalette(seedShade.value);
        if (shades.length === 0)
            return;
        const valueByShade = new Map(shades.map((s) => [s.shade, s.value]));
        const prefix = `--color-${palette.name}-`;
        // Update existing shade tokens in place.
        const used = new Set();
        const next = localTokens.map((t) => {
            if (!isPaletteShade(t.name, palette.name))
                return t;
            const shade = Number(t.name.slice(prefix.length));
            const value = valueByShade.get(shade);
            if (value === undefined)
                return t;
            used.add(shade);
            return { ...t, value };
        });
        // Insert any generated shades the palette didn't have yet, right after
        // its last existing shade so the block stays contiguous (no jump).
        const extras = shades.filter((s) => !used.has(s.shade));
        if (extras.length > 0) {
            let lastIdx = -1;
            next.forEach((t, i) => {
                if (isPaletteShade(t.name, palette.name))
                    lastIdx = i;
            });
            next.splice(lastIdx + 1, 0, ...extras.map((s) => ({ name: `${prefix}${s.shade}`, value: s.value })));
        }
        applyTokens(next);
    };
    /**
     * Rename a palette: rewrite every `--color-<old>-<shade>` token name AND
     * every `var(--color-<old>-…)` reference in other token values, so
     * semantic mappings keep resolving.
     */
    const handleRenamePalette = (oldName, rawNew) => {
        const newName = rawNew.trim();
        if (newName === '' || newName === oldName)
            return;
        if (/\s/.test(newName)) {
            setError('Palette name cannot contain spaces');
            return;
        }
        if (colorModel.palettes.some((p) => p.name === newName)) {
            setError(`Palette "${newName}" already exists`);
            return;
        }
        const namePrefix = `--color-${oldName}-`;
        const refPrefix = `var(--color-${oldName}-`;
        const next = localTokens.map((t) => {
            let { name, value } = t;
            if (isPaletteShade(name, oldName))
                name = `--color-${newName}-${name.slice(namePrefix.length)}`;
            if (value.startsWith(refPrefix))
                value = `var(--color-${newName}-${value.slice(refPrefix.length)}`;
            return { name, value };
        });
        setError(null);
        applyTokens(next);
    };
    /** Count semantic tokens whose resolved value flows through this palette. */
    const paletteRefCount = (paletteName) => colorModel.semantic.filter((s) => {
        const m = s.value.match(SEMANTIC_REF_RE);
        return m?.[1] === paletteName;
    }).length;
    const handleDeletePaletteRequest = (palette) => {
        const refCount = paletteRefCount(palette.name);
        if (refCount > 0) {
            setPendingPaletteDelete({ palette, refCount });
            return;
        }
        confirmDeletePalette(palette);
    };
    const confirmDeletePalette = (palette) => {
        const next = localTokens.filter((t) => !isPaletteShade(t.name, palette.name));
        setPendingPaletteDelete(null);
        applyTokens(next);
    };
    /** Semantic override tokens for a theme class, keyed by token name. */
    const overrideMapFor = (cssClass) => {
        const block = localOverrides.find((b) => b.cssClass === cssClass);
        return new Map((block?.tokens ?? []).map((t) => [t.name, t.value]));
    };
    /** Upsert a semantic value into a specific theme's override block. */
    const setOverrideFor = (cssClass, name, value) => {
        const existing = localOverrides.find((b) => b.cssClass === cssClass);
        if (!existing) {
            return [...localOverrides, { cssClass, tokens: [{ name, value }] }];
        }
        const tokens = existing.tokens.some((t) => t.name === name)
            ? existing.tokens.map((t) => (t.name === name ? { name, value } : t))
            : [...existing.tokens, { name, value }];
        return localOverrides.map((b) => b.cssClass === cssClass ? { ...b, tokens } : b);
    };
    /**
     * Point a semantic token at a `<palette>/<shade>` primitive for a given
     * theme. The Light theme (cssClass `''`) edits the base `:root` value;
     * any other theme writes into its override block, leaving the base — and
     * thus every other theme — untouched.
     */
    /**
     * Write any value — a `var(--color-…)` primitive reference or a literal
     * colour — into a semantic token for one theme. The Light theme
     * (cssClass `''`) edits the base `:root` value; any other theme writes
     * into its override block, leaving the base untouched.
     */
    const setSemanticValue = (tokenName, value, cssClass) => {
        if (cssClass === '') {
            const nextBase = localTokens.map((t) => t.name === tokenName ? { ...t, value } : t);
            setLocalTokens(nextBase);
            void persist(nextBase, localOverrides);
            return;
        }
        const nextOverrides = setOverrideFor(cssClass, tokenName, value);
        setLocalOverrides(nextOverrides);
        void persist(localTokens, nextOverrides);
    };
    const handleSemanticMap = (tokenName, paletteName, shade, cssClass) => {
        const value = `var(--color-${paletteName}-${shade})`;
        if (cssClass === '') {
            const nextBase = localTokens.map((t) => t.name === tokenName ? { ...t, value } : t);
            setLocalTokens(nextBase);
            void persist(nextBase, localOverrides);
            return;
        }
        const nextOverrides = setOverrideFor(cssClass, tokenName, value);
        setLocalOverrides(nextOverrides);
        void persist(localTokens, nextOverrides);
    };
    const handleAddSemantic = () => {
        const first = colorModel.palettes[0];
        const mid = first?.shades.find((s) => s.shade === 500) ??
            first?.shades[Math.floor((first?.shades.length ?? 0) / 2)];
        const value = first && mid ? `var(--color-${first.name}-${mid.shade})` : '#888888';
        applyTokens([...localTokens, { name: nextSemanticName(), value }]);
        scrollTargetSection.current = 'colors';
        setScrollToEndAfterAdd((n) => n + 1);
    };
    const slugify = (s) => s
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    /** CSS class for a theme name: "Dark" → `dark`, else `theme-<slug>`. */
    const cssClassForName = (name) => {
        const slug = slugify(name);
        return slug === 'dark' ? 'dark' : `theme-${slug}`;
    };
    /**
     * Add a theme: a new override block seeded with a copy of every current
     * semantic value, so it starts identical to Light and the user tweaks
     * it in place. Auto-named ("Dark", then "Theme 2"…); rename inline via
     * the block header. see docs/archive/2026-07-23-design-system-plan.md
     */
    const handleAddTheme = () => {
        const usedClasses = new Set(localOverrides.map((b) => b.cssClass));
        let name = 'Dark';
        if (usedClasses.has('dark')) {
            let n = 2;
            while (usedClasses.has(`theme-theme-${n}`))
                n += 1;
            name = `Theme ${n}`;
        }
        const cssClass = cssClassForName(name);
        const seed = colorModel.semantic.map((s) => ({
            name: s.name,
            value: s.value,
        }));
        const nextOverrides = [...localOverrides, { cssClass, tokens: seed }];
        setLocalOverrides(nextOverrides);
        setError(null);
        void persist(localTokens, nextOverrides);
        scrollTargetSection.current = 'colors';
        setScrollToEndAfterAdd((n) => n + 1);
    };
    /** Rename a theme block — changes its CSS class (and thus its label). */
    const handleRenameTheme = (oldCssClass, rawName) => {
        const name = rawName.trim();
        if (name === '')
            return;
        const newCssClass = cssClassForName(name);
        if (newCssClass === oldCssClass)
            return;
        if (localOverrides.some((b) => b.cssClass === newCssClass)) {
            setError(`Theme "${name}" already exists`);
            return;
        }
        const nextOverrides = localOverrides.map((b) => b.cssClass === oldCssClass ? { ...b, cssClass: newCssClass } : b);
        setLocalOverrides(nextOverrides);
        setError(null);
        void persist(localTokens, nextOverrides);
    };
    const handleRemoveTheme = (cssClass) => {
        const nextOverrides = localOverrides.filter((b) => b.cssClass !== cssClass);
        setLocalOverrides(nextOverrides);
        void persist(localTokens, nextOverrides);
    };
    // --- Text styles (grouped --text-<name>-<prop> tokens) ---
    /** Persist a base-token change that came from a text-style edit. */
    const applyBaseTokens = (next) => {
        setLocalTokens(next);
        void persist(next, localOverrides);
    };
    /** How many elements reference any of a text style's tokens via var(). */
    const countTextStyleUsage = (style) => {
        const refs = TEXT_STYLE_PROPS.map((p) => `var(${textStyleTokenName(style.name, p)})`);
        let count = 0;
        for (const raw of Object.values(elements)) {
            const el = raw;
            const used = (el.fontFamily !== undefined && refs.includes(el.fontFamily)) ||
                (el.fontSize !== undefined && refs.includes(el.fontSize)) ||
                (el.lineHeight !== undefined && refs.includes(el.lineHeight)) ||
                (el.letterSpacing !== undefined && refs.includes(el.letterSpacing));
            if (used)
                count += 1;
        }
        return count;
    };
    const nextTextStyleName = () => {
        const existing = new Set(textStyles.map((s) => s.name));
        let i = 1;
        while (existing.has(`style-${i}`))
            i += 1;
        return `style-${i}`;
    };
    /** Add the full PRD default set — only the styles not already present. */
    const handleAddDefaultTextStyles = () => {
        const existingNames = new Set(textStyles.map((s) => s.name));
        const existingTokenNames = new Set(localTokens.map((t) => t.name));
        const toAdd = defaultTextStyleTokens().filter((t) => {
            const m = t.name.match(/^--text-(.+)-\w+$/);
            const styleName = m?.[1];
            return (styleName !== undefined &&
                !existingNames.has(styleName) &&
                !existingTokenNames.has(t.name));
        });
        if (toAdd.length === 0)
            return;
        applyBaseTokens([...localTokens, ...toAdd]);
        scrollTargetSection.current = 'typography';
        setScrollToEndAfterAdd((n) => n + 1);
    };
    /** Add one blank text style seeded from the Body template. */
    const handleAddTextStyle = () => {
        const name = nextTextStyleName();
        const tokens = textStyleTokensFromTemplate({
            name,
            size: '1rem',
            weight: '400',
            leading: '1.5',
        });
        applyBaseTokens([...localTokens, ...tokens]);
        scrollTargetSection.current = 'typography';
        setScrollToEndAfterAdd((n) => n + 1);
    };
    /** Set one prop of a text style, creating the token if absent. */
    const handleTextStyleProp = (styleName, prop, value) => {
        const tokenName = textStyleTokenName(styleName, prop);
        const trimmed = value.trim();
        // Empty value removes an optional token (e.g. clearing tracking).
        if (trimmed === '') {
            applyBaseTokens(localTokens.filter((t) => t.name !== tokenName));
            return;
        }
        const exists = localTokens.some((t) => t.name === tokenName);
        const next = exists
            ? localTokens.map((t) => t.name === tokenName ? { ...t, value: trimmed } : t)
            : [...localTokens, { name: tokenName, value: trimmed }];
        applyBaseTokens(next);
    };
    /** Rename a text style — moves every `--text-<old>-<prop>` token. */
    const handleRenameTextStyle = (oldName, rawName) => {
        const slug = slugify(rawName);
        if (slug === '' || slug === oldName)
            return;
        if (textStyles.some((s) => s.name === slug)) {
            setError(`Text style "${rawName.trim()}" already exists`);
            return;
        }
        const oldPrefix = `--text-${oldName}-`;
        const next = localTokens.map((t) => t.name.startsWith(oldPrefix) && isTextStyleToken(t.name)
            ? { ...t, name: `--text-${slug}-${t.name.slice(oldPrefix.length)}` }
            : t);
        setError(null);
        applyBaseTokens(next);
    };
    const handleDeleteTextStyleRequest = (style) => {
        const usageCount = countTextStyleUsage(style);
        if (usageCount > 0) {
            setPendingTextStyleDelete({ style, usageCount });
            return;
        }
        confirmDeleteTextStyle(style);
    };
    const confirmDeleteTextStyle = (style) => {
        const prefix = `--text-${style.name}-`;
        const next = localTokens.filter((t) => !(t.name.startsWith(prefix) && isTextStyleToken(t.name)));
        setPendingTextStyleDelete(null);
        applyBaseTokens(next);
    };
    // --- Design-role tokens (spacing / border / radius / shadow) ---
    const handleAddDefaultRole = (role) => {
        const existing = new Set(localTokens.map((t) => t.name));
        const toAdd = defaultTokensForRole(role).filter((t) => !existing.has(t.name));
        if (toAdd.length === 0)
            return;
        applyBaseTokens([...localTokens, ...toAdd]);
        scrollTargetSection.current = role;
        setScrollToEndAfterAdd((n) => n + 1);
    };
    const handleAddRoleToken = (role) => {
        const used = new Set(tokensForRole(role, localTokens).map((t) => t.label));
        let i = 1;
        while (used.has(String(i)))
            i += 1;
        const value = role === 'shadow' ? '0 1px 2px rgba(0, 0, 0, 0.1)' : '8px';
        applyBaseTokens([
            ...localTokens,
            { name: roleTokenName(role, String(i)), value },
        ]);
        scrollTargetSection.current = role;
        setScrollToEndAfterAdd((n) => n + 1);
    };
    const handleRoleTokenValue = (name, value) => {
        const trimmed = value.trim();
        if (trimmed === '')
            return;
        applyBaseTokens(localTokens.map((t) => (t.name === name ? { ...t, value: trimmed } : t)));
    };
    const handleRenameRoleToken = (role, oldName, rawLabel) => {
        const label = rawLabel.trim();
        if (label === '')
            return;
        const newName = roleTokenName(role, label);
        if (newName === oldName)
            return;
        if (localTokens.some((t) => t.name === newName)) {
            setError(`${newName} already exists`);
            return;
        }
        setError(null);
        applyBaseTokens(localTokens.map((t) => (t.name === oldName ? { ...t, name: newName } : t)));
    };
    const handleDeleteRoleToken = (name) => {
        applyBaseTokens(localTokens.filter((t) => t.name !== name));
    };
    /**
     * Reassign a typography token to a different category. We swap the
     * value for a category-appropriate seed; the classifier re-runs on
     * every render so the badge, input shape, and tab placement all
     * update in lockstep. If the token already matches the requested
     * category we just close the menu — no destructive overwrite.
     */
    const handleChangeCategory = (index, newCategory) => {
        setBadgeMenuFor(null);
        const token = localTokens[index];
        if (!token)
            return;
        const currentCategory = classifyToken(token.value);
        if (currentCategory === newCategory)
            return;
        const next = localTokens.map((t, i) => i === index ? { ...t, value: TYPOGRAPHY_SEED[newCategory] } : t);
        setLocalTokens(next);
        void writeTokens(next);
    };
    /** FontPicker commits the full CSS expression — write immediately. */
    const handleFontFamilyChange = (index, newValue) => {
        if (newValue.trim().length === 0)
            return;
        const next = localTokens.map((t, i) => i === index ? { ...t, value: newValue } : t);
        setLocalTokens(next);
        void writeTokens(next);
    };
    const handleDeleteRequest = (index) => {
        const token = localTokens[index];
        if (!token)
            return;
        const usageCount = countTokenUsage(elements, token.name);
        if (usageCount > 0) {
            setPendingDelete({ index, name: token.name, usageCount });
            return;
        }
        confirmDelete(index);
    };
    const confirmDelete = (index) => {
        const next = localTokens.filter((_, i) => i !== index);
        setLocalTokens(next);
        setPendingDelete(null);
        void writeTokens(next);
    };
    const renderColorRow = (index, token) => (_jsxs("div", { className: styles.tokenRow, "data-token-row": true, children: [_jsx("input", { type: "text", className: styles.tokenName, value: token.name, onChange: (e) => handleNameChange(index, e.target.value), onBlur: () => handleNameBlur(index), onKeyDown: (e) => {
                    if (e.key === 'Enter')
                        e.currentTarget.blur();
                } }), _jsx("div", { className: styles.tokenColor, children: _jsx(ColorInput, { value: token.value, onChange: (v) => handleColorChange(index, v) }) }), _jsx(Tooltip, { label: "Delete token", children: _jsx("button", { className: styles.tokenDelete, onClick: () => handleDeleteRequest(index), type: "button", children: "x" }) })] }, index));
    const renderPaletteBlock = (palette) => (_jsxs("div", { className: styles.palette, "data-palette": palette.name, "data-token-row": true, children: [_jsxs("div", { className: styles.paletteHeader, children: [_jsx("input", { type: "text", className: styles.paletteName, defaultValue: palette.name, "aria-label": `Palette name for ${palette.name}`, onBlur: (e) => handleRenamePalette(palette.name, e.target.value), onKeyDown: (e) => {
                            if (e.key === 'Enter')
                                e.currentTarget.blur();
                        } }), _jsx(Tooltip, { label: "Regenerate ramp from the 500 shade", children: _jsx("button", { type: "button", className: styles.generateButton, onClick: () => handleRegeneratePalette(palette), children: "Generate" }) }), _jsx(Tooltip, { label: "Delete palette", children: _jsx("button", { type: "button", className: styles.tokenDelete, onClick: () => handleDeletePaletteRequest(palette), children: "x" }) })] }), _jsx("div", { className: styles.shadeRow, children: palette.shades.map((shade) => {
                    const idx = localTokens.findIndex((t) => t.name === shade.name);
                    return (_jsxs("div", { className: styles.shade, children: [_jsx("div", { className: styles.shadeSwatch, children: _jsx(ColorInput, { value: shade.value, onChange: (v) => idx >= 0 && handleColorChange(idx, v), swatchOnly: true }) }), _jsx("span", { className: styles.shadeLabel, children: shade.shade })] }, shade.name));
                }) })] }, palette.name));
    /**
     * A semantic token row for a given theme. Light (`cssClass === ''`)
     * edits the base value and owns the token DEFINITION (name / delete);
     * other themes show a read-only name and only remap the value into
     * their own override block.
     */
    const renderSemanticRow = (sem, cssClass, overrideMap) => {
        const isLightRow = cssClass === '';
        const index = localTokens.findIndex((t) => t.name === sem.name);
        const effectiveValue = isLightRow
            ? sem.value
            : (overrideMap?.get(sem.name) ?? sem.value);
        return (_jsxs("div", { className: styles.tokenRow, "data-token-row": true, children: [_jsx("input", { type: "text", className: styles.tokenName, value: sem.name, readOnly: !isLightRow, "aria-label": `Semantic token ${sem.name}`, onChange: isLightRow
                        ? (e) => handleNameChange(index, e.target.value)
                        : undefined, onBlur: isLightRow ? () => handleNameBlur(index) : undefined, onKeyDown: (e) => {
                        if (e.key === 'Enter')
                            e.currentTarget.blur();
                    } }), _jsx("div", { className: styles.semanticValue, children: _jsx(ColorInput, { value: effectiveValue, onChange: (next) => setSemanticValue(sem.name, next, cssClass), tokens: primitiveTokens, defaultTab: "tokens", ariaLabel: `Mapping for ${sem.name}` }) }), isLightRow && (_jsx(Tooltip, { label: "Delete token", children: _jsx("button", { className: styles.tokenDelete, onClick: () => handleDeleteRequest(index), type: "button", children: "x" }) }))] }, `${cssClass}:${sem.name}`));
    };
    /** A stacked theme override block: header (rename + remove) + rows. */
    const renderThemeBlock = (block) => {
        const label = themeDefFromClass(block.cssClass).label;
        const overrideMap = overrideMapFor(block.cssClass);
        return (_jsxs("div", { className: styles.themeBlock, "data-theme-block": block.cssClass, "data-token-row": true, children: [_jsxs("div", { className: styles.themeBlockHeader, children: [_jsx("input", { type: "text", className: styles.themeBlockName, defaultValue: label, "aria-label": `Theme name for ${label}`, onBlur: (e) => handleRenameTheme(block.cssClass, e.target.value), onKeyDown: (e) => {
                                if (e.key === 'Enter')
                                    e.currentTarget.blur();
                            } }), _jsx(Tooltip, { label: "Remove theme", children: _jsx("button", { type: "button", className: styles.tokenDelete, "aria-label": `Remove ${label} theme`, onClick: () => handleRemoveTheme(block.cssClass), children: "x" }) })] }), colorModel.semantic.map((sem) => renderSemanticRow(sem, block.cssClass, overrideMap))] }, block.cssClass));
    };
    /** A text-style block: rename/delete header + one row per prop. */
    /** One row of a design-role section: editable label + value (+ preview). */
    const renderRoleRow = (role, token) => (_jsxs("div", { className: styles.tokenRow, "data-token-row": true, children: [_jsx("input", { type: "text", className: styles.tokenName, defaultValue: token.label, "aria-label": `${ROLE_LABEL[role]} token name for ${token.label}`, onBlur: (e) => handleRenameRoleToken(role, token.name, e.target.value), onKeyDown: (e) => {
                    if (e.key === 'Enter')
                        e.currentTarget.blur();
                } }, `name:${token.name}`), role === 'radius' && (_jsx("span", { className: styles.radiusPreview, style: { borderRadius: token.value }, "aria-hidden": true })), _jsx("input", { type: "text", className: role === 'shadow' ? styles.shadowValue : styles.tokenValue, defaultValue: token.value, "aria-label": `${token.label} value`, onBlur: (e) => handleRoleTokenValue(token.name, e.target.value), onKeyDown: (e) => {
                    if (e.key === 'Enter')
                        e.currentTarget.blur();
                } }, `val:${token.value}`), _jsx(Tooltip, { label: "Delete token", children: _jsx("button", { className: styles.tokenDelete, onClick: () => handleDeleteRoleToken(token.name), type: "button", children: "x" }) })] }, token.name));
    /** A design-role section (Spacing / Border widths / Radius / Shadows). */
    const renderRoleSection = (role) => {
        const roleTokens = tokensForRole(role, localTokens);
        return (_jsxs("section", { className: styles.section, "data-theme-section": role, children: [_jsx("h3", { className: styles.sectionTitle, children: ROLE_LABEL[role] }), roleTokens.length === 0 ? (_jsxs("div", { className: styles.empty, children: [_jsxs("div", { children: ["No ", ROLE_LABEL[role].toLowerCase(), " tokens yet."] }), _jsxs("button", { className: styles.addButton, onClick: () => handleAddDefaultRole(role), type: "button", "data-testid": `add-default-${role}`, children: ["+ Add default ", ROLE_LABEL[role].toLowerCase()] })] })) : (roleTokens.map((t) => renderRoleRow(role, t))), _jsxs("button", { className: styles.addButton, onClick: () => handleAddRoleToken(role), type: "button", "data-testid": `add-${role}`, children: ["+ Add ", role, " token"] })] }, role));
    };
    const renderTypographyRow = (index, token, category) => {
        const isFontFamily = category === 'fontFamily';
        const badgeOpen = badgeMenuFor?.index === index;
        const handleBadgeClick = (e) => {
            if (badgeOpen) {
                setBadgeMenuFor(null);
                return;
            }
            const r = e.currentTarget.getBoundingClientRect();
            setBadgeMenuFor({
                index,
                anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
            });
        };
        return (_jsxs("div", { className: styles.tokenRow, "data-token-row": true, children: [_jsx("input", { type: "text", className: styles.tokenName, value: token.name, onChange: (e) => handleNameChange(index, e.target.value), onBlur: () => handleNameBlur(index), onKeyDown: (e) => {
                        if (e.key === 'Enter')
                            e.currentTarget.blur();
                    } }), _jsx("div", { className: styles.tokenValueCell, children: isFontFamily ? (_jsx(FontPicker, { value: token.value, fonts: allFonts, onChange: (v) => handleFontFamilyChange(index, v), title: "Font family" })) : (_jsx("input", { type: "text", className: styles.tokenValue, value: token.value, onChange: (e) => handleValueChange(index, e.target.value), onBlur: () => commitValue(index), onKeyDown: (e) => {
                            if (e.key === 'Enter')
                                e.currentTarget.blur();
                        }, placeholder: "value" })) }), _jsx("div", { className: styles.badgeWrap, children: _jsx(Tooltip, { label: "Change token type", children: _jsxs("button", { type: "button", className: `${styles.tokenBadge} ${styles.tokenBadgeButton}`, onClick: handleBadgeClick, "aria-haspopup": "menu", "aria-expanded": badgeOpen, children: [categoryBadge(category), " ", _jsx("span", { children: "\u25BE" })] }) }) }), _jsx(Tooltip, { label: "Delete token", children: _jsx("button", { className: styles.tokenDelete, onClick: () => handleDeleteRequest(index), type: "button", children: "x" }) })] }, index));
    };
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: styles.editor, "data-testid": "theme-panel", children: isLegacy ? (_jsx("div", { className: styles.legacyNotice, children: "Theme editing needs the Next.js project format. Migrate this project (using the banner above the canvas) to edit its design system." })) : (_jsxs("div", { ref: editorRef, className: styles.scroll, children: [error && _jsx("div", { className: styles.error, children: error }), pendingDelete && (_jsxs("div", { className: styles.warning, children: [_jsx("strong", { children: pendingDelete.name }), " is used by", ' ', pendingDelete.usageCount, " element", pendingDelete.usageCount > 1 ? 's' : '', ". Delete anyway?", _jsxs("div", { className: styles.warningActions, children: [_jsx(Button, { variant: "secondary", size: "sm", onClick: () => setPendingDelete(null), children: "Cancel" }), _jsx(Button, { variant: "destructive", size: "sm", onClick: () => confirmDelete(pendingDelete.index), children: "Delete" })] })] })), pendingPaletteDelete && (_jsxs("div", { className: styles.warning, children: [_jsx("strong", { children: pendingPaletteDelete.palette.name }), " is referenced by ", pendingPaletteDelete.refCount, " semantic token", pendingPaletteDelete.refCount > 1 ? 's' : '', ", which will break. Delete anyway?", _jsxs("div", { className: styles.warningActions, children: [_jsx(Button, { variant: "secondary", size: "sm", onClick: () => setPendingPaletteDelete(null), children: "Cancel" }), _jsx(Button, { variant: "destructive", size: "sm", onClick: () => confirmDeletePalette(pendingPaletteDelete.palette), children: "Delete" })] })] })), pendingTextStyleDelete && (_jsxs("div", { className: styles.warning, children: [_jsx("strong", { children: pendingTextStyleDelete.style.label }), " is used by", ' ', pendingTextStyleDelete.usageCount, " element", pendingTextStyleDelete.usageCount > 1 ? 's' : '', ". Delete anyway?", _jsxs("div", { className: styles.warningActions, children: [_jsx(Button, { variant: "secondary", size: "sm", onClick: () => setPendingTextStyleDelete(null), children: "Cancel" }), _jsx(Button, { variant: "destructive", size: "sm", onClick: () => confirmDeleteTextStyle(pendingTextStyleDelete.style), children: "Delete" })] })] })), _jsxs("section", { className: styles.section, "data-theme-section": "colors", children: [_jsx("h3", { className: styles.sectionTitle, children: "Colors" }), _jsx("h4", { className: styles.subheading, children: "Primitives" }), colorModel.palettes.length === 0 && (_jsx("div", { className: styles.empty, children: "No palettes yet." })), colorModel.palettes.map(renderPaletteBlock), _jsx("button", { className: styles.addButton, onClick: handleAddPalette, type: "button", children: "+ Add palette" }), _jsx("h4", { className: styles.subheading, children: "Semantic" }), _jsx("div", { className: styles.themeHint, children: "Semantic tokens map to primitives per theme. Define the token set once on Light; add a theme to give each token a different value. Preview a theme from the canvas toolbar." }), _jsxs("div", { className: styles.themeBlock, "data-theme-block": "light", children: [_jsx("div", { className: styles.themeBlockHeader, children: _jsx("span", { className: styles.themeBlockName, children: "Light" }) }), colorModel.semantic.length === 0 && (_jsx("div", { className: styles.empty, children: "No semantic colors yet." })), colorModel.semantic.map((sem) => renderSemanticRow(sem, '', null)), _jsx("button", { className: styles.addButton, onClick: handleAddSemantic, type: "button", children: "+ Add semantic color" })] }), localOverrides.map(renderThemeBlock), _jsx("button", { className: styles.addButton, onClick: handleAddTheme, type: "button", "data-testid": "add-theme", children: "+ Add theme" }), otherColorIndices.length > 0 && (_jsxs(_Fragment, { children: [_jsx("h4", { className: styles.subheading, children: "Other" }), otherColorIndices.map((i) => {
                                            const token = localTokens[i];
                                            return token ? renderColorRow(i, token) : null;
                                        })] }))] }), _jsxs("section", { className: styles.section, "data-theme-section": "typography", children: [_jsx("h3", { className: styles.sectionTitle, children: "Typography" }), _jsx("h4", { className: styles.subheading, children: "Fonts" }), _jsx(FontsSection, { projectPath: projectPath }), _jsx("h4", { className: styles.subheading, children: "Font families" }), grouped.typography.filter((i) => categories[i] === 'fontFamily')
                                    .length === 0 && (_jsx("div", { className: styles.empty, children: "No font family tokens yet." })), grouped.typography
                                    .filter((i) => categories[i] === 'fontFamily')
                                    .map((i) => {
                                    const token = localTokens[i];
                                    if (!token)
                                        return null;
                                    return renderTypographyRow(i, token, 'fontFamily');
                                }), _jsx("h4", { className: styles.subheading, children: "Type scale" }), grouped.typography.filter((i) => categories[i] !== 'fontFamily')
                                    .length === 0 && (_jsx("div", { className: styles.empty, children: "No type-scale tokens yet." })), grouped.typography
                                    .filter((i) => categories[i] !== 'fontFamily')
                                    .map((i) => {
                                    const token = localTokens[i];
                                    if (!token)
                                        return null;
                                    return renderTypographyRow(i, token, categories[i] ?? 'unknown');
                                }), _jsx("button", { className: styles.addButton, onClick: () => handleAddToken('typography'), type: "button", children: "+ Add typography token" }), _jsx("h4", { className: styles.subheading, children: "Text styles" }), _jsx("div", { className: styles.themeHint, children: "A text style groups font family, size, weight, and line height under one name (H1, Body\u2026). Apply a whole style to an element from the Typography panel\u2019s \u201CText style\u201D dropdown." }), textStyles.length === 0 ? (_jsxs("div", { className: styles.empty, children: [_jsx("div", { children: "No text styles yet." }), _jsx("button", { className: styles.addButton, onClick: handleAddDefaultTextStyles, type: "button", "data-testid": "add-default-text-styles", children: "+ Add default text styles" })] })) : (textStyles.map((s) => (_jsx(TextStyleRow, { style: s, tokens: localTokens, allFonts: allFonts, onProp: (prop, value) => handleTextStyleProp(s.name, prop, value), onRename: (newName) => handleRenameTextStyle(s.name, newName), onDelete: () => handleDeleteTextStyleRequest(s) }, s.name)))), _jsx("button", { className: styles.addButton, onClick: handleAddTextStyle, type: "button", "data-testid": "add-text-style", children: "+ Add text style" })] }), renderRoleSection('spacing'), renderRoleSection('border'), renderRoleSection('radius'), renderRoleSection('shadow'), _jsx(DesignDocSection, {}), grouped.unknown.length > 0 && (_jsxs("section", { className: styles.section, "data-theme-section": "unknown", children: [_jsx("h3", { className: styles.sectionTitle, children: "Unknown" }), grouped.unknown.map((i) => {
                                    const token = localTokens[i];
                                    if (!token)
                                        return null;
                                    return renderTypographyRow(i, token, categories[i] ?? 'unknown');
                                })] }))] })) }), badgeMenuFor !== null &&
                createPortal(_jsxs(_Fragment, { children: [_jsx("div", { className: styles.badgeMenuBackdrop, onMouseDown: closeBadgeMenu }), _jsx("div", { className: styles.badgeMenu, role: "menu", style: {
                                top: badgeMenuFor.anchor.bottom + 4,
                                left: badgeMenuFor.anchor.right - 100,
                            }, children: TYPOGRAPHY_CATEGORY_OPTIONS.map((opt) => {
                                const targetCategory = classifyToken(localTokens[badgeMenuFor.index]?.value ?? '');
                                return (_jsx("button", { type: "button", role: "menuitem", className: `${styles.badgeMenuItem} ${targetCategory === opt.value ? styles.badgeMenuItemActive : ''}`, onClick: () => handleChangeCategory(badgeMenuFor.index, opt.value), children: opt.label }, opt.value));
                            }) })] }), document.body)] }));
};
