import { describe, it, expect } from 'vitest';

import { fillParams, flattenRoutes, selectedByDefault, type RawRoute } from '@shared/reactRoutes';

/**
 * A React app's route table, flattened into pages to import.
 * see docs/plans/react-import-plan.md
 */

/** The shape of the test app's router: layouts without paths, nesting, params. */
const ROUTES: RawRoute[] = [
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
  const route = (path: string) => flattenRoutes([{ path }])[0];

  it('ticks a page that can be visited as it stands', () => {
    expect(selectedByDefault(route('/patients')!)).toBe(true);
    expect(selectedByDefault(route('/')!)).toBe(true);
  });

  it('leaves routes needing params, the catch-all and auth plumbing unticked', () => {
    expect(selectedByDefault(route('/patients/:patientId')!)).toBe(false);
    expect(selectedByDefault(route('*')!)).toBe(false);
    expect(selectedByDefault(route('/login')!)).toBe(false);
    expect(selectedByDefault(route('/session/sign-out')!)).toBe(false);
    expect(selectedByDefault(route('/auth/callback')!)).toBe(false);
  });

  it('doesn’t mistake a page whose name merely contains a word for auth', () => {
    expect(selectedByDefault(route('/authors')!)).toBe(true);
    expect(selectedByDefault(route('/sessions-report')!)).toBe(true);
  });
});

describe('fillParams', () => {
  const route = flattenRoutes([{ path: '/billing/claims/:claimId' }])[0]!;

  it('fills each param, encoded', () => {
    expect(fillParams(route, { claimId: 'CLM 1' })).toBe('/billing/claims/CLM%201');
  });

  it('returns null while a param is missing or blank', () => {
    expect(fillParams(route, {})).toBeNull();
    expect(fillParams(route, { claimId: '  ' })).toBeNull();
  });

  it('drops an optional param left empty', () => {
    expect(fillParams(flattenRoutes([{ path: '/docs/:section?' }])[0]!, {})).toBe('/docs');
  });
});
