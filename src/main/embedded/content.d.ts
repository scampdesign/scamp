import type { EmbeddedContentField, EmbeddedContentOrigin } from '@shared/types';
/**
 * Where an element's text, image, or link comes from, read from its JSX:
 * written in the code (editable), passed in as a prop with a value written
 * where the component is used (editable there), or data (not editable from
 * Scamp: a list item, state, an API, an expression). When the parse can't
 * decide, it says so, and Scamp treats it as data. Pure apart from `read`.
 * see docs/plans/embedded-canvas-gaps.md (P5)
 */
type Node = {
    type: string;
    start?: number | null;
    end?: number | null;
    loc?: {
        start: {
            line: number;
            column: number;
        };
        end?: {
            line: number;
            column: number;
        };
    } | null;
    [key: string]: unknown;
};
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
declare const parseFile: (code: string, file: string) => Node | null;
/** The JSX element whose opening tag starts at `line`:`column` (1-based), with its ancestors. */
declare const elementAt: (root: Node, line: number, column: number) => {
    element: Node;
    ancestors: Node[];
} | null;
declare const splitSource: (source: string) => {
    file: string;
    line: number;
    column: number;
} | null;
/** Where the content of `field` on the element comes from, following props to where components are used. */
export declare const classifyContent: (query: ContentQuery) => Promise<EmbeddedContentOrigin>;
/**
 * A file name not already in `taken`, compared without case (macOS folders
 * ignore it): `logo.png`, then `logo-2.png`, and so on. Spaces become dashes,
 * so the name works as a URL.
 */
export declare const freeFileName: (name: string, taken: ReadonlyArray<string>) => string;
/**
 * The lines of the JSX element written at `source` (`file:line:col`), up to
 * `max` of them; ten lines from `line` when the parse can't find it.
 */
export declare const jsxLines: (code: string, source: string, max?: number) => {
    start: number;
    lines: string[];
} | null;
/**
 * The CSS Module class the element at `source` is written with, when its
 * `className` is exactly `{styles.name}` and `styles` is imported from a
 * `*.module.css` file: that file, relative to the project, and the class.
 */
export declare const moduleClassAt: (code: string, source: string) => {
    file: string;
    className: string;
} | null;
export { elementAt, parseFile, splitSource, type Node as JsxNode };
