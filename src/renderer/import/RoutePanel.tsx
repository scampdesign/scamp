import { useState } from 'react';

import { fillParams, selectedByDefault, type ReactRoute } from '@shared/reactRoutes';

import styles from './ImportApp.module.css';

export type RoutesState =
  | { kind: 'reading' }
  | { kind: 'none' }
  | { kind: 'ready'; routes: ReactRoute[] };

type Props = {
  state: RoutesState;
  /** The route the page is on now, if any route takes its path. */
  current: ReactRoute | null;
  /** A route that sent the page somewhere else, and where. */
  redirect: { from: string; to: string } | null;
  disabled: boolean;
  onVisit: (path: string) => void;
};

/**
 * A React app's routes, beside the page. Choosing one loads it; a route
 * with params asks for them first. Auth plumbing and catch-alls are
 * listed after the pages, since they rarely want importing.
 * see docs/plans/react-import-plan.md
 */
export const RoutePanel = ({ state, current, redirect, disabled, onVisit }: Props): JSX.Element => {
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});

  const routes = state.kind === 'ready' ? state.routes : [];
  const pages = routes.filter(selectedByDefault);
  const others = routes.filter((r) => !selectedByDefault(r) && !r.splat);

  const item = (route: ReactRoute): JSX.Element => {
    const filled = fillParams(route, values[route.path] ?? {});
    const active = current?.path === route.path;
    return (
      <li key={route.path} className={styles.routeItem}>
        <button
          type="button"
          className={`${styles.routeBtn} ${active ? styles.routeActive : ''}`}
          onClick={() => filled !== null && onVisit(filled)}
          disabled={disabled || filled === null}
          aria-current={active ? 'page' : undefined}
          title={filled === null ? 'Fill in the values below first' : `Open ${filled}`}
        >
          {route.path}
        </button>
        {route.params.map((param) => (
          <input
            key={param}
            className={styles.routeParam}
            placeholder={param}
            aria-label={`${route.path}: ${param}`}
            value={values[route.path]?.[param] ?? ''}
            onChange={(e) =>
              setValues((all) => ({ ...all, [route.path]: { ...all[route.path], [param]: e.target.value } }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filled !== null) onVisit(filled);
            }}
            spellCheck={false}
          />
        ))}
      </li>
    );
  };

  return (
    <aside className={styles.routes} aria-label="Pages in this app" data-testid="react-routes">
      <h2 className={styles.routesTitle}>Pages</h2>
      {redirect !== null && (
        <p className={styles.routesRedirect} role="status" data-testid="react-route-redirect">
          <code>{redirect.from}</code> went to <code>{redirect.to}</code>. Use the page to get to the state you want,
          then import it.
        </p>
      )}
      {state.kind === 'reading' && <p className={styles.routesNote}>Reading the app’s routes…</p>}
      {state.kind === 'none' && (
        <p className={styles.routesNote}>
          Scamp couldn’t find this app’s router. Navigate in the page, and import each page as you get to it.
        </p>
      )}
      {state.kind === 'ready' && (
        <>
          <ul className={styles.routeList}>{pages.map(item)}</ul>
          {others.length > 0 && (
            <>
              <h3 className={styles.routesSubtitle}>Needs a value, or signs in</h3>
              <ul className={styles.routeList}>{others.map(item)}</ul>
            </>
          )}
        </>
      )}
    </aside>
  );
};
