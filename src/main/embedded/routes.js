/**
 * A Next.js app's routes, from its files: Next has no router in the page
 * to ask, as React Router does (`readRoutesFn`). Pure.
 * see docs/plans/embedded-scamp-plan.md
 */
const PAGE_EXT = /\.(tsx|jsx|ts|js|mdx)$/;
/** `/blog/[slug]`-style paths for every page under `app/` and `pages/`, sorted. */
export const nextRoutes = (files) => {
    const out = new Set();
    for (const raw of files) {
        const file = raw.replace(/\\/g, '/');
        const app = /^(?:src\/)?app\/(.*?)\/?page\.(?:tsx|jsx|ts|js|mdx)$/.exec(file);
        if (app !== null) {
            const segments = (app[1] ?? '').split('/').filter((s) => s.length > 0);
            // Parallel slots, intercepting routes and private folders aren't pages of their own.
            if (segments.some((s) => s.startsWith('@') || s.startsWith('_') || /^\(\.+\)/.test(s)))
                continue;
            out.add(`/${segments.filter((s) => !/^\(.*\)$/.test(s)).join('/')}`);
            continue;
        }
        const pages = /^(?:src\/)?pages\/(.+)$/.exec(file);
        if (pages === null || !PAGE_EXT.test(file))
            continue;
        const segments = (pages[1] ?? '').replace(PAGE_EXT, '').split('/');
        if (segments[0] === 'api' || segments.some((s) => s.startsWith('_')))
            continue;
        if (segments[segments.length - 1] === 'index')
            segments.pop();
        out.add(`/${segments.join('/')}`);
    }
    return [...out].sort();
};
