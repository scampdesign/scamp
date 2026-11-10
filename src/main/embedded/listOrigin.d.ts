import type { EmbeddedListOrigin } from '@shared/types';
/**
 * Where a list's order comes from, for a move among items drawn by one
 * `.map()`: an array written in the project (the agent reorders its items)
 * or data (an API, state, props, or a value worked out while the app runs),
 * whose order Scamp can't change. Pure apart from `read`.
 * see docs/notes/embedded-move-preview.md
 */
export type ListQuery = {
    /** The element's JSX, then where its component is used: the `.map()` is around one of them. */
    sources: ReadonlyArray<string>;
    read: (file: string) => Promise<string | null>;
    /** Import aliases from tsconfig `paths`, such as `@/` → `src/`. */
    aliases: ReadonlyArray<{
        prefix: string;
        target: string;
    }>;
};
/** Where the order of the list an element is drawn by comes from: its own JSX first, then where its component is used. */
export declare const listOrigin: (query: ListQuery) => Promise<EmbeddedListOrigin | null>;
/** `paths` from a tsconfig or jsconfig, as prefixes: `"@/*": ["./src/*"]` → `@/` → `src/`. */
export declare const aliasesFrom: (config: string) => Array<{
    prefix: string;
    target: string;
}>;
