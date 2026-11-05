/**
 * How a selected element maps back to its JSX, without installing anything
 * into the project or touching its config: Scamp starts Vite with a config
 * of its own in `.scamp/embedded/`, which loads the project's config and
 * adds one plugin.
 *
 * The plugin writes `data-scamp-src="src/File.tsx:line:col"` into every
 * intrinsic JSX tag (`wrapperConfigSource` says how), which React renders as
 * an attribute on the element. `.scamp/` is in `.git/info/exclude`, so none
 * of it is ever committed.
 * see docs/plans/embedded-scamp-plan.md
 */
export declare const INSTRUMENT_DIR: string;
export declare const WRAPPER_CONFIG: string;
export declare const SOURCE_ATTR = "data-scamp-src";
/**
 * The generated config. Plain ESM, resolved from the project's own `vite`.
 * Written with `String.raw` so its backslashes are the file's own.
 *
 * Two layers, so every element maps to the line the user wrote:
 * - a `pre` transform, first of all plugins, that writes the attribute
 *   into each intrinsic JSX tag of the ORIGINAL source (parsed with the
 *   project's `@babel/parser`, which `@vitejs/plugin-react` brings), adding
 *   no newlines so every line keeps its number;
 * - the dev runtime wrapper, for a project without `@babel/parser` (SWC),
 *   where `source` is computed on the original file. Under
 *   `@vitejs/plugin-react` it would count lines of the transformed file,
 *   after the fast-refresh preamble, which is why the transform comes first.
 */
export declare const wrapperConfigSource: () => string;
/** Write Scamp's config into the project and keep `.scamp/` out of git. */
export declare const writeInstrumentation: (folder: string) => Promise<void>;
/** How Scamp runs the project's Vite, with its config, on `port`. */
export declare const viteCommand: (folder: string, port: number) => {
    command: string;
    args: string[];
    env: Record<string, string>;
};
