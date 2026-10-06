// A small React app for the React import's e2e spec: three pages, one
// route with a param, and one that redirects. Plain createElement, so
// Vite serves it with no JSX plugin.
//
// It routes itself rather than through react-router, which Scamp doesn't
// install, but exposes its routes the way react-router's data router
// does — `<RouterProvider router={{ routes }}>` — which is what the
// importer reads. Real react-router is measured by
// scripts/react-import-eval.mjs against a real app.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const h = React.createElement;

const navigate = (to) => {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const NavItem = ({ to, label, active }) =>
  h('button', { className: `nav-item${active ? ' is-active' : ''}`, onClick: () => navigate(to) }, label);

const Shell = ({ path, children }) =>
  h('div', { className: 'shell' }, [
    h('nav', { key: 'nav', className: 'nav' }, [
      h(NavItem, { key: 'home', to: '/', label: 'Home', active: path === '/' }),
      h(NavItem, { key: 'about', to: '/about', label: 'About', active: path === '/about' }),
      h(NavItem, { key: 'team', to: '/team/ada', label: 'Team', active: path.startsWith('/team') }),
    ]),
    h('main', { key: 'main', className: 'main' }, children),
  ]);

// A list drawn with `.map()`, keyed as React requires: the import makes it one repeated row.
const MEMBERS = ['Ada', 'Grace', 'Linus'];
const MemberList = () => h('ul', { className: 'members' }, MEMBERS.map((name) => h('li', { key: name, className: 'member' }, name)));

const Page = ({ title, body }) => h('section', { className: 'card' }, [h('h1', { key: 't' }, title), h('p', { key: 'b' }, body)]);

const routes = [
  { path: '/', element: () => h(Page, { title: 'Welcome home', body: 'The fixture app’s first page.' }) },
  { path: '/about', element: () => h(Page, { title: 'About us', body: 'A page with no params.' }) },
  {
    path: '/team/:member',
    element: ({ params }) =>
      h('div', null, [h(Page, { key: 'page', title: `Team: ${params.member}`, body: 'A page with a param.' }), h(MemberList, { key: 'list' })]),
  },
  // Like a page behind a sign-in: it sends you elsewhere straight away.
  { path: '/private', redirect: '/' },
];

const match = (path) => {
  for (const route of routes) {
    const names = [];
    const pattern = new RegExp(`^${route.path.replace(/:([a-z]+)/g, (_m, name) => (names.push(name), '([^/]+)'))}$`);
    const m = path.match(pattern);
    if (m) return { route, params: Object.fromEntries(names.map((n, i) => [n, m[i + 1]])) };
  }
  return null;
};

const RouterProvider = ({ router }) => {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const found = match(path);
  useEffect(() => {
    if (found?.route.redirect) {
      window.history.replaceState({}, '', found.route.redirect);
      setPath(found.route.redirect);
    }
  }, [found]);
  const content =
    found === null
      ? h(Page, { title: 'Not found', body: path })
      : found.route.redirect
        ? null
        : h(found.route.element, { params: found.params });
  return h(Shell, { path }, content);
};

createRoot(document.getElementById('root')).render(h(RouterProvider, { router: { routes } }));
