import { type ReactRoute } from '@shared/reactRoutes';
export type RoutesState = {
    kind: 'reading';
} | {
    kind: 'none';
} | {
    kind: 'ready';
    routes: ReactRoute[];
};
/** Param values typed for each route, by route pattern. */
export type ParamValues = Record<string, Record<string, string>>;
type Props = {
    state: RoutesState;
    /** The route the page is on now, if any route takes its path. */
    current: ReactRoute | null;
    /** A route that sent the page somewhere else, and where. */
    redirect: {
        from: string;
        to: string;
    } | null;
    disabled: boolean;
    values: ParamValues;
    onValues: (next: ParamValues) => void;
    /** Routes ticked for a multi-page import, by pattern. */
    selected: ReadonlySet<string>;
    onToggle: (route: string) => void;
    onVisit: (path: string) => void;
    /** Import every ticked route that can be visited. */
    onImportSelected: (targets: Array<{
        route: string;
        path: string;
    }>) => void;
};
/**
 * A React app's routes, beside the page. Choosing one loads it; ticking
 * several imports them in one go. A route with params asks for them
 * first. Auth plumbing is listed after the pages, since it rarely wants
 * importing.
 * see docs/plans/react-import-plan.md
 */
export declare const RoutePanel: ({ state, current, redirect, disabled, values, onValues, selected, onToggle, onVisit, onImportSelected, }: Props) => JSX.Element;
export {};
