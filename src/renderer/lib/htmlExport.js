/**
 * Turns a whole project into the text files of an HTML export.
 *
 * Pure, and deliberately so: it takes the project's source as strings and
 * returns files as strings, leaving every disk operation to the main
 * process. That keeps the part with all the decisions in it — which page
 * links where, which stylesheet an instance's rules land in, how deep a
 * relative path has to climb — testable without Electron or a temp dir.
 *
 * see docs/archive/2026-08-27-html-export-plan.md
 */
import { collectExpandedInstances, generateHtml, renderDocument, } from './generateHtml';
import { assemblePageCss, rewriteCssUrls } from './htmlExportCss';
import { cssPathFor, fromPageToRoot, htmlPathFor, rewriteAssetUrlForPage, rewriteHrefForPage, } from './htmlExportPaths';
import { parseCode } from './parseCode';
/** Name of the shared stylesheet at the export root. */
export const THEME_FILE = 'theme.css';
const parseComponentTrees = (components) => {
    const trees = {};
    for (const component of components) {
        try {
            const parsed = parseCode(component.tsxContent, component.cssContent, {
                isComponent: true,
            });
            trees[component.name] = {
                elements: parsed.elements,
                rootId: parsed.rootId,
            };
        }
        catch {
            // A component that won't parse can't be expanded. Instances of it
            // render as a comment (`generateHtml` handles the missing case), which
            // is better than failing the whole export over one bad file.
            continue;
        }
    }
    return trees;
};
export const buildHtmlExport = (input) => {
    const componentTrees = parseComponentTrees(input.components);
    const componentCssByName = new Map(input.components.map((c) => [c.name, c.cssContent]));
    const pageNames = input.pages.map((p) => p.name);
    const files = [];
    const skipped = [];
    for (const page of input.pages) {
        let parsed;
        try {
            parsed = parseCode(page.tsxContent, page.cssContent);
        }
        catch (error) {
            skipped.push({
                pageName: page.name,
                reason: error instanceof Error ? error.message : 'could not be parsed',
            });
            continue;
        }
        // Assets and links resolve relative to this page's directory. CSS `url()`
        // resolves against the stylesheet rather than the document, but the two
        // sit at the same depth, so one rewriter serves both.
        const forThisPage = (url) => rewriteAssetUrlForPage(url, page.name);
        const body = generateHtml(parsed.elements, parsed.rootId, {
            componentTrees,
            rewriteAssetUrl: forThisPage,
            rewriteHref: (href) => rewriteHrefForPage(href, page.name, pageNames),
        });
        files.push({
            path: htmlPathFor(page.name),
            contents: renderDocument(body, {
                title: input.projectName,
                stylesheets: [fromPageToRoot(page.name, THEME_FILE), 'index.css'],
            }),
        });
        const instances = collectExpandedInstances(parsed.elements, parsed.rootId, componentTrees).map((instance) => ({
            prefix: instance.prefix,
            css: rewriteCssUrls(componentCssByName.get(instance.componentName) ?? '', forThisPage),
        }));
        files.push({
            path: cssPathFor(page.name),
            contents: assemblePageCss(rewriteCssUrls(page.cssContent, forThisPage), instances),
        });
    }
    // `theme.css` sits at the export root, and CSS urls resolve against the
    // stylesheet's own location — so its asset paths are root-relative
    // regardless of which page loads it.
    files.push({
        path: THEME_FILE,
        contents: rewriteCssUrls(input.themeCss, (url) => rewriteAssetUrlForPage(url, 'home')),
    });
    return { files, skipped };
};
