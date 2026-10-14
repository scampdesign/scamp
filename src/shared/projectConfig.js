import { DEFAULT_BREAKPOINTS, DEFAULT_PROJECT_CONFIG, DESKTOP_BREAKPOINT_ID, MAX_CANVAS_WIDTH, MAX_COMPONENT_CANVAS_DIM, MIN_CANVAS_WIDTH, MIN_COMPONENT_CANVAS_DIM, } from './types';
/**
 * The scampjs contract versions this build of the app can read and write.
 * Read against `scampjs.contract` in a project's installed
 * `node_modules/scampjs/package.json` on open; outside the range the app
 * shows a banner instead of guessing at a shape it doesn't know.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md
 */
export const SUPPORTED_CONTRACT = { min: 0, max: 2 };
/**
 * The contract version the generator writes into a NEW file's `_scamp`
 * export. A file that declares another version inside the range keeps
 * it across saves: the parser records it on the root element, and the
 * generator writes it back. Contract 1 added the CLI, not a file shape,
 * so a contract-0 file is byte-identical under either number.
 */
export const WRITTEN_CONTRACT = SUPPORTED_CONTRACT.max;
export const isSupportedContract = (contract) => typeof contract === 'number' &&
    Number.isInteger(contract) &&
    contract >= SUPPORTED_CONTRACT.min &&
    contract <= SUPPORTED_CONTRACT.max;
const isValidColor = (value) => typeof value === 'string' && value.length > 0 && !/[\n\r\t]/.test(value);
/** Clamp a raw canvasWidth candidate to the supported range. */
export const clampCanvasWidth = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_PROJECT_CONFIG.canvasWidth;
    }
    return Math.round(Math.max(MIN_CANVAS_WIDTH, Math.min(MAX_CANVAS_WIDTH, value)));
};
/**
 * Validate a raw breakpoints array candidate. Bad entries are dropped
 * (not corrected); if the result has no desktop breakpoint, the
 * entire field falls back to defaults so downstream code always has
 * a valid base breakpoint to anchor to.
 */
export const parseBreakpoints = (value) => {
    if (!Array.isArray(value))
        return [...DEFAULT_BREAKPOINTS];
    const seenIds = new Set();
    const result = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object')
            continue;
        const o = entry;
        const id = o['id'];
        const label = o['label'];
        const width = o['width'];
        if (typeof id !== 'string' || id.length === 0)
            continue;
        if (typeof label !== 'string' || label.length === 0)
            continue;
        if (typeof width !== 'number' || !Number.isFinite(width))
            continue;
        if (seenIds.has(id))
            continue;
        seenIds.add(id);
        result.push({
            id,
            label,
            width: Math.round(Math.max(MIN_CANVAS_WIDTH, Math.min(MAX_CANVAS_WIDTH, width))),
        });
    }
    // A project must always have a desktop breakpoint — it's the base
    // that every other breakpoint's @media cascade falls through to.
    if (!seenIds.has(DESKTOP_BREAKPOINT_ID))
        return [...DEFAULT_BREAKPOINTS];
    // Sort widest first so render / emit order is consistent.
    result.sort((a, b) => b.width - a.width);
    return result;
};
/**
 * Validate the `componentCanvas` map. Each value must be a
 * `{ width, height }` pair with finite numbers in the
 * `MIN_CANVAS_WIDTH`–`MAX_CANVAS_WIDTH` range; bad entries are
 * dropped silently so a partially-broken map still opens. Returns
 * undefined when the input is absent or fully invalid, so the
 * field round-trips text-stable for projects that haven't used the
 * feature.
 */
export const parseComponentCanvas = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const out = {};
    for (const [name, entry] of Object.entries(value)) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            continue;
        const o = entry;
        const width = o['width'];
        const height = o['height'];
        if (typeof width !== 'number' || !Number.isFinite(width))
            continue;
        if (typeof height !== 'number' || !Number.isFinite(height))
            continue;
        out[name] = {
            width: Math.round(Math.max(MIN_COMPONENT_CANVAS_DIM, Math.min(MAX_COMPONENT_CANVAS_DIM, width))),
            height: Math.round(Math.max(MIN_COMPONENT_CANVAS_DIM, Math.min(MAX_COMPONENT_CANVAS_DIM, height))),
        };
    }
    return Object.keys(out).length > 0 ? out : undefined;
};
/**
 * Validate the per-breakpoint clip map. Keeps only entries whose value is
 * `true` (an absent/false key already means "don't clip"), so the stored
 * object stays minimal and round-trips text-stable. Returns undefined when
 * empty so projects that never touched clip don't grow a `{}`.
 */
export const parseClipByBreakpoint = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const out = {};
    for (const [id, v] of Object.entries(value)) {
        if (v === true)
            out[id] = true;
    }
    return Object.keys(out).length > 0 ? out : undefined;
};
/** Legacy → per-breakpoint clip: a legacy `true` seeds the desktop key. */
export const seedClipFromLegacy = (legacy) => legacy ? { [DESKTOP_BREAKPOINT_ID]: true } : undefined;
/**
 * Resolve the effective page-canvas clip state for a breakpoint. Reads the
 * per-breakpoint map; a missing entry means "don't clip".
 */
