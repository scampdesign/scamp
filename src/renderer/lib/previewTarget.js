import { viewSlugFor } from '@shared/templates';
/** The preview's label for a component, beside the views' slugs. */
export const componentPreviewName = (name) => `${name} (component)`;
/**
 * Where the Preview button goes, or null when it can't preview.
 *
 * - A Next.js project previews a page at its route through `next dev`; a
 *   view, at its wrapper page's route.
 * - A Scamp framework project previews a view at the route that renders
 *   it (which runs its `load()`), or with its defaults at `/_views/<Name>`.
 *   A component previews alone at `/_components/<Name>`, where its click
 *   interactions run as they will on a page. CONTRACT.md §2.2
 * - A legacy project can't preview.
 */
export const previewTargetFor = (format, open, project) => {
    if (format === 'nextjs') {
        const pageName = open.view !== null ? viewSlugFor(open.view) : open.page;
        if (pageName === null)
            return null;
        return { pageName, pageNames: project.pages.map((p) => p.name) };
    }
    if (format !== 'scamp' || (open.view === null && open.component === null))
        return null;
    const views = project.components.filter((c) => c.kind === 'view').map((c) => c.name);
    const routeFor = (view) => {
        const route = (project.routes ?? []).find((r) => r.kind === 'page' && r.view === view && !r.path.includes(':'));
        return route?.path ?? `/_views/${view}`;
    };
    const routes = Object.fromEntries(views.map((v) => [viewSlugFor(v), routeFor(v)]));
    const pageNames = views.map((v) => viewSlugFor(v));
    if (open.component !== null) {
        const name = componentPreviewName(open.component);
        return { pageName: name, pageNames: [...pageNames, name], routes: { ...routes, [name]: `/_components/${open.component}` } };
    }
    return { pageName: viewSlugFor(open.view), pageNames, routes };
};
