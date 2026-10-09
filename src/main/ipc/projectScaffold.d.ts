/** The `scampjs` range new projects pin: the version this build was tested with. */
export declare const SCAFFOLDED_SCAMPJS_RANGE: string;
import type { ComponentFile, ComponentKind, PageFile, ProjectFormat } from '@shared/types';
/**
 * Path on disk where a project's `theme.css` lives. Nextjs projects
 * co-locate it inside `app/` so the root layout can import it and
 * `next dev` picks up the tokens; legacy keeps it at the project root.
 */
export declare const themePathFor: (projectPath: string, format: ProjectFormat) => string;
/**
 * Scan a Next.js project's `components/` folder for reusable
 * component definitions. Each component is one folder under
 * `components/` containing `<Name>.tsx` + `<Name>.module.css`.
 * Folders missing either half are skipped silently — same
 * defensive read pattern as `readProjectNextjs` for pages.
 *
 * Legacy-format projects don't have components — callers should
 * skip this and return `[]` instead.
 */
export declare const readProjectComponents: (folderPath: string, kind?: ComponentKind) => Promise<ComponentFile[]>;
/**
 * Components and views as one list. The two share a namespace (the
 * store, thumbnails, and props types key by name), so a view whose
 * name a component already uses is skipped rather than shadowing it.
 */
export declare const readProjectComponentsAndViews: (folderPath: string) => Promise<ComponentFile[]>;
export declare const readProjectLegacy: (folderPath: string) => Promise<PageFile[]>;
/**
 * Read pages from a Next.js App Router project layout. The root page
 * lives at `app/page.tsx` and is keyed as `'home'` internally so the
 * rest of the app (sidebar labelling, component-name derivation, page
 * switching) works without special-casing. Additional pages live in
 * folders inside `app/` — e.g. `app/about/page.tsx` is keyed `'about'`.
 */
export declare const readProjectNextjs: (folderPath: string) => Promise<PageFile[]>;
/**
 * A `.gitignore` that ignores `.scamp` whole, rewritten to keep
 * `.scamp/agent-history/` — git can't re-include a file inside an
 * ignored folder, so the folder becomes `.scamp/*`.
 */
export declare const shareAgentHistory: (gitignore: string) => string;
/**
 * Write the Next.js App Router scaffold into a freshly-created
 * project folder. Creates `app/` (with the home page, layout, and
 * `theme.css` co-located so `next dev` picks up the tokens),
 * `public/assets/`, and the auto-generated `package.json` /
 * `next.config.ts` at the project root.
 *
 * Caller is responsible for creating the project directory itself
 * and for writing `scamp.config.json` (via `ensureProjectConfig`).
 */
export declare const scaffoldNextjsProject: (projectPath: string, projectName: string) => Promise<void>;
/**
 * Refresh `app/layout.tsx` if it byte-matches a known legacy template.
 * Called on project open so old projects pick up the body reset
 * (`margin: 0; min-height: 100vh`) without a manual edit. User-
 * customised layouts are left alone — `decideLayoutMigration` returns
 * `'warn'` and we surface a one-line hint via the main-process console
 * so users hitting "preview is blank" can find the cause.
 *
 * Idempotent: subsequent calls with the latest template are a no-op
 * (no log spam on repeat opens).
 */
export declare const refreshLayoutTemplateIfNeeded: (projectPath: string) => Promise<void>;
/**
 * Refresh \`agent.md\` AND its Claude Code loader \`CLAUDE.md\` to the
 * latest Scamp-shipped templates whenever the on-disk content
 * differs. Both files are fully Scamp-managed — \`agent.md\` is the
 * canonical agent instructions, \`CLAUDE.md\` is a tiny stub that
 * uses Claude Code's \`@./agent.md\` import syntax so sessions
 * auto-load the guidance on start. The managed-file marker at the
 * top of each template flags that hand-edits won't survive.
 *
 * Refreshing on open means new Scamp releases ship updated agent
 * guidance to every project on the next open without the user
 * having to think about it.
 *
 * Missing file → write it. Content matches latest → no-op. Anything
 * else → overwrite. The compare-first check skips the chokidar
 * event when there's no actual change.
 */
export declare const refreshAgentMdIfNeeded: (projectPath: string, format: ProjectFormat) => Promise<void>;
/**
 * Additively add Scamp's project-default theme rules to the project's
 * `theme.css` if missing — the `--font-sans` token, the universal
 * `box-sizing: border-box` reset, and the body-level font-family
 * rule. Used to carry projects scaffolded before these defaults
 * landed in `DEFAULT_THEME_CSS` forward without trampling user edits.
 *
 * Idempotent: running this on a project that already has all three
 * rules is a no-op. Strictly additive — never replaces or removes
 * existing declarations.
 */
export declare const ensureThemeDefaultsIfNeeded: (projectPath: string, format: ProjectFormat) => Promise<void>;
/**
 * Ensure the project's `tsconfig.json` declares the `@/*` path alias
 * so `next dev` can resolve `@/components/...` imports. Writes a fresh
 * template when the file is missing, and injects the alias into an
 * existing config that lacks it (e.g. the bare tsconfig `next dev`
 * auto-creates on first run). Already-aliased and user-customised
 * configs are left untouched. See docs/notes/tsconfig-alias.md.
 */
export declare const ensureTsConfigIfNeeded: (projectPath: string) => Promise<void>;
/**
 * Legacy flat-layout scaffold. Kept around for the migrator's
 * fixture-creation tests and for parity in the shared scaffold module.
 */
export declare const scaffoldLegacyProject: (projectPath: string) => Promise<void>;
/**
 * Scaffold a Scamp-framework project from `scampjs/templates`, so the
 * app and `create-scampjs` write identical files. The templates are
 * bundled into the main process (the package is a devDependency; only
 * this subpath is imported), and the scaffold pins the `scampjs`
 * version the app was built against, which is the version its
 * supported contract range was tested with. see docs/notes/nextjs-sunset.md
 */
export declare const scaffoldScampProject: (projectPath: string, name: string) => Promise<void>;