export const resolveClip = (config, breakpointId) => config.canvasClipByBreakpoint?.[breakpointId] ?? false;
/** Clamp a raw canvasHeight candidate to the supported range. */
export const clampCanvasHeight = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_PROJECT_CONFIG.canvasWidth;
    }
    return Math.round(Math.max(MIN_CANVAS_WIDTH, Math.min(MAX_CANVAS_WIDTH, value)));
};
/**
 * Parse a raw `scamp.config.json` string into a validated `ProjectConfig`.
 * Every missing or malformed field falls back to the default so a file
 * someone hand-edited to nonsense still opens, just without the bad
 * overrides. Mirrors the forgiving pattern in `settings.ts`.
 */
export const parseProjectConfig = (raw) => {
    if (raw === null)
        return { ...DEFAULT_PROJECT_CONFIG };
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return { ...DEFAULT_PROJECT_CONFIG };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ...DEFAULT_PROJECT_CONFIG };
    }
    const obj = parsed;
    const artboard = obj['artboardBackground'];
    const canvasWidth = clampCanvasWidth(obj['canvasWidth']);
    const canvasOverflowHidden = typeof obj['canvasOverflowHidden'] === 'boolean'
        ? obj['canvasOverflowHidden']
        : DEFAULT_PROJECT_CONFIG.canvasOverflowHidden;
    const canvasMigrationAcknowledged = obj['canvasMigrationAcknowledged'] === true ? true : undefined;
    const nextjsMigrationDismissed = obj['nextjsMigrationDismissed'] === true ? true : undefined;
    const scampMigrationDismissed = obj['scampMigrationDismissed'] === true ? true : undefined;
    // Auto-save snapshots default on; only persist an explicit disable.
    const snapshotAutoSave = obj['snapshotAutoSave'] === false ? false : undefined;
    const breakpoints = obj['breakpoints'] === undefined
        ? [...DEFAULT_BREAKPOINTS]
        : parseBreakpoints(obj['breakpoints']);
    const componentCanvas = parseComponentCanvas(obj['componentCanvas']);
    const pageLayout = parsePageLayout(obj['pageLayout']);
    // Prefer the explicit per-breakpoint map; otherwise migrate a legacy
    // `canvasOverflowHidden: true` into a desktop-keyed entry so existing
    // projects don't lose the setting.
    const canvasClipByBreakpoint = parseClipByBreakpoint(obj['canvasClipByBreakpoint']) ??
        seedClipFromLegacy(canvasOverflowHidden);
    const canvasFixedHeight = obj['canvasFixedHeight'] === true ? true : undefined;
    const canvasHeight = obj['canvasHeight'] !== undefined
        ? clampCanvasHeight(obj['canvasHeight'])
        : undefined;
    const cardBackground = obj['cardBackground'];
    // Free-text status — trimmed and length-capped so a card badge stays sane.
    const stateRaw = obj['state'];
    const state = typeof stateRaw === 'string' && stateRaw.trim().length > 0
        ? stateRaw.trim().slice(0, 40)
        : undefined;
    return {
        artboardBackground: isValidColor(artboard)
            ? artboard
            : DEFAULT_PROJECT_CONFIG.artboardBackground,
        canvasWidth,
        canvasOverflowHidden,
        breakpoints,
        ...(canvasClipByBreakpoint ? { canvasClipByBreakpoint } : {}),
        ...(canvasFixedHeight ? { canvasFixedHeight: true } : {}),
        ...(canvasHeight !== undefined ? { canvasHeight } : {}),
        ...(canvasMigrationAcknowledged ? { canvasMigrationAcknowledged: true } : {}),
        ...(nextjsMigrationDismissed ? { nextjsMigrationDismissed: true } : {}),
        ...(scampMigrationDismissed ? { scampMigrationDismissed: true } : {}),
        ...(snapshotAutoSave === false ? { snapshotAutoSave: false } : {}),
        ...(componentCanvas ? { componentCanvas } : {}),
        ...(pageLayout ? { pageLayout } : {}),
        ...(isValidColor(cardBackground) ? { cardBackground } : {}),
        ...(state ? { state } : {}),
    };
};
/**
 * Read `pageLayout`, keeping what's well-formed: a slug or group name
 * appears once (first wins), and anything else is dropped rather than
 * failing the whole config.
 */
export const parsePageLayout = (raw) => {
    if (!Array.isArray(raw))
        return undefined;
    const seen = new Set();
    const groups = new Set();
    /** The slug, the first time it's seen; otherwise null. */
    const claim = (slug) => {
        if (typeof slug !== 'string' || slug.length === 0 || seen.has(slug))
            return null;
        seen.add(slug);
        return slug;
    };
    const out = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object')
            continue;
        const e = entry;
        const group = e['group'];
        if ('page' in e) {
            const page = claim(e['page']);
            if (page !== null)
                out.push({ page });
        }
        else if (typeof group === 'string' && group.trim().length > 0 && !groups.has(group)) {
            groups.add(group);
            const pages = [];
            for (const slug of Array.isArray(e['pages']) ? e['pages'] : []) {
                const page = claim(slug);
                if (page !== null)
                    pages.push(page);
            }
            out.push({ group, pages });
        }
    }
    return out;
};
/** Serialize a `ProjectConfig` to its on-disk JSON form. */
export const serializeProjectConfig = (config) => {
    return JSON.stringify(config, null, 2) + '\n';
};
