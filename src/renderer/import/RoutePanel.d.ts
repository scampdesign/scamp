import { type ReactRoute } from '@shared/reactRoutes';
export type RoutesState = {
    kind: 'reading';
} | {
    kind: 'none';
} | {
    kind: 'ready';
    routes: ReactRoute[];
};
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
    onVisit: (path: string) => void;
};
/**
 * A React app's routes, beside the page. Choosing one loads it; a route
 * with params asks for them first. Auth plumbing and catch-alls are
 * listed after the pages, since they rarely want importing.
 * see docs/plans/react-import-plan.md
 */
export declare const RoutePanel: ({ state, current, redirect, disabled, onVisit }: Props) => JSX.Element;
export {};
