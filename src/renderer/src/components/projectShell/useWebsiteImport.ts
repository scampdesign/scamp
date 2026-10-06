import { useEffect } from 'react';

import { errorMessage } from '@shared/errorMessage';
import type { CapturedNode, CapturePayload, CapturedReact, CapturedReactInstance } from '@shared/importCapture';
import type {
  Breakpoint,
  GoogleFontAxis,
  ImportFidelity,
  ComponentFile,
  ImportBatchReport,
  ImportReportGroup,
  ProjectData,
} from '@shared/types';
import { viewSlugFor } from '@shared/templates';
import { generateCode } from '@lib/generateCode';
import { applyBreakpointCaptures, reduceCapture, type ImportFinding } from '@lib/importReduce';
import {
  fontsNeededBy,
  googleFontsUrlFor,
  resolveFonts,
  type FontResolution,
} from '@lib/importFonts';
import { buildReport } from '@lib/importReport';
import { describeReactFinding, planReactComponents } from '@lib/reactComponents';
import { planRepeats, type PlannedRepeat } from '@lib/reactRepeats';
import { themeFromTokens, tokenizeCapture } from '@lib/appTokens';
import { useCanvasStore } from '@store/canvasSlice';
import { generateElementId } from '@lib/element/tree';
import type { ScampElement } from '@lib/element';
import {
  needsFileTreatment,
  svgAssetName,
  svgDocument,
} from '@lib/importSvgAssets';
import { useFontsStore } from '@store/fontsSlice';
import { parseThemeFile, serializeThemeFile } from '@lib/parseTheme';
import { useAppLogStore } from '@store/appLogSlice';
import { useAgentStore } from '@store/agentSlice';
import { useAuthStore } from '@store/authSlice';

/**
 * The app window's half of website import.
 *
 * The import window captures a page and hands the payload here, because
 * this is where the project is: the reducer, the generator, and the
 * file-writing IPC all live on this side. The importer itself never
 * touches a file.
 *
 * A view is created and filled in two steps rather than one — `+ Add
 * Page`'s own path writes the view and its route, and then the
 * generated markup replaces the scaffold's. Reusing it means an
 * imported view is indistinguishable from a hand-made one, route
 * included.
 * see docs/plans/website-import-plan.md
 */

type Options = {
  project: ProjectData;
  /**
   * The project's breakpoints. `generateCode` emits no `@media` blocks
   * without them, so the overrides the import read would be computed
   * and then silently dropped on the way to disk.
   */
  breakpoints: Breakpoint[];
  onProjectChange?: (update: (prev: ProjectData) => ProjectData) => void;
  /** Opens the freshly-imported view on the canvas. */
  openView: (name: string) => void;
  /** Views an undone multi-page import removed, so the canvas can let go of one that's open. */
  onViewsRemoved?: (names: ReadonlyArray<string>) => void;
};

/** One view a multi-page import made, as the component pass needs it. */
type BatchView = {
  name: string;
  tsxPath: string;
  cssPath: string;
  elements: Record<string, ScampElement>;
  rootId: string;
  react: Record<string, CapturedReact>;
  instances: Record<string, CapturedReactInstance>;
};

/**
 * What each multi-page import made, by batch id: its views, and the
 * components finishing it made. Undo removes exactly these — never
 * anything the import window merely names.
 */
const batches = new Map<string, { views: BatchView[]; components: string[] }>();

/** React's account of each element, by element id, from the capture it came from. */
const reactByElement = (
  payload: CapturePayload,
  sourceNodes: Readonly<Record<string, number>>
): Record<string, CapturedReact> => {
  const byNode = new Map<number, CapturedReact>();
  const walk = (node: CapturedNode): void => {
    if (node.react !== undefined) byNode.set(node.id, node.react);
    node.children.forEach(walk);
  };
  walk(payload.root);
  const out: Record<string, CapturedReact> = {};
  for (const [elementId, nodeId] of Object.entries(sourceNodes)) {
    const react = byNode.get(nodeId);
    if (react !== undefined) out[elementId] = react;
  }
  return out;
};

/**
 * A view name the project doesn't already use. An import should never
 * silently land on top of existing work.
 */
