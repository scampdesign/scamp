import { useEffect } from 'react';
import { errorMessage } from '@shared/errorMessage';
import { viewSlugFor } from '@shared/templates';
import { generateCode } from '@lib/generateCode';
import { applyBreakpointCaptures, reduceCapture } from '@lib/importReduce';
import { fontsNeededBy, googleFontsUrlFor, resolveFonts, } from '@lib/importFonts';
import { buildReport } from '@lib/importReport';
import { needsFileTreatment, svgAssetName, svgDocument, } from '@lib/importSvgAssets';
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
                    // Literal colours, not tokens.
                    //
                    // This used to lift repeated colours into theme tokens so a
                    // view referenced `var(--color-accent)` rather than the same
                    // value forty times. It is deliberately gone: a design system
                    // is a set of decisions about what SHOULD be shared, and an
                    // importer counting occurrences cannot make those. Guessing
                    // them produced a theme nobody chose and, when two sites were
                    // imported into one project, a view painted in the other
                    // site's palette.
                    //
                    // An import is now a faithful snapshot in literal values, and
                    // turning any of them into tokens is the user's call, made
                    // afterwards against a design they can see.
                    // see docs/notes/import-token-collisions.md
                    // An SVG that works by internal reference — a gradient, a
                    // filter, a mask — cannot survive being inlined. The markup
                    // goes through JSX for the TSX and back through HTML for the
                    // canvas, and an HTML parser lowercases `stopColor` to
                    // `stopcolor`, which means nothing: gainwix's wordmark lost
                    // its gradient and rendered black on both the canvas AND the
                    // export. Those are written out as .svg files and referenced
                    // as images, where the real SVG parser reads them.
                    //
                    // Plain icons stay inline on purpose: an `<img>` cannot
                    // inherit `currentColor`, so turning all of them into files
                    // would freeze every icon that follows the colour around it.
                    // see docs/notes/import-svg-as-file.md
                    const svgSources = new Map();
                    const collectSvgs = (node) => {
                        if (node.svgSource !== undefined && needsFileTreatment(node.svgSource)) {
                            svgSources.set(String(node.id), { attrs: node.attrs, inner: node.svgSource });
                        }
                        node.children.forEach(collectSvgs);
                    };
                    collectSvgs(payload.root);
                    let elements = reduced.elements;
                    let svgFiles = 0;
                    const svgFailures = [];
                    for (const [elementId, element] of Object.entries(elements)) {
                        const sourceId = reduced.sourceNodes[elementId];
                        const captured = sourceId === undefined ? undefined : svgSources.get(String(sourceId));
                        if (captured === undefined)
                            continue;
                        const document = svgDocument(captured.attrs, captured.inner);
                        const written = await window.scamp.fetchImportImage({
                            url: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(document)))}`,
                            projectPath: project.path,
                            assetName: svgAssetName(captured.inner, element.name ?? 'icon'),
                        });
                        if (!written.ok) {
                            svgFailures.push(written.error ?? 'unknown');
                            continue;
                        }
                        // An image, not an svg: the file is the artwork now, and
                        // leaving `svgSource` behind would render it twice.
                        // `svgSource` is dropped, not nulled: leaving it would
                        // render the artwork twice, once as markup and once as the
                        // file.
                        const { svgSource: _dropped, ...rest } = element;
                        elements = {
                            ...elements,
                            [elementId]: {
                                ...rest,
                                type: 'image',
                                tag: 'img',
                                src: written.relativePath,
                            },
                        };
                        svgFiles += 1;
                    }
                    const result = { ...reduced, elements };
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
                    note('svg-as-file', `${svgFiles} ${svgFiles === 1 ? 'icon uses' : 'icons use'} a gradient, filter or mask and ${svgFiles === 1 ? 'was' : 'were'} saved as .svg files`, svgFiles, 'rendered-fallback');
                    note('svg-file-failed', `${svgFailures.length} ${svgFailures.length === 1 ? 'icon' : 'icons'} could not be saved (${svgFailures[0] ?? ''})`, svgFailures.length, 'lost');
                    // A missing image is graded by how much of the page it was.
                    // A hero that failed to fetch is a visibly broken page; a
                    // decorative icon is not, and grading them the same is how a
                    // real break gets buried. see docs/agent-native-review.md
                    const failedBig = failedAssets.filter((a) => a.big).length;
                    const failedSmall = failedAssets.length - failedBig;
                    note('image-failed-large', `${failedBig} large ${failedBig === 1 ? 'image' : 'images'} could not be fetched — the page will look broken where ${failedBig === 1 ? 'it was' : 'they were'} (${failedAssets.find((a) => a.big)?.label ?? ''})`, failedBig, 'lost');
                    note('image-failed', `${failedSmall} smaller ${failedSmall === 1 ? 'image' : 'images'} could not be fetched (${failedAssets.find((a) => !a.big)?.label ?? ''})`, failedSmall, 'approximated');
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
