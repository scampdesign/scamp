import type { OverflowReport } from '@shared/overflowMeasure';
import type { ScampElement } from './element';
type Tree = {
    elements: Record<string, ScampElement>;
};
/** Where an exported class lives: the element, and the view or component to edit it in. */
export type ExportedClassOwner = {
    owner: string;
    ownerKind: 'view' | 'component';
    element: ScampElement;
    /** The instance on the view it's inside, when the owner is a component. */
    instance: string | null;
};
/** Follow `inst__inner__child` from the view through each instance's component. */
export declare const locateExportedClass: (cls: string, view: {
    name: string;
    kind: "view" | "component";
    elements: Record<string, ScampElement>;
}, components: Readonly<Record<string, Tree>>) => ExportedClassOwner | null;
/** The report, as the agent reads it. */
export declare const describeOverflow: (viewName: string, report: OverflowReport, locate: (cls: string) => ExportedClassOwner | null) => string;
export {};
