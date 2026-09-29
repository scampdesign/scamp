import { useEffect } from 'react';
import { errorMessage } from '@shared/errorMessage';
import { viewSlugFor } from '@shared/templates';
import { generateCode } from '@lib/generateCode';
import { applyBreakpointCaptures, reduceCapture } from '@lib/importReduce';
import { fontsNeededBy, googleFontsUrlFor, resolveFonts, } from '@lib/importFonts';
import { buildReport } from '@lib/importReport';
import { extractTokens } from '@lib/importTokens';
import { useFontsStore } from '@store/fontsSlice';
import { parseThemeFile, serializeThemeFile } from '@lib/parseTheme';
import { useAppLogStore } from '@store/appLogSlice';
/**
 * A view name the project doesn't already use. An import should never
 * silently land on top of existing work.
 */
const freeViewName = (base, taken) => {
    if (!taken.has(base))
        return base;
    for (let n = 2; n < 1000; n += 1) {
        const candidate = `${base}${n}`;
        if (!taken.has(candidate))
            return candidate;
    }
    return `${base}${Date.now()}`;
};
export const useWebsiteImport = ({ project, breakpoints, onProjectChange, openView, }) => {
    useEffect(() => {
        return window.scamp.onImportDeliver(({ projectPath, payload, narrower }) => {
            void (async () => {
                const log = useAppLogStore.getState().log;
                const report = (p) => {
                    void window.scamp.reportImportResult(p);
                };
                if (projectPath !== project.path) {
                    report({
                        projectPath,
                        ok: false,
                        error: 'That import was for a different project.',
                    });
                    return;
                }
                try {
                    // The narrower readings become @media overrides. Folded in
                    // before anything else so tokens and fonts see the whole
                    // design rather than only its widest form.
                    const reduced = applyBreakpointCaptures(reduceCapture(payload), (narrower ?? []).map((n) => ({
                        breakpointId: n.breakpointId,
                        payload: n.payload,
                    })));
                    // Lift repeated colours into theme tokens before generating,
                    // so the view references `var(--color-accent)` rather than the
                    // same literal forty times. Without this an import is a
                    // snapshot: correct, and unchangeable from the theme panel.
                    const themeCss = await window.scamp.readTheme({ projectPath: project.path });
                    const parsedTheme = parseThemeFile(themeCss);
                    const existing = new Map(parsedTheme.tokens.map((t) => [t.name, t.value]));
                    const { tokens, elements } = extractTokens(reduced.elements);
                    // A name the project already uses means something else here;
                    // suffix rather than redefine someone's token.
                    //
                    // Unless it means the SAME thing. Importing a site twice
                    // generates the same names for the same colours, and
                    // comparing only names wrote `--color-1-imported` beside the
                    // identical `--color-1` already there — a second palette
                    // nothing referenced. A token whose value already matches is
                    // the one that was wanted, so it is reused.
                    const renamed = tokens.map((t) => {
                        const held = existing.get(t.name);
                        if (held === undefined || held === t.value)
                            return t;
                        return { ...t, name: `${t.name}-imported` };
                    });
                    const byOld = new Map(tokens.map((t, i) => [t.name, renamed[i]?.name ?? t.name]));
                    const themed = Object.fromEntries(Object.entries(elements).map(([id, el]) => {
                        let next = el;
                        for (const field of ['color', 'backgroundColor', 'borderColor']) {
                            const value = next[field];
                            if (typeof value !== 'string' || !value.startsWith('var('))
                                continue;
                            const name = value.slice(4, -1);
                            const mapped = byOld.get(name);
                            if (mapped && mapped !== name)
                                next = { ...next, [field]: `var(${mapped})` };
                        }
                        return [id, next];
                    }));
                    const result = { ...reduced, elements: themed };
                    // Only what the theme does not already hold. A reused token is
                    // referenced by the view and declared once, where it was.
                    const added = renamed.filter((t) => !existing.has(t.name));
                    if (added.length > 0) {
                        await window.scamp.writeTheme({
                            projectPath: project.path,
                            content: serializeThemeFile({
                                ...parsedTheme,
                                tokens: [
                                    ...parsedTheme.tokens,
                                    ...added.map((t) => ({ name: t.name, value: t.value })),
                                ],
                            }, themeCss),
                        });
                    }
                    const taken = new Set([
                        ...project.components.map((c) => c.name),
                        ...project.pages.map((p) => p.name),
                    ]);
                    const name = freeViewName(result.suggestedName, taken);
                    const { tsx, css } = generateCode({
                        elements: result.elements,
                        rootId: result.rootId,
                        pageName: name,
                        cssModuleImportName: name,
                        isComponent: true,
                        breakpoints,
                    });
                    // A view, not a page: a framework project has no pages, and in
                    // a Next.js one a view is still the shape an import should
                    // take. `createComponent` writes the files and the wrapper or
                    // route in one call, so there is no window where a half-made
                    // view exists on disk.
                    const created = await window.scamp.createComponent({
                        projectPath: project.path,
                        componentName: name,
                        kind: 'view',
                        wrapperSlug: viewSlugFor(name),
                        tsxContent: tsx,
                        cssContent: css,
                    });
                    onProjectChange?.((prev) => ({
                        ...prev,
                        components: prev.components.some((c) => c.name === created.name)
                            ? prev.components
                            : [...prev.components, created],
                    }));
                    openView(created.name);
                    // Keep the page exactly as it was, next to what it became.
                    // Best-effort and after the view exists: a full temp
                    // directory must not cost anyone an import that worked.
                    // see docs/notes/import-source-store.md
                    const source = payload.source;
                    if (source !== undefined) {
                        void window.scamp.saveImportSource({
                            projectPath: project.path,
                            view: created.name,
                            url: payload.url,
                            source,
                        });
                    }
                    // Images: downloaded after the view exists, so a slow or dead
                    // host delays pictures rather than the whole import. Each
                    // failure is reported and the rest carry on.
                    const assets = payload.assets.filter((a) => a.kind === 'image');
                    const downloaded = new Map();
                    const failedAssets = [];
                    // How much of the page an image occupied, so a failed fetch can
                    // be graded by what it costs. A hero that did not arrive is a
                    // visibly broken page; a 16px icon is not.
                    //
                    // Read off the element model rather than the capture, which
                    // carries rects only for the fidelity harness. A size the
                    // reducer replaced with `fill` is not a number here and counts
                    // as small — under-reporting, which is the safe direction for a
                    // grade that opens the report.
                    const areaOf = (url) => {
                        let biggest = 0;
                        for (const el of Object.values(result.elements)) {
                            const refs = el.src === url ||
                                (typeof el.customProperties?.['background-image'] === 'string' &&
                                    el.customProperties['background-image'].includes(url));
                            if (!refs)
                                continue;
                            // Only a fixed size is a real measurement. `fill` and the
                            // rest are relative to a parent this cannot resolve here.
                            if (el.widthMode !== 'fixed' || el.heightMode !== 'fixed')
                                continue;
                            biggest = Math.max(biggest, el.widthValue * el.heightValue);
                        }
                        return biggest;
                    };
                    /** 200x200. Big enough that its absence is the first thing you see. */
                    const BIG_IMAGE_AREA = 40_000;
                    for (const asset of assets) {
                        if (downloaded.has(asset.url) || !/^https?:/.test(asset.url))
                            continue;
                        const got = await window.scamp.fetchImportImage({
                            url: asset.url,
                            projectPath: project.path,
                        });
                        if (got.ok)
                            downloaded.set(asset.url, got.relativePath);
                        else {
                            failedAssets.push({
                                label: `${new URL(asset.url).pathname.split('/').pop()}: ${got.error}`,
                                big: areaOf(asset.url) >= BIG_IMAGE_AREA,
                            });
                        }
                    }
                    if (downloaded.size > 0) {
                        const localised = Object.fromEntries(Object.entries(result.elements).map(([id, el]) => {
                            let next = el;
                            const src = next.src;
                            if (typeof src === 'string' && downloaded.has(src)) {
                                next = { ...next, src: downloaded.get(src) };
                            }
                            const bg = next.customProperties?.['background-image'];
                            if (typeof bg === 'string') {
                                for (const [url, local] of downloaded) {
                                    if (!bg.includes(url))
                                        continue;
                                    next = {
                                        ...next,
                                        customProperties: {
                                            ...next.customProperties,
                                            'background-image': bg.split(url).join(local),
                                        },
                                    };
                                    break;
                                }
                            }
                            return [id, next];
                        }));
                        const relocated = generateCode({
                            elements: localised,
                            rootId: result.rootId,
                            pageName: name,
                            cssModuleImportName: name,
                            isComponent: true,
                        });
                        await window.scamp.writeFile({
                            tsxPath: created.tsxPath,
                            cssPath: created.cssPath,
                            tsxContent: relocated.tsx,
                            cssContent: relocated.css,
                        });
                    }
                    // Type is most of a page's character, and an import that
                    // silently falls back to Helvetica looks nothing like what it
                    // copied. Each family needs a different answer, so each one is
                    // asked about separately. see lib/importFonts.ts
                    const needs = fontsNeededBy(result.elements);
                    let fonts = [];
                    if (needs.length > 0) {
                        const { systemFonts, systemFontsLoaded, loadSystemFonts } = useFontsStore.getState();
                        if (!systemFontsLoaded)
                            await loadSystemFonts();
                        const installed = useFontsStore.getState().systemFonts;
                        const unknown = needs
                            .filter((n) => !installed.some((f) => f.toLowerCase() === n.family.toLowerCase()))
                            .map((n) => n.family);
                        const onGoogle = unknown.length > 0
                            ? await window.scamp.resolveImportFonts({ families: unknown })
                            : {};
                        // `false` means Google does not serve it; anything else is
                        // the family's variable axes, which the URL has to name or
                        // Google freezes them at their defaults.
                        // see docs/notes/import-variable-fonts.md
                        const axesByFamily = {};
                        for (const [family, axes] of Object.entries(onGoogle)) {
                            if (axes !== false)
                                axesByFamily[family] = axes;
                        }
                        const urls = {};
                        for (const [family, axes] of Object.entries(onGoogle)) {
                            const url = axes === false ? null : googleFontsUrlFor([family], axesByFamily);
                            if (url !== null)
                                urls[family] = url;
                        }
                        fonts = resolveFonts(needs, systemFonts, urls);
                        // One @import for all of them: the css2 endpoint takes
                        // repeated family params, so the project gains one line
                        // rather than one per face.
                        const embeddable = fonts
                            .filter((f) => f.status === 'google')
                            .map((f) => f.family);
                        const combined = googleFontsUrlFor(embeddable, axesByFamily);
                        if (combined !== null) {
                            const latest = parseThemeFile(await window.scamp.readTheme({ projectPath: project.path }));
                            // Appending blind wrote the same Google Fonts line twice
                            // when a site was imported twice — the second `@import`
                            // fetching exactly what the first already had.
                            if (!latest.fontImportUrls.includes(combined)) {
                                await window.scamp.writeTheme({
                                    projectPath: project.path,
                                    content: serializeThemeFile({
                                        ...latest,
                                        fontImportUrls: [...latest.fontImportUrls, combined],
                                    }),
                                });
                            }
                        }
                    }
                    const missingFonts = fonts.filter((f) => f.status === 'missing');
                    const embedded = fonts.filter((f) => f.status === 'google');
                    // Everything the import changed or could not carry, grouped and
                    // ordered losses-first. see lib/importReport.ts
                    const grouped = buildReport(result.findings);
                    const extras = [];
                    const note = (kind, label, count, fidelity) => {
                        if (count > 0)
                            extras.push({ kind, label, count, examples: [], fidelity });
                    };
                    note('font-embedded', `${embedded.map((f) => f.family).join(', ')} embedded from Google Fonts`, embedded.length, 'exact');
                    note('font-missing', `install ${missingFonts.map((f) => f.family).join(', ')} — not on Google Fonts and not on this machine`, missingFonts.length, 'lost');
                    note('image-downloaded', `${downloaded.size} images downloaded into the project`, downloaded.size, 'exact');
                    // A missing image is graded by how much of the page it was.
                    // A hero that failed to fetch is a visibly broken page; a
                    // decorative icon is not, and grading them the same is how a
                    // real break gets buried. see docs/agent-native-review.md
                    const failedBig = failedAssets.filter((a) => a.big).length;
                    const failedSmall = failedAssets.length - failedBig;
                    note('image-failed-large', `${failedBig} large ${failedBig === 1 ? 'image' : 'images'} could not be fetched — the page will look broken where ${failedBig === 1 ? 'it was' : 'they were'} (${failedAssets.find((a) => a.big)?.label ?? ''})`, failedBig, 'lost');
                    note('image-failed', `${failedSmall} smaller ${failedSmall === 1 ? 'image' : 'images'} could not be fetched (${failedAssets.find((a) => !a.big)?.label ?? ''})`, failedSmall, 'approximated');
                    note('token', `${renamed.length} repeated colours lifted into theme tokens`, renamed.length, 'exact');
                    // `buildReport` has already ordered its own groups worst-first;
                    // the extras are merged at the ends rather than interleaved so
                    // that ordering survives.
                    const bad = (e) => e.fidelity === 'lost' || e.fidelity === 'rendered-fallback';
                    const findings = [
                        ...extras.filter(bad),
                        ...grouped,
                        ...extras.filter((e) => !bad(e)),
                    ];
                    log('info', `Imported ${name} from ${payload.url} — ` +
                        `${Object.keys(result.elements).length} elements` +
                        (renamed.length > 0 ? `, ${renamed.length} colour tokens` : '') +
                        (embedded.length > 0 ? `, ${embedded.length} fonts embedded` : '') +
                        (findings.length > 0
                            ? `. ${findings.map((f) => f.label).join('; ')}.`
                            : '.'));
                    report({
                        projectPath,
                        ok: true,
                        viewName: name,
                        elementCount: Object.keys(result.elements).length,
                        findings,
                    });
                }
                catch (err) {
                    const message = errorMessage(err);
                    log('error', `Import failed: ${message}`);
                    report({ projectPath, ok: false, error: message });
                }
            })();
        });
    }, [project, breakpoints, onProjectChange, openView]);
};
