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
/** A route object as the page hands it back: only what we read. */
export type RawRoute = {
    path?: string;
    index?: boolean;
    children?: RawRoute[];
};
export type ReactRoute = {
    /** Absolute, as a browser would visit it: `/patients/:patientId`. */
    path: string;
    /** Names of the `:params` the path needs filled in. */
    params: string[];
    /** A catch-all (`*`), which isn't a page of its own. */
    splat: boolean;
};
/**
 * Serialized into the page and run there, so it must be self-contained:
 * no imports, no closures over this module. Returns null when the page
 * has no React root, or a root with no router this can read.
 */
export declare const readRoutesFn: () => RawRoute[] | null;
/**
 * Every route a browser can visit, absolute and in order, without
 * duplicates. A layout route (no path) contributes its children; an
 * index route is its parent's path.
 */
export declare const flattenRoutes: (routes: ReadonlyArray<RawRoute>, base?: string) => ReactRoute[];
/**
 * Whether a route is ticked when the list first opens: a page that can be
 * visited as it stands. Routes needing params, catch-alls and auth
 * plumbing are offered but left unticked.
 */
export declare const selectedByDefault: (route: ReactRoute) => boolean;
/** The path with its params filled in, or null while any is missing. */
export declare const fillParams: (route: ReactRoute, values: Readonly<Record<string, string>>) => string | null;
/**
 * A view name for a route. A single-page app gives every route the same
 * `<title>`, so naming views by title — as a page import does — names
 * them all the same. `/billing/dashboard` → `BillingDashboard`, `/` →
 * `Home`; a route with params gets `Detail`: `/patients/:id` →
 * `PatientsDetail`.
 */
export declare const viewNameForRoute: (path: string) => string;
/**
 * The route a visited path belongs to: an exact match first, then the
 * first pattern whose params fit. `/patients/1001` → `/patients/:patientId`.
 */
export declare const routeForPath: (routes: ReadonlyArray<ReactRoute>, path: string) => ReactRoute | null;
