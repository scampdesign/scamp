import { describe, it, expect } from 'vitest';
import { fillParams, flattenRoutes, routeForPath, selectedByDefault, viewNameForRoute, } from '@shared/reactRoutes';
/**
 * A React app's route table, flattened into pages to import.
 * see docs/plans/react-import-plan.md
 */
/** The shape of the test app's router: layouts without paths, nesting, params. */
const ROUTES = [
    {
        children: [
            { path: '/' },
            { path: '/login' },
            { path: '/session/view-as/:role' },
            {
                children: [
                    {
                        children: [
                            { path: '/dashboard' },
                            { path: '/patients' },
                            { path: '/patients/:patientId' },
                            { path: '/rx-copilot', children: [{ index: true }, { path: 'dose-checker' }] },
                        ],
                    },
                ],
            },
            { path: '*' },
        ],
    },
];
describe('flattenRoutes', () => {
    it('lists every visitable path, absolute, in order', () => {
        expect(flattenRoutes(ROUTES).map((r) => r.path)).toEqual([
            '/',
            '/login',
            '/session/view-as/:role',
            '/dashboard',
            '/patients',
            '/patients/:patientId',
            '/rx-copilot',
            '/rx-copilot/dose-checker',
            '/*',
        ]);
    });
    it('names the params a path needs, and marks the catch-all', () => {
        const routes = flattenRoutes(ROUTES);
        expect(routes.find((r) => r.path === '/patients/:patientId')?.params).toEqual(['patientId']);
        expect(routes.find((r) => r.path === '/*')?.splat).toBe(true);
        expect(routes.find((r) => r.path === '/patients')).toEqual({ path: '/patients', params: [], splat: false });
    });
    it('lists a path once, even when an index route repeats its parent', () => {
        const paths = flattenRoutes(ROUTES).map((r) => r.path);
        expect(paths.filter((p) => p === '/rx-copilot')).toHaveLength(1);
    });
    it('joins relative children onto their parent', () => {
        expect(flattenRoutes([{ path: 'billing', children: [{ path: 'claims/:id' }] }]).map((r) => r.path)).toEqual([
            '/billing',
            '/billing/claims/:id',
        ]);
    });
    it('returns nothing for an empty table', () => {
        expect(flattenRoutes([])).toEqual([]);
    });
});
describe('selectedByDefault', () => {
    const route = (path) => flattenRoutes([{ path }])[0];
    it('ticks a page that can be visited as it stands', () => {
        expect(selectedByDefault(route('/patients'))).toBe(true);
        expect(selectedByDefault(route('/'))).toBe(true);
    });
    it('leaves routes needing params, the catch-all and auth plumbing unticked', () => {
        expect(selectedByDefault(route('/patients/:patientId'))).toBe(false);
        expect(selectedByDefault(route('*'))).toBe(false);
        expect(selectedByDefault(route('/login'))).toBe(false);
        expect(selectedByDefault(route('/session/sign-out'))).toBe(false);
        expect(selectedByDefault(route('/auth/callback'))).toBe(false);
    });
    it('doesn’t mistake a page whose name merely contains a word for auth', () => {
        expect(selectedByDefault(route('/authors'))).toBe(true);
        expect(selectedByDefault(route('/sessions-report'))).toBe(true);
    });
});
describe('fillParams', () => {
    const route = flattenRoutes([{ path: '/billing/claims/:claimId' }])[0];
    it('fills each param, encoded', () => {
        expect(fillParams(route, { claimId: 'CLM 1' })).toBe('/billing/claims/CLM%201');
    });
    it('returns null while a param is missing or blank', () => {
        expect(fillParams(route, {})).toBeNull();
        expect(fillParams(route, { claimId: '  ' })).toBeNull();
    });
    it('drops an optional param left empty', () => {
        expect(fillParams(flattenRoutes([{ path: '/docs/:section?' }])[0], {})).toBe('/docs');
    });
});
describe('viewNameForRoute', () => {
    it('names a view after its path, in PascalCase', () => {
        expect(viewNameForRoute('/billing/dashboard')).toBe('BillingDashboard');
        expect(viewNameForRoute('/tools/eligibility-tool')).toBe('ToolsEligibilityTool');
    });
    it('calls the root Home', () => {
        expect(viewNameForRoute('/')).toBe('Home');
    });
    it('marks a route with params as a detail view', () => {
        expect(viewNameForRoute('/patients/:patientId')).toBe('PatientsDetail');
    });
    it('never starts a name with a digit', () => {
        expect(viewNameForRoute('/404')).toBe('Page404');
    });
});
describe('routeForPath', () => {
    const routes = flattenRoutes(ROUTES);
    it('matches a path to its own route', () => {
        expect(routeForPath(routes, '/patients')?.path).toBe('/patients');
        expect(routeForPath(routes, '/patients/')?.path).toBe('/patients');
    });
    it('matches a filled-in path to its pattern', () => {
        expect(routeForPath(routes, '/patients/1001')?.path).toBe('/patients/:patientId');
    });
    it('prefers the exact route over a pattern that also fits', () => {
        const both = flattenRoutes([{ path: '/billing/:tab' }, { path: '/billing/claims' }]);
        expect(routeForPath(both, '/billing/claims')?.path).toBe('/billing/claims');
    });
    it('returns null for a path no route takes, rather than the catch-all', () => {
        expect(routeForPath(routes, '/nowhere/at/all')).toBeNull();
    });
});
