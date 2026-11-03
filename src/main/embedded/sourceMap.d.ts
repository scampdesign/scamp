/**
 * Just enough of source maps to turn a dev server's chunk position into a
 * project file and line, for Next.js, where Scamp doesn't tag elements at
 * build time. Pure. see docs/plans/embedded-scamp-plan.md
 */
export type SourceMap = {
    version?: number;
    sources?: string[];
    sourceRoot?: string;
    mappings?: string;
    /** An index map (Turbopack writes these): each section maps a range of the chunk. */
    sections?: Array<{
        offset: {
            line: number;
            column: number;
        };
        map: SourceMap;
    }>;
};
export type OriginalPosition = {
    source: string;
    line: number;
    column: number;
};
/** One line's segments: `[generatedColumn, sourceIndex, sourceLine, sourceColumn]`, all 0-based, absolute. */
type Segment = [number, number, number, number];
/** Decode a `mappings` string; `null` for malformed input. */
export declare const decodeMappings: (mappings: string) => Segment[][] | null;
/**
 * Where a 1-based line and column of the generated file came from, with a
 * 1-based line and 0-based column in the original. Stack traces give
 * 1-based columns: pass them as they are.
 */
export declare const originalPosition: (map: SourceMap, line: number, column: number) => OriginalPosition | null;
/** The last `sourceMappingURL` comment in a chunk, or null. */
export declare const sourceMappingUrl: (code: string) => string | null;
/** A `data:` source map URL's map; null when it isn't one or doesn't parse. */
export declare const inlineMap: (url: string) => SourceMap | null;
/**
 * A source map's `source` as a path inside the project, or null when it
 * points elsewhere. Handles webpack's, Turbopack's and plain file URLs.
 */
export declare const projectPath: (source: string, root: string) => string | null;
/**
 * The local names of an element's classes, as its source writes them:
 * CSS Module names come out hashed, differently per bundler.
 */
export declare const classTokens: (classes: ReadonlyArray<string>) => string[];
/**
 * The line of JSX that most likely draws the element, near `line`
 * (1-based): a line opening `<tag`, scored up for the element's class
 * names and text. `line` itself wins a tie. Null when no line opens `<tag`.
 */
export declare const refineLine: (code: string, line: number, hints: {
    tag: string;
    classes: ReadonlyArray<string>;
    text: string;
}, radius?: number) => {
    line: number;
    column: number;
} | null;
export {};