const freeViewName = (base: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${Date.now()}`;
};

export const useWebsiteImport = ({
  project,
  breakpoints,
  onProjectChange,
  openView,
  onViewsRemoved,
}: Options): void => {
  useEffect(() => {
    return window.scamp.onImportDeliver(({ projectPath, payload, narrower, nameHint, batch }) => {
      void (async (): Promise<void> => {
        const log = useAppLogStore.getState().log;
        const report = (p: Parameters<typeof window.scamp.reportImportResult>[0]): void => {
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
          // A React import that keeps the app's tokens: the references go
          // back where the app had them, and the tokens into the theme. Only
          // where the app's own cascade used `var(--name)` — nothing here is
          // inferred from a matching value. see lib/appTokens.ts
          const captured = payload as CapturePayload;
          let base = captured;
          let narrowerPayloads = (narrower ?? []).map((n) => ({
            breakpointId: n.breakpointId,
            payload: n.payload as CapturePayload,
          }));
          let appTokens: { added: string[]; used: number; conflicts: string[] } | null = null;
          if (captured.tokens !== undefined && Object.keys(captured.tokens.values).length > 0) {
            const existingTheme = await window.scamp.readTheme({ projectPath: project.path });
            const merged = themeFromTokens(captured.tokens, parseThemeFile(existingTheme));
            if (merged.added.length > 0) {
              await window.scamp.writeTheme({
                projectPath: project.path,
                content: serializeThemeFile(merged.theme, existingTheme),
              });
              useCanvasStore.getState().setThemeData(merged.theme);
            }
            const skip = new Set(merged.conflicts);
            base = tokenizeCapture(captured, skip);
            narrowerPayloads = narrowerPayloads.map((n) => ({ ...n, payload: tokenizeCapture(n.payload, skip) }));
            appTokens = {
              added: merged.added,
              used: Object.keys(captured.tokens.values).length - merged.conflicts.length,
              conflicts: merged.conflicts,
            };
          }

          const reduced = applyBreakpointCaptures(reduceCapture(base), narrowerPayloads);

          // Literal colours, unless the app's own tokens were asked for (above).
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
          const svgSources = new Map<string, { attrs: Record<string, string>; inner: string }>();
          const collectSvgs = (node: CapturedNode): void => {
            if (node.svgSource !== undefined && needsFileTreatment(node.svgSource)) {
              svgSources.set(String(node.id), { attrs: node.attrs, inner: node.svgSource });
            }
            node.children.forEach(collectSvgs);
          };
          collectSvgs((payload as CapturePayload).root);

          let elements = reduced.elements;
          let svgFiles = 0;
          const svgFailures: string[] = [];
          for (const [elementId, element] of Object.entries(elements)) {
            const sourceId = reduced.sourceNodes[elementId];
            const captured = sourceId === undefined ? undefined : svgSources.get(String(sourceId));
            if (captured === undefined) continue;
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
          // A React route names its view; the hint comes from the least-trusted
          // window, so only a plain PascalCase name is taken.
          const hinted = typeof nameHint === 'string' && /^[A-Z][A-Za-z0-9]{0,63}$/.test(nameHint) ? nameHint : null;
          const name = freeViewName(hinted ?? result.suggestedName, taken);

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
          // A multi-page import opens nothing until it has finished: the
          // component pass may still rewrite every view it made.
          let batchView: BatchView | null = null;
          if (batch !== undefined) {
            batchView = {
              name: created.name,
              tsxPath: created.tsxPath,
              cssPath: created.cssPath,
              elements: result.elements,
              rootId: result.rootId,
              react: reactByElement(payload as CapturePayload, result.sourceNodes),
              instances: (payload as CapturePayload).react?.instances ?? {},
            };
            const record = batches.get(batch.id) ?? { views: [], components: [] };
            record.views.push(batchView);
            batches.set(batch.id, record);
          } else {
            openView(created.name);
          }

          // Keep the page exactly as it was, next to what it became.
          // Best-effort and after the view exists: a full temp
          // directory must not cost anyone an import that worked.
          // see docs/notes/import-source-store.md
          const source = (payload as CapturePayload).source;
          if (source !== undefined) {
            void window.scamp.saveImportSource({
              projectPath: project.path,
              view: created.name,
              url: (payload as CapturePayload).url,
              source,
            });
          }

          // Images: downloaded after the view exists, so a slow or dead
          // host delays pictures rather than the whole import. Each
          // failure is reported and the rest carry on.
          const assets = (payload as CapturePayload).assets.filter((a) => a.kind === 'image');
          const downloaded = new Map<string, string>();
          const failedAssets: Array<{ label: string; big: boolean }> = [];
          // How much of the page an image occupied, so a failed fetch can
          // be graded by what it costs. A hero that did not arrive is a
          // visibly broken page; a 16px icon is not.
          //
          // Read off the element model rather than the capture, which
          // carries rects only for the fidelity harness. A size the
          // reducer replaced with `fill` is not a number here and counts
          // as small — under-reporting, which is the safe direction for a
          // grade that opens the report.
          const areaOf = (url: string): number => {
            let biggest = 0;
            for (const el of Object.values(result.elements)) {
              const refs =
                el.src === url ||
                (typeof el.customProperties?.['background-image'] === 'string' &&
                  el.customProperties['background-image'].includes(url));
              if (!refs) continue;
              // Only a fixed size is a real measurement. `fill` and the
              // rest are relative to a parent this cannot resolve here.
              if (el.widthMode !== 'fixed' || el.heightMode !== 'fixed') continue;
              biggest = Math.max(biggest, el.widthValue * el.heightValue);
            }
            return biggest;
          };
          /** 200x200. Big enough that its absence is the first thing you see. */
          const BIG_IMAGE_AREA = 40_000;
          for (const asset of assets) {
            if (downloaded.has(asset.url) || !/^https?:/.test(asset.url)) continue;
            const got = await window.scamp.fetchImportImage({
              url: asset.url,
              projectPath: project.path,
            });
            if (got.ok) downloaded.set(asset.url, got.relativePath);
            else {
              failedAssets.push({
                label: `${new URL(asset.url).pathname.split('/').pop()}: ${got.error}`,
                big: areaOf(asset.url) >= BIG_IMAGE_AREA,
              });
            }
          }
          if (downloaded.size > 0) {
            const localised = Object.fromEntries(
              Object.entries(result.elements).map(([id, el]) => {
                let next = el;
                const src = next.src;
                if (typeof src === 'string' && downloaded.has(src)) {
                  next = { ...next, src: downloaded.get(src) as string };
                }
                const bg = next.customProperties?.['background-image'];
                if (typeof bg === 'string') {
                  for (const [url, local] of downloaded) {
                    if (!bg.includes(url)) continue;
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
              })
            );
            if (batchView !== null) batchView.elements = localised;
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
          let fonts: FontResolution[] = [];
          if (needs.length > 0) {
            const { systemFonts, systemFontsLoaded, loadSystemFonts } =
              useFontsStore.getState();
            if (!systemFontsLoaded) await loadSystemFonts();
            const installed = useFontsStore.getState().systemFonts;
            const unknown = needs
              .filter((n) => !installed.some((f) => f.toLowerCase() === n.family.toLowerCase()))
              .map((n) => n.family);
            const onGoogle =
              unknown.length > 0
                ? await window.scamp.resolveImportFonts({ families: unknown })
                : {};
            // `false` means Google does not serve it; anything else is
            // the family's variable axes, which the URL has to name or
            // Google freezes them at their defaults.
            // see docs/notes/import-variable-fonts.md
            const axesByFamily: Record<string, GoogleFontAxis[]> = {};
            for (const [family, axes] of Object.entries(onGoogle)) {
              if (axes !== false) axesByFamily[family] = axes;
            }
            const urls: Record<string, string> = {};
            for (const [family, axes] of Object.entries(onGoogle)) {
              const url = axes === false ? null : googleFontsUrlFor([family], axesByFamily);
              if (url !== null) urls[family] = url;
            }
            fonts = resolveFonts(needs, systemFonts, urls);

            // One @import for all of them: the css2 endpoint takes
            // repeated family params, so the project gains one line
            // rather than one per face.
            const embeddable = fonts
              .filter((f): f is Extract<FontResolution, { status: 'google' }> => f.status === 'google')
              .map((f) => f.family);
            const combined = googleFontsUrlFor(embeddable, axesByFamily);
            if (combined !== null) {
              const latest = parseThemeFile(
                await window.scamp.readTheme({ projectPath: project.path })
              );
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
          const extras: ImportReportGroup[] = [];
          const note = (
            kind: string,
            label: string,
            count: number,
            fidelity: ImportFidelity
          ): void => {
            if (count > 0) extras.push({ kind, label, count, examples: [], fidelity });
          };
          if (appTokens !== null) {
            note('app-tokens', `${appTokens.used} of the app’s theme tokens kept where it used them (${appTokens.added.length} new to the project)`, appTokens.used, 'exact');
            note(
              'app-token-conflicts',
              `${appTokens.conflicts.length} of the app’s tokens kept as plain values — the project already has ${appTokens.conflicts.slice(0, 3).join(', ')} with another value`,
              appTokens.conflicts.length,
              'approximated'
            );
          }
          note('font-embedded', `${embedded.map((f) => f.family).join(', ')} embedded from Google Fonts`, embedded.length, 'exact');
          note(
            'font-missing',
            `install ${missingFonts.map((f) => f.family).join(', ')} — not on Google Fonts and not on this machine`,
            missingFonts.length,
            'lost'
          );
          note('image-downloaded', `${downloaded.size} images downloaded into the project`, downloaded.size, 'exact');
          note(
            'svg-as-file',
            `${svgFiles} ${svgFiles === 1 ? 'icon uses' : 'icons use'} a gradient, filter or mask and ${svgFiles === 1 ? 'was' : 'were'} saved as .svg files`,
            svgFiles,
            'rendered-fallback'
          );
          note(
            'svg-file-failed',
            `${svgFailures.length} ${svgFailures.length === 1 ? 'icon' : 'icons'} could not be saved (${svgFailures[0] ?? ''})`,
            svgFailures.length,
            'lost'
          );
          // A missing image is graded by how much of the page it was.
          // A hero that failed to fetch is a visibly broken page; a
          // decorative icon is not, and grading them the same is how a
          // real break gets buried. see docs/agent-native-review.md
          const failedBig = failedAssets.filter((a) => a.big).length;
          const failedSmall = failedAssets.length - failedBig;
          note(
            'image-failed-large',
            `${failedBig} large ${failedBig === 1 ? 'image' : 'images'} could not be fetched — the page will look broken where ${failedBig === 1 ? 'it was' : 'they were'} (${failedAssets.find((a) => a.big)?.label ?? ''})`,
            failedBig,
            'lost'
          );
          note(
            'image-failed',
            `${failedSmall} smaller ${failedSmall === 1 ? 'image' : 'images'} could not be fetched (${failedAssets.find((a) => !a.big)?.label ?? ''})`,
            failedSmall,
            'approximated'
          );
          // `buildReport` has already ordered its own groups worst-first;
          // the extras are merged at the ends rather than interleaved so
          // that ordering survives.
          const bad = (e: ImportReportGroup): boolean =>
            e.fidelity === 'lost' || e.fidelity === 'rendered-fallback';
          const findings = [
            ...extras.filter(bad),
            ...grouped,
            ...extras.filter((e) => !bad(e)),
          ];
          log(
            'info',
            `Imported ${name} from ${(payload as CapturePayload).url} — ` +
              `${Object.keys(result.elements).length} elements` +
              (embedded.length > 0 ? `, ${embedded.length} fonts embedded` : '') +
              (findings.length > 0
                ? `. ${findings.map((f) => f.label).join('; ')}.`
                : '.')
          );
          // The Scamp Agent can clean this up — offered only to a signed-in
          // user with a key connected; anyone else sees nothing of it.
          useAgentStore.getState().recordImport(projectPath, name, findings);
          const keyStatus =
            useAuthStore.getState().status === 'signed-in'
              ? (await window.scamp.agentKeyStatus().catch(() => ({ status: 'not-connected' as const }))).status
              : 'not-connected';
          report({
            projectPath,
            ok: true,
            ...(batch !== undefined ? { batchId: batch.id } : {}),
            viewName: name,
            cleanupAvailable: keyStatus === 'connected' || keyStatus === 'session-only',
            elementCount: Object.keys(result.elements).length,
            findings,
          });
        } catch (err) {
          const message = errorMessage(err);
          log('error', `Import failed: ${message}`);
          report({ projectPath, ok: false, error: message, ...(batch !== undefined ? { batchId: batch.id } : {}) });
        }
      })();
    });
  }, [project, breakpoints, onProjectChange, openView]);

  // Finish or undo a multi-page import, asked by the import window.
  useEffect(
    () =>
      window.scamp.onImportBatchAction(({ projectPath, batchId, action }) => {
        void (async (): Promise<void> => {
          if (projectPath !== project.path) return;
          const record = batches.get(batchId);
          const send = (payload: ImportBatchReport): void => void window.scamp.reportImportBatch(payload);

          if (action === 'undo') {
            // Everything it made — views, and the components finishing made.
            const removed: string[] = [];
            let error: string | undefined;
            const made: Array<{ name: string; kind: 'view' | 'component' }> = [
              ...(record?.views ?? []).map((v) => ({ name: v.name, kind: 'view' as const })),
              ...(record?.components ?? []).map((name) => ({ name, kind: 'component' as const })),
            ];
            for (const { name, kind } of made) {
              try {
                await window.scamp.deleteComponent({ projectPath, componentName: name, kind });
                removed.push(name);
              } catch (err) {
                error = errorMessage(err);
              }
            }
            batches.delete(batchId);
            if (removed.length > 0) {
              onViewsRemoved?.(removed);
              onProjectChange?.((prev) => ({
                ...prev,
                components: prev.components.filter((c) => !removed.includes(c.name)),
              }));
              useAppLogStore.getState().log('info', `Undid an import: removed ${removed.join(', ')}.`);
            }
            send({ kind: 'undone', projectPath, batchId, removed, ...(error !== undefined ? { error } : {}) });
            return;
          }

          // Finish: one component for each React component the views share.
          // see docs/plans/react-import-plan.md
          const views = record?.views ?? [];
          try {
            const plan = planReactComponents(views, {
              takenNames: [...project.components.map((c) => c.name), ...project.pages.map((p) => p.name)],
              randomId: generateElementId,
            });
            // Lists the app draws with `.map()`, as repeats — in the views and
            // in the components just made. The names come from the app's
            // source, read in main from the folder Scamp is running it from.
            const sites = [...new Set(
              [...plan.views.map((v) => v.react), ...plan.components.map((c) => c.react)].flatMap((r) =>
                Object.values(r).flatMap((info) => (info.site === undefined ? [] : [info.site]))
              )
            )];
            const sources = sites.length > 0 ? await window.scamp.reactImportListNames({ projectPath, sites }).catch(() => ({})) : {};
            const repeats: PlannedRepeat[] = [];
            for (const view of plan.views) {
              const result = planRepeats(view, { sources });
              view.elements = result.elements;
              repeats.push(...result.repeats);
            }
            for (const component of plan.components) {
              const result = planRepeats(component, { sources, takenNames: component.props });
              component.elements = result.elements;
              repeats.push(...result.repeats);
            }

            const madeFiles: ComponentFile[] = [];
            for (const component of plan.components) {
              const code = generateCode({
                elements: component.elements,
                rootId: component.rootId,
                pageName: component.name,
                cssModuleImportName: component.name,
                isComponent: true,
                breakpoints,
              });
              const file = await window.scamp.createComponent({
                projectPath,
                componentName: component.name,
                kind: 'component',
                tsxContent: code.tsx,
                cssContent: code.css,
              });
              madeFiles.push(file);
              record?.components.push(file.name);
            }
            // Each view that now holds instances or repeats, rewritten.
            const rewritten = new Map<string, { tsxContent: string; cssContent: string }>();
            for (const [i, view] of views.entries()) {
              const planned = plan.views[i];
              if (planned === undefined) continue;
              // Changed when it gained an element (an instance) or lost one (a list's rows).
              const before = Object.keys(view.elements);
              const after = Object.keys(planned.elements);
              if (before.length === after.length && after.every((id) => id in view.elements)) continue;
              const code = generateCode({
                elements: planned.elements,
                rootId: planned.rootId,
                pageName: view.name,
                cssModuleImportName: view.name,
                isComponent: true,
                breakpoints,
              });
              await window.scamp.writeFile({
                tsxPath: view.tsxPath,
                cssPath: view.cssPath,
                tsxContent: code.tsx,
                cssContent: code.css,
              });
              rewritten.set(view.name, { tsxContent: code.tsx, cssContent: code.css });
            }
            onProjectChange?.((prev) => ({
              ...prev,
              components: [
                ...prev.components.map((c) => {
                  const next = rewritten.get(c.name);
                  return next === undefined ? c : { ...c, ...next };
                }),
                ...madeFiles.filter((f) => !prev.components.some((c) => c.name === f.name)),
              ],
            }));
            if (plan.components.length > 0) {
              useAppLogStore
                .getState()
                .log('info', `Made ${plan.components.length} components from the React app: ${plan.components.map((c) => c.name).join(', ')}.`);
            }
            send({
              kind: 'finished',
              projectPath,
              batchId,
              components: plan.components.map((c) => ({ name: c.name, instances: c.instances, views: c.views.length })),
              repeats: repeats.map((r) => ({ list: r.over, rows: r.rows })),
              notes: plan.findings.map(describeReactFinding),
            });
          } catch (err) {
            send({ kind: 'finished', projectPath, batchId, components: [], notes: [], error: errorMessage(err) });
          }
          const last = views.at(-1);
          if (last !== undefined) openView(last.name);
        })();
      }),
    [project, breakpoints, onProjectChange, onViewsRemoved, openView]
  );
};
