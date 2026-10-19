import type { CapturedReact, CapturedReactInstance } from '@shared/importCapture';
import { type ScampElement } from './element';
export type ReactView = {
    name: string;
    elements: Record<string, ScampElement>;
    rootId: string;
    /** React's account of each element, by element id; lifted text has none. */
    react: Readonly<Record<string, CapturedReact>>;
    instances: Readonly<Record<string, CapturedReactInstance>>;
};
export type PlannedComponent = {
    name: string;
    elements: Record<string, ScampElement>;
    rootId: string;
    /** How many copies became instances, and in which views. */
    instances: number;
    views: string[];
    /** Text props, by name. */
    props: string[];
    /** React's account of the definition's elements, from the copy it was made from. */
    react: Record<string, CapturedReact>;
};
export type ReactComponentFinding = {
    component: string;
    kind: 
    /** Some elements look different in different copies; the component shows the commonest look. */
    'style-varies'
    /** The copies' looks became variants, which each instance picks. */
     | 'variants'
    /** The copies differ too much to be one component; they stay as they are. */
     | 'too-different'
    /** The component renders more than one top-level element. */
     | 'fragment'
    /** The component takes content that differs by page in more than one place. */
     | 'slots'
    /** The copies contain another component made in this import; components inside components aren't made yet. */
     | 'nested';
    /** Element class names, or a count — what the report shows. */
    detail: string;
};
export type ReactComponentPlan = {
    views: Array<{
        name: string;
        elements: Record<string, ScampElement>;
        rootId: string;
        /** React's account, with each new instance standing for the copy it replaced. */
        react: Record<string, CapturedReact>;
    }>;
    components: PlannedComponent[];
    findings: ReactComponentFinding[];
};
export type PlanOptions = {
    /** Component and view names already in the project. */
    takenNames?: ReadonlyArray<string>;
    /** Copies needed before something becomes a component. */
    minInstances?: number;
    /** A component smaller than this isn't worth one. */
    minElements?: number;
    /** Id source for instance elements; injected so tests are stable. */
    randomId?: () => string;
};
/**
 * Plan the components: which groups of copies become one component, what
 * each component looks like, and the views with instances in place of
 * the copies.
 */
export declare const planReactComponents: (input: ReadonlyArray<ReactView>, options?: PlanOptions) => ReactComponentPlan;
/** A finding in the words the import report uses. */
export declare const describeReactFinding: (finding: ReactComponentFinding) => string;
