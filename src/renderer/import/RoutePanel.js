import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { fillParams, selectedByDefault } from '@shared/reactRoutes';
import styles from './ImportApp.module.css';
/**
 * A React app's routes, beside the page. Choosing one loads it; a route
 * with params asks for them first. Auth plumbing and catch-alls are
 * listed after the pages, since they rarely want importing.
 * see docs/plans/react-import-plan.md
 */
export const RoutePanel = ({ state, current, redirect, disabled, onVisit }) => {
    const [values, setValues] = useState({});
    const routes = state.kind === 'ready' ? state.routes : [];
    const pages = routes.filter(selectedByDefault);
    const others = routes.filter((r) => !selectedByDefault(r) && !r.splat);
    const item = (route) => {
        const filled = fillParams(route, values[route.path] ?? {});
        const active = current?.path === route.path;
        return (_jsxs("li", { className: styles.routeItem, children: [_jsx("button", { type: "button", className: `${styles.routeBtn} ${active ? styles.routeActive : ''}`, onClick: () => filled !== null && onVisit(filled), disabled: disabled || filled === null, "aria-current": active ? 'page' : undefined, title: filled === null ? 'Fill in the values below first' : `Open ${filled}`, children: route.path }), route.params.map((param) => (_jsx("input", { className: styles.routeParam, placeholder: param, "aria-label": `${route.path}: ${param}`, value: values[route.path]?.[param] ?? '', onChange: (e) => setValues((all) => ({ ...all, [route.path]: { ...all[route.path], [param]: e.target.value } })), onKeyDown: (e) => {
                        if (e.key === 'Enter' && filled !== null)
                            onVisit(filled);
                    }, spellCheck: false }, param)))] }, route.path));
    };
    return (_jsxs("aside", { className: styles.routes, "aria-label": "Pages in this app", "data-testid": "react-routes", children: [_jsx("h2", { className: styles.routesTitle, children: "Pages" }), redirect !== null && (_jsxs("p", { className: styles.routesRedirect, role: "status", "data-testid": "react-route-redirect", children: [_jsx("code", { children: redirect.from }), " went to ", _jsx("code", { children: redirect.to }), ". Use the page to get to the state you want, then import it."] })), state.kind === 'reading' && _jsx("p", { className: styles.routesNote, children: "Reading the app\u2019s routes\u2026" }), state.kind === 'none' && (_jsx("p", { className: styles.routesNote, children: "Scamp couldn\u2019t find this app\u2019s router. Navigate in the page, and import each page as you get to it." })), state.kind === 'ready' && (_jsxs(_Fragment, { children: [_jsx("ul", { className: styles.routeList, children: pages.map(item) }), others.length > 0 && (_jsxs(_Fragment, { children: [_jsx("h3", { className: styles.routesSubtitle, children: "Needs a value, or signs in" }), _jsx("ul", { className: styles.routeList, children: others.map(item) })] }))] }))] }));
};
