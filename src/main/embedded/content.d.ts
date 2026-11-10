import type { EmbeddedContentField, EmbeddedContentOrigin } from '@shared/types';
/** Where a component is used, from React's props in the page (`data-scamp-call`), innermost first. */
export type ComponentCall = {
    name: string;
    call: string | null;
};
export type ContentQuery = {
    /** `src/Card.jsx:4:5`: the element's opening tag, column 1-based. */
    source: string;
    field: EmbeddedContentField;
    calls: ReadonlyArray<ComponentCall>;
    /** Reads a project file by its project-relative path; null when it can't. */
    read: (file: string) => Promise<string | null>;
};
/** Where the content of `field` on the element comes from, following props to where components are used. */
export declare const classifyContent: (query: ContentQuery) => Promise<EmbeddedContentOrigin>;
/**
 * A file name not already in `taken`, compared without case (macOS folders
 * ignore it): `logo.png`, then `logo-2.png`, and so on. Spaces become dashes,
 * so the name works as a URL.
 */
export declare const freeFileName: (name: string, taken: ReadonlyArray<string>) => string;
