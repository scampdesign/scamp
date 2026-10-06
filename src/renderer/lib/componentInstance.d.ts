import type { ScampElement } from './element';
/**
 * A component instance on a page, and putting one in place of a subtree.
 * Pure, so the store, the Scamp Agent's headless runner and the tests
 * all build instances one way.
 */
export declare const makeInstanceElement: (input: {
    parentId: string;
    componentName: string;
    x: number;
    y: number;
}, id: string) => ScampElement;
/**
 * Replace a subtree with an instance of `componentName`, in the subtree
 * root's place among its siblings so flex and grid order holds. Null for
 * the page root or a missing element.
 */
export declare const replaceSubtreeWithInstancePure: (elements: Record<string, ScampElement>, subtreeRootId: string, componentName: string, newId: string) => Record<string, ScampElement> | null;
