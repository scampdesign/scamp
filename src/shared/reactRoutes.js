/**
 * A React app's routes, read from the running app.
 *
 * A static parse of the router file misses every route built in code —
 * on the test app, 26 of 48, all under `Object.entries(…).map(…)`. And
 * crawling links finds nothing when navigation is a `<button>` calling
 * `navigate`. The router itself knows, so ask it: `readRoutesFn` runs IN
 * the page, like the capture script, and walks React's fiber tree to
 * the router's route objects. The rest of this module is pure.
 * see docs/plans/react-import-plan.md
 */
/**
 * Serialized into the page and run there, so it must be self-contained:
 * no imports, no closures over this module. Returns null when the page
 * has no React root, or a root with no router this can read.
 */
export const readRoutesFn = () => {
    const rootFiber = () => {
        const candidates = [
            document.getElementById('root'),
            document.getElementById('app'),
            document.getElementById('__next'),
            ...Array.from(document.body.children),
        ];
        for (const el of candidates) {
            if (el === null)
                continue;
            const key = Object.keys(el).find((k) => k.startsWith('__reactContainer$'));
            if (key !== undefined)
                return el[key] ?? null;
        }
        return null;
    };
    const plain = (route, depth) => {
        if (route === null || typeof route !== 'object' || depth > 20)
            return null;
        const r = route;
        const children = Array.isArray(r['children'])
            ? r['children'].map((c) => plain(c, depth + 1)).filter((c) => c !== null)
            : [];
        return {
            ...(typeof r['path'] === 'string' ? { path: r['path'] } : {}),
            ...(r['index'] === true ? { index: true } : {}),
            ...(children.length > 0 ? { children } : {}),
        };
    };
    // `<Routes><Route path …>` keeps its routes as React elements, not fibers.
    const fromElements = (children, depth) => {
        const list = Array.isArray(children) ? children : [children];
        const out = [];
        for (const child of list.flat(Infinity)) {
            const props = child?.props;
            if (props === undefined || depth > 20)
                continue;
            const nested = fromElements(props['children'], depth + 1);
            out.push({
                ...(typeof props['path'] === 'string' ? { path: props['path'] } : {}),
                ...(props['index'] === true ? { index: true } : {}),
                ...(nested.length > 0 ? { children: nested } : {}),
            });
        }
        return out;
    };
    const start = rootFiber();
    if (start === null)
        return null;
    const stack = [start];
    let visited = 0;
    while (stack.length > 0 && visited < 50_000) {
        const fiber = stack.pop();
        visited += 1;
        const props = fiber.memoizedProps;
        // A data router: `<RouterProvider router={createBrowserRouter(routes)}>`.
        const router = props?.['router'];
        if (router !== undefined && Array.isArray(router.routes)) {
            return router.routes.map((r) => plain(r, 0)).filter((r) => r !== null);
        }
        const type = fiber.type;
        const name = typeof fiber.type === 'function' ? (type?.displayName ?? type?.name) : undefined;
        if (name === 'Routes' && props !== null)
            return fromElements(props['children'], 0);
        if (fiber.sibling !== null)
            stack.push(fiber.sibling);
        if (fiber.child !== null)
            stack.push(fiber.child);
    }
    return null;
};
const join = (base, path) => {
    if (path.startsWith('/'))
        return path;
    const joined = `${base.replace(/\/+$/, '')}/${path}`;
    return joined.length > 1 ? joined.replace(/\/+$/, '') : joined;
};
/**
 * Every route a browser can visit, absolute and in order, without
 * duplicates. A layout route (no path) contributes its children; an
 * index route is its parent's path.
 */
export const flattenRoutes = (routes, base = '/') => {
    const seen = new Set();
    const out = [];
    const walk = (list, parent) => {
        for (const route of list) {
            const here = route.path !== undefined ? join(parent, route.path) : parent;
            const visitable = route.path !== undefined || route.index === true;
            if (visitable && !seen.has(here)) {
                seen.add(here);
                out.push({
                    path: here,
                    params: [...here.matchAll(/:([A-Za-z0-9_]+)\??/g)].map((m) => m[1] ?? ''),
                    splat: here.endsWith('*'),
                });
            }
            if (route.children !== undefined)
                walk(route.children, here);
        }
    };
    walk(routes, base);
    return out;
};
/** Sign-in and session plumbing: real routes, but not pages anyone designs. */
const AUTH_PATH = /(^|\/)(login|logout|log-in|log-out|sign-?in|sign-?out|sign-?up|session|auth|callback|oauth)(\/|$)/i;
/**
 * Whether a route is ticked when the list first opens: a page that can be
 * visited as it stands. Routes needing params, catch-alls and auth
 * plumbing are offered but left unticked.
 */
export const selectedByDefault = (route) => route.params.length === 0 && !route.splat && !AUTH_PATH.test(route.path);
/** The path with its params filled in, or null while any is missing. */
export const fillParams = (route, values) => {
    let missing = false;
    const filled = route.path.replace(/:([A-Za-z0-9_]+)(\?)?/g, (_match, name, optional) => {
        const value = values[name]?.trim() ?? '';
        if (value.length > 0)
            return encodeURIComponent(value);
        if (optional === undefined)
            missing = true;
        return '';
    });
    return missing ? null : filled.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
};
