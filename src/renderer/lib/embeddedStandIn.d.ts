import type { EmbeddedStyleChange } from '@shared/types';
import { type ScampElement } from './element';
/**
 * Embedded Scamp drives Scamp's own properties panel from an element of a
 * page it didn't write: the selected node becomes a stand-in `ScampElement`
 * built from its computed styles, and each panel edit is read back as the
 * CSS that changed. see docs/plans/embedded-scamp-plan.md
 */
export declare const STAND_IN_ID = "e0e0";
export type StandInInput = {
    computed: Record<string, string>;
    parentDisplay: string;
    textOnly: boolean;
    tag: string;
    text: string;
};
/** A root standing for the parent, and the selected element inside it. */
export declare const standInTree: (input: StandInInput) => Record<string, ScampElement>;
/** `prop: value;` lines as a map; commented-out groups are left out. */
export declare const declarationMap: (lines: ReadonlyArray<string>) => Map<string, string>;
/** The CSS a panel edit changed on the stand-in, as page-ready values. */
export declare const styleChanges: (before: Record<string, ScampElement>, after: Record<string, ScampElement>) => EmbeddedStyleChange[];
