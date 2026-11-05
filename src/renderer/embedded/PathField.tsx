import { useEffect, useState } from 'react';

import { routeHasParams } from '@shared/embedded';

import { useEmbeddedStore } from './embeddedStore';
import { openPath } from './session';
import styles from './PathField.module.css';

const pathOf = (url: string | null): string => {
  if (url === null) return '/';
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return '/';
  }
};

/** The page's path, with the app's routes in a list under it. */
export const PathField = (): JSX.Element => {
  const pageUrl = useEmbeddedStore((s) => s.pageUrl);
  const routes = useEmbeddedStore((s) => s.routes);
  const [draft, setDraft] = useState(pathOf(pageUrl));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** Enter picks the highlighted route only after the arrow keys moved to it. */
  const [arrowed, setArrowed] = useState(false);
  useEffect(() => setDraft(pathOf(pageUrl)), [pageUrl]);

  // The whole list until you type; then the routes that contain what you typed.
  const typed = draft !== pathOf(pageUrl);
  const shown = typed ? routes.filter((r) => r.toLowerCase().includes(draft.toLowerCase())) : routes;

  const handleChoose = (route: string): void => {
    // A route with params can't be visited as written: fill it in first.
    if (routeHasParams(route)) {
      setDraft(route);
      return;
    }
    setOpen(false);
    openPath(route);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setArrowed(true);
      setActive((i) => Math.max(0, Math.min(shown.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setDraft(pathOf(pageUrl));
    } else if (e.key === 'Enter' && open && arrowed) {
      const route = shown[active];
      if (route === undefined) return;
      e.preventDefault();
      setArrowed(false);
      handleChoose(route);
    }
  };

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        openPath(draft);
      }}
    >
      <input
        className={styles.url}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
          setActive(0);
          setArrowed(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls="embedded-routes"
        aria-autocomplete="list"
        aria-label="Page path"
        data-testid="embedded-path"
      />
      {open && shown.length > 0 && (
        <ul className={styles.menu} id="embedded-routes" role="listbox" data-testid="embedded-routes">
          {shown.map((route, i) => (
            <li
              key={route}
              role="option"
              aria-selected={i === active}
              className={styles.option}
              // Keep focus in the field, so the click lands before blur closes the list.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => handleChoose(route)}
            >
              {route}
              {routeHasParams(route) && <span className={styles.params}>fill in</span>}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
};
