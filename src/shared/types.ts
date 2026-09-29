/**
 * Shared types used by main, preload, and renderer.
 * All IPC payloads must have explicit types defined here.
 */

export type PageFile = {
  name: string;
  tsxPath: string;
  cssPath: string;
  tsxContent: string;
  cssContent: string;
};

/**
 * A reusable component definition. Lives at
 * `components/[Name]/[Name].tsx` + `[Name].module.css` inside a
 * Next.js-format project. Mirrors `PageFile`'s shape so the same
 * canvas / parse / generate / sync primitives can edit it.
 *
 * `name` is the PascalCase folder name (also the component's
 * React function name and the source-of-truth identifier
 * referenced by every instance's JSX tag and `import` line on
 * each page that uses it). Components are not supported in
 * legacy-format projects — `ProjectData.components` is always
 * an empty array there.
 */
/**
 * A view is a component with a page-sized canvas: same file shape
 * (props type, `className` passthrough, `_scamp` export), same editor,
 * but it lives under `views/<Name>/`, is never placed on a page as an
 * instance, and — in a Next.js project — previews through a one-line
 * wrapper page (`app/<slug>/page.tsx`) that renders it.
 * see docs/plans/framework-phase-1-plan.md, step 2
 */
export type ComponentKind = 'component' | 'view';

export type ComponentFile = {
  name: string;
  /** Absent means `'component'` (files written before views existed). */
  kind?: ComponentKind;
  tsxPath: string;
  cssPath: string;
  tsxContent: string;
  cssContent: string;
};

export const componentKindOf = (file: { kind?: ComponentKind }): ComponentKind =>
  file.kind ?? 'component';

/**
 * Two on-disk formats are supported:
 * - `legacy`: flat layout — `<page>.tsx` + `<page>.module.css` at the
 *   project root, assets in `assets/`, no `app/` folder.
 * - `nextjs`: Next.js App Router layout — pages live as
 *   `app/<page>/page.tsx` (root page is `app/page.tsx`), assets in
 *   `public/assets/`, with auto-generated `app/layout.tsx`,
 *   `next.config.ts`, and `package.json`.
 *
 * Existing projects keep working in legacy format. New projects are
 * created in nextjs format. Migration from legacy → nextjs is opt-in
 * via a banner.
 */
export type ProjectFormat = 'legacy' | 'nextjs' | 'scamp';

/** A scamp-format project's installed framework, read on open. */
export type FrameworkInfo = {
  /** `node_modules/scampjs` version, or null when not installed. */
  installedVersion: string | null;
  /** The contract that install implements, or null when not installed. */
  contract: number | null;
};

/** A route's rendering mode, the `render` export of a page route file. */
export type RouteRender = 'static' | 'server' | 'client';

/**
 * One file under `routes/` in a Scamp-framework project, as the Routes
 * list shows it. The framework owns the routing; the app only reads.
 * see docs/notes/routes-in-the-app.md
 */
export type RouteFile = {
  /** POSIX path relative to `routes/`, e.g. `game/[token]/lobby.tsx`. */
  file: string;
  kind: 'page' | 'api';
  /** The URL pattern: `/`, `/game/:token/lobby`, `/api/health`. */
  path: string;
  /** Page routes: the `render` export, `static` when the file has none. */
  render?: RouteRender;
  /** Page routes: the view under `views/` the file imports, when one. */
  view?: string;
};

export type ProjectData = {
  path: string;
  name: string;
  format: ProjectFormat;
  pages: PageFile[];
  /** Scamp-format projects: every file under `routes/`. */
  routes?: RouteFile[];
  /** Scamp-format projects: a database recipe is present (`lib/db.ts`). */
  hasDatabase?: boolean;
  /**
   * Reusable component definitions scanned from `components/` at
   * project open. Always an empty array for legacy-format
   * projects (the components feature requires the Next.js
   * App Router layout).
   */
  components: ComponentFile[];
  /** Present for `scamp`-format projects. see docs/plans/framework-phase-1-plan.md */
  framework?: FrameworkInfo;
};

export type RecentProject = {
  name: string;
  path: string;
  format: ProjectFormat;
  lastOpened: string;
};

/**
 * A project discovered by scanning the default projects folder one
 * level deep. Distinct from `RecentProject` — it has no open history,
 * just an on-disk presence and a freshly-detected format.
 */
export type ScannedProject = {
  name: string;
  path: string;
  format: ProjectFormat;
};

/**
 * A project surfaced on the Start Screen — the union of the recent-opens
 * store and a scan of the default projects folder, deduped by path. The
 * list shows every project in the default folder, not just the last few
 * opened. `lastOpened` is null for projects present on disk but never
 * opened in Scamp; `exists` is false for stale recents whose folder is
 * gone.
 */
export type StartScreenProject = {
  name: string;
  path: string;
  format: ProjectFormat;
  lastOpened: string | null;
  exists: boolean;
  /** Card background color from the project's `scamp.config.json`, if set. */
  cardBackground?: string;
  /** Free-text status from the project's `scamp.config.json`, if set. */
  state?: string;
  /**
   * Whether `.scamp/preview.png` exists. Sent with the list so a card with
   * no thumbnail renders its placeholder immediately instead of flashing
   * one in after a round-trip that was always going to return null.
   */
  hasThumbnail?: boolean;
};

export type ChooseFolderResult = {
  canceled: boolean;
  path: string | null;
};

export type Settings = {
  /** The folder under which `New Project` creates project subdirectories. */
  defaultProjectsFolder: string | null;
  /**
   * Background color of the artboard — the area behind the canvas.
   * @deprecated Moved to per-project config (`scamp.config.json`). Kept
   * on the type for one release so old installs don't crash on a
   * missing key; no UI reads from it.
   */
  artboardBackground: string;
  /**
   * Anonymous crash-reporting consent (Sentry).
   *
   *   `null`  — the user has not been asked yet; the first-launch
   *             opt-in prompt fires.
   *   `true`  — Sentry is initialised with the privacy-safe config.
   *   `false` — the user declined; no Sentry SDK code runs.
   *
   * Set explicitly by the opt-in prompt and by the Settings →
   * Privacy toggle. Defaults to `null` for fresh installs and for
   * any legacy install whose `settings.json` predates this field.
   */
  sentryOptIn: boolean | null;
  /**
   * Which version of the consent wording the stored `sentryOptIn`
   * answers.
   *
   * Bumped whenever what we send materially changes, so a stored
   * choice made against older wording is treated as undecided and the
   * prompt fires once more. Carrying an old opt-in forward would mean
   * claiming consent for something the user was never shown.
   *
   * `0` (or missing) = pre-versioning, i.e. the crash-reports-only
   * wording. See CONSENT_VERSION in `settingsOps.ts`.
   */
  consentVersion: number;
  /**
   * Anonymous, randomly-generated id for this install, used only to
   * count active users. Never derived from anything about the machine
   * or the person — see `src/main/installId.ts`.
   *
   * `null` until first needed, and reset to `null` on opt-out so
   * opting back in mints a fresh one.
   */
  installId: string | null;
  /**
   * App-chrome theme. Dark is the default; light is opt-in via
   * Settings → Appearance. Only the Scamp UI flips — the user's
   * project canvas renders with their own CSS regardless.
   */
  theme: AppTheme;
};

/** The app-chrome color themes Scamp ships. */
export type AppTheme = 'dark' | 'light';

/**
 * Per-project configuration persisted as `scamp.config.json` at the
 * project root. Holds settings that are scoped to one project rather
 * than the whole app (artboard colour, future: snap grid, default
 * element names, etc.). Non-CSS concepts live here; CSS-flavoured
 * concepts (colour tokens, font imports) live in `theme.css`.
 */
/**
 * One entry in a project's breakpoint table. The `id` is the stable
 * key used in `ScampElement.breakpointOverrides`; the `width` is the
 * `max-width` value written into the `@media` query. Desktop is
 * included as a breakpoint but has no `@media` wrapper — its
 * "overrides" are the element's top-level fields.
 */
export type Breakpoint = {
  id: string;
  label: string;
  width: number;
};

/** Stable id of the desktop breakpoint — treated specially throughout. */
export const DESKTOP_BREAKPOINT_ID = 'desktop';

export type ProjectConfig = {
  /** Background color of the artboard — the area behind the canvas. */
  artboardBackground: string;
  /**
   * Width of the canvas viewport frame in logical pixels. Purely a
   * design-tool preference — never written to the page CSS. Typical
   * presets: 390 (Mobile), 768 (Tablet), 1440 (Desktop), 1920 (Wide),
   * or any custom value.
   */
  canvasWidth: number;
  /**
   * When true, the viewport frame clips content that extends outside
   * its width. Useful for previewing how a layout behaves at a
   * specific width without content spilling. Does NOT affect the
   * root element's CSS.
   *
   * Retained for the COMPONENT editor (which has no breakpoints) and as
   * the legacy migration source for `canvasClipByBreakpoint`. Page-canvas
   * clip now lives in the per-breakpoint map below.
   */
  canvasOverflowHidden: boolean;
  /**
   * Page-canvas "Clip content" state, per breakpoint id (see
   * `config.breakpoints`). Present+`true` means the page canvas clips at
   * that breakpoint's width; absent/`false` means content spills with an
   * overflow indicator. Keyed by breakpoint so turning clip on at Mobile
   * doesn't affect Desktop. Custom (non-preset) widths read/write the
   * `desktop` key (the active breakpoint drops to desktop for a custom
   * width). Canvas-view-only — never affects CSS output.
   */
  canvasClipByBreakpoint?: Record<string, boolean>;
  /**
   * Fixed page-canvas height in logical px. Only honored when
   * `canvasFixedHeight` is true; otherwise the page canvas grows with
   * content. Lets the user simulate a specific screen height. Bounded by
   * the canvas-width range for symmetry. Canvas-view-only.
   */
  canvasHeight?: number;
  /**
   * When true, the page canvas uses `canvasHeight` as an exact height
   * (content beyond it clips or shows a vertical overflow indicator)
   * rather than growing with content. Canvas-view-only.
   */
  canvasFixedHeight?: boolean;
  /**
   * One-shot flag — set after the user has dismissed the canvas-size
   * migration banner. Once true, the banner never shows again for
   * this project even if subsequent opens somehow re-trigger the
   * migration detector.
   */
  canvasMigrationAcknowledged?: boolean;
  /**
   * Per-project dismissal of the legacy → nextjs migration banner.
   * Independent of `canvasMigrationAcknowledged` (different banner,
   * different prompt). Once true, the banner stays hidden until the
   * user re-opens the project after a manual migration; ProjectShell
   * also implicitly stops showing the banner once the project's
   * format flips to nextjs.
   */
  nextjsMigrationDismissed?: boolean;
  /**
   * Per-project dismissal of the nextjs → scamp migration banner, in
   * the same shape as `nextjsMigrationDismissed`.
   */
  scampMigrationDismissed?: boolean;
  /**
   * Auto-save snapshots (the 5-minutes-of-activity trigger). Enabled by
   * default; only stored when explicitly disabled (`false`). Disable it
   * if the 50-snapshot limit is being hit too often.
   */
  snapshotAutoSave?: boolean;
  /**
   * Responsive breakpoints for this project, ordered widest first.
   * Style edits in non-desktop mode land inside `@media
   * (max-width: Npx)` blocks keyed by each breakpoint's width.
   * Desktop (the widest) is the base — it has no `@media` wrapper.
   */
  breakpoints: Breakpoint[];
  /**
   * Per-component canvas dimensions for the component editor.
   * Keyed by PascalCase component name. Missing keys fall back
   * to `DEFAULT_COMPONENT_CANVAS_SIZE` so a brand-new component
   * gets a usable starting size without the user touching this
   * map. Mutated by the canvas-size control + the bottom-right
   * drag handle when the user resizes a component's canvas.
   *
   * Width / height are in logical pixels. Both are bounded by
   * MIN/MAX_CANVAS_WIDTH for symmetry with the page canvas
   * (height shares the same range — there's no reason a 4000px
   * tall design is illegal).
   *
   * Page canvas size lives at the top level (`canvasWidth`) and
   * grows vertically with content; only components have an
   * explicit height because their visible bounds are part of the
   * design intent.
   */
  componentCanvas?: Record<string, ComponentCanvasSize>;
  /**
   * Background color of this project's CARD on the Start Screen — distinct
   * from `artboardBackground` (the canvas backdrop). Lets users tint a
   * card to track status at a glance. Absent = the default card background.
   */
  cardBackground?: string;
  /**
   * Free-text status shown as a badge on the project's Start Screen card
   * (e.g. "in progress", "ready to review"). Absent / empty = no badge.
   */
  state?: string;
};

export type ComponentCanvasSize = {
  width: number;
  height: number;
};

export const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { id: DESKTOP_BREAKPOINT_ID, label: 'Desktop', width: 1440 },
  { id: 'tablet', label: 'Tablet', width: 768 },
  { id: 'mobile', label: 'Mobile', width: 390 },
];

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  artboardBackground: '#0f0f0f',
  canvasWidth: 1440,
  canvasOverflowHidden: false,
  breakpoints: DEFAULT_BREAKPOINTS,
};

/** Canvas-width bounds used by both the panel control and the parser. */
export const MIN_CANVAS_WIDTH = 100;
export const MAX_CANVAS_WIDTH = 4000;

/**
 * Component canvases can be much smaller than page canvases — a
 * button row at 240×40 is normal. Width and height share these
 * bounds and apply only in the component editor.
 */
export const MIN_COMPONENT_CANVAS_DIM = 20;
export const MAX_COMPONENT_CANVAS_DIM = 4000;

/**
 * Starting canvas size for a freshly-created component before the
 * user resizes it. Wide enough to fit a typical card / button
 * layout without feeling cramped; the user resizes via the drag
 * handle or the panel inputs as soon as the design needs it.
 */
/** A view's artboard height until resized; the width is the page canvas width. */
export const DEFAULT_VIEW_CANVAS_HEIGHT = 900;

export const DEFAULT_COMPONENT_CANVAS_SIZE: ComponentCanvasSize = {
  width: 480,
  height: 320,
};

/**
 * The artboard size for a component or view: the saved size, else the
 * kind's default — a view is a page's design and starts at the page
 * canvas width. The one place every reader of `componentCanvas` goes
 * through, so the size control, the viewport, and the canvas floor agree.
 */
export const componentCanvasSizeFor = (
  config: Pick<ProjectConfig, 'componentCanvas' | 'canvasWidth'>,
  name: string,
  kind: ComponentKind
): ComponentCanvasSize =>
  config.componentCanvas?.[name] ??
  (kind === 'view'
    ? { width: config.canvasWidth, height: DEFAULT_VIEW_CANVAS_HEIGHT }
    : DEFAULT_COMPONENT_CANVAS_SIZE);

export type ProjectConfigReadArgs = {
  projectPath: string;
};

export type ProjectConfigWriteArgs = {
  projectPath: string;
  config: ProjectConfig;
};

export type ThemeToken = {
  /** The CSS custom property name, e.g. `--color-primary`. */
  name: string;
  /** The resolved value, e.g. `#3b82f6`. */
  value: string;
};

/**
 * A theme in the design system's theme switcher. `light` is the default,
 * living in the `:root` block; other themes override semantic tokens
 * inside a CSS class block (`.dark`, `.theme-<slug>`).
 */
export type ThemeDef = {
  /** Stable id: 'light' for the :root default, else the class slug ('dark', 'high-contrast'). */
  id: string;
  /** Human label shown on the theme tab ('Light', 'Dark', 'High contrast'). */
  label: string;
  /** CSS class the theme's overrides live under; '' for the light/:root default. */
  cssClass: string;
};

export type CopyImageArgs = {
  sourcePath: string;
  projectPath: string;
};

/** Ask Google Fonts which of these families it serves. */
export type ResolveFontsArgs = { families: string[] };

/** One variable axis of a family, as Google's metadata describes it. */
export type GoogleFontAxis = { tag: string; min: number; max: number };

/**
 * Family → false when Google does not serve it, or its variable axes
 * when it does. An empty array means Google has the family but reports
 * no axes, which is a static font.
 *
 * Axes are here rather than derived later because Google INSTANCES a
 * font to whatever axes the stylesheet URL names — so a family whose
 * axes we don't know gets frozen at its defaults, and an optical-size
 * face renders visibly wider than the page it came from.
 * see docs/notes/import-variable-fonts.md
 */
export type ResolveFontsResult = Record<string, false | GoogleFontAxis[]>;

/** Fetch a remote image into the project's assets. see website-import-plan.md */
export type FetchImageArgs = {
  /** Absolute http(s) URL as the capture resolved it, or a `data:` URL. */
  url: string;
  projectPath: string;
  /**
   * File name to save under, without an extension. Only used for a
   * `data:` URL, which carries no path to take a name from — an inline
   * icon would otherwise land as `image.svg`, then `image-1.svg`, and
   * nothing in the project would say which was which.
   */
  assetName?: string;
};

export type FetchImageResult =
  | { ok: true; relativePath: string; fileName: string }
  | { ok: false; error: string };

export type CopyImageResult = {
  relativePath: string;
  fileName: string;
  /**
   * True when the chosen file was ALREADY the asset at that path, so
   * nothing was written. The IPC handler uses this to skip its watcher
   * suppression — suppressing a write that never happened would swallow
   * the next real external edit to that file.
   * see docs/plans/reuse-existing-assets-plan.md
   */
  reused: boolean;
};

export type ChooseImageArgs = {
  /** Optional directory to open the dialog in (e.g. project assets folder). */
  defaultPath?: string;
};

export type ChooseImageResult = {
  canceled: boolean;
  path: string | null;
};

/**
 * OS clipboard contents relevant to a canvas paste. `svg` carries the
 * raw markup (inlined as an editable element); `image` carries a PNG
 * data URL (saved to assets and referenced as `<img>`); `empty` means
 * nothing pasteable. see docs/plans/svg-improvements-plan.md
 */
export type ClipboardReadResult =
  | { kind: 'svg'; svg: string }
  | { kind: 'image'; dataUrl: string }
  | { kind: 'empty' };

export type ClipboardSaveImageArgs = {
  projectPath: string;
  /** A `data:image/png;base64,…` URL (from clipboard.readImage). */
  dataUrl: string;
};

export type CreateProjectArgs = {
  /** The directory in which to create the new project subfolder. */
  parentPath: string;
  /** The validated project name — used as both the folder name and display name. */
  name: string;
  /**
   * The layout to scaffold. Defaults to `scamp`, the Scamp framework
   * structure written from `scampjs/templates`. `nextjs` is kept for
   * tests and for the frozen Next.js path. see docs/notes/nextjs-sunset.md
   */
  format?: 'nextjs' | 'scamp';
};

export type OpenProjectArgs = {
  folderPath: string;
};

export type FileWriteArgs = {
  tsxPath: string;
  cssPath: string;
  tsxContent: string;
  cssContent: string;
  /**
   * Optimistic concurrency: when both `expected*` fields are
   * present, main reads the current disk content and refuses the
   * write if either path's content has drifted since the renderer
   * last serialized. Used by the syncBridge's debounced flush to
   * avoid clobbering an external agent's edit that landed between
   * the previous save and this one. See
   * docs/notes/agent-coexistence.md. Callers that don't care about
   * conflicts (export, scaffolds, migrate) omit both and main
   * skips the pre-write read.
   */
  expectedTsxContent?: string;
  expectedCssContent?: string;
};

export type FilePatchArgs = {
  cssPath: string;
  className: string;
  newDeclarations: string;
  /**
   * When present, the patch operates on the class rule INSIDE an
   * `@media (max-width: Npx)` block rather than on the base class.
   * The at-rule is created if it doesn't already exist; the class
   * rule is created inside it if missing. Omit for a base-class
   * patch (existing behavior).
   */
  media?: { maxWidth: number };
};

export type FileChangedPayload = {
  path: string;
  tsxContent: string | null;
  cssContent: string | null;
  /**
   * Set when the change is one of Scamp's own registered writes that
   * deliberately let the broadcast through (the CSS panel's `file:patch`).
   * The renderer reloads from it but must not treat it as an external
   * edit — no quiet window, no "Paused". see docs/notes/save-status-machine.md
   */
  ownWriteId?: string;
};

/**
 * Emitted by main when an imported SVG's asset file changes on disk
 * (external edit). `fileName` is the asset's basename; the renderer
 * matches it against inline SVG elements' `data-scamp-svg-src` to offer a
 * reload. `content` is the new file text. see
 * docs/plans/svg-color-editing-plan.md
 */
export type SvgAssetChangedPayload = {
  fileName: string;
  content: string;
};

/**
 * Emitted by main once a chokidar stability event confirms a write
 * initiated by the renderer has settled on disk. Correlated by
 * `writeId` — the opaque id returned from `file:write` / `file:patch`.
 *
 * Per-path (tsx and css acks arrive as separate events) so the renderer
 * can track which sibling has landed.
 */
export type FileWriteAckPayload = {
  writeId: string;
  path: string;
};

export type FileWriteResult =
  | { ok: true; writeId: string }
  | {
      ok: false;
      conflict: {
        /** Disk content at the moment main rejected the write. */
        actualTsxContent: string;
        actualCssContent: string;
      };
    };

export type FilePatchResult = {
  writeId: string;
};

/** Opening the import window. One per project, like the preview. */
export type ImportOpenArgs = {
  projectPath: string;
  /** Where to start. Omitted for a blank URL bar. */
  url?: string;
  /**
   * The project's breakpoints, widest first. The importer re-reads the
   * page at each narrower width so the view arrives responsive rather
   * than correct at one size.
   */
  breakpoints?: Breakpoint[];
};

/** The import window handing a captured page to the app window. */
export type ImportCapturedArgs = {
  projectPath: string;
  /** A `CapturePayload`; typed as unknown here so `shared/types` stays
   *  free of the capture contract, which the app window owns. */
  payload: unknown;
  /**
   * The same page read at each narrower breakpoint, for the overrides.
   * Empty when the importer could not take them — a base import must
   * never depend on these.
   */
  narrower?: Array<{ breakpointId: string; payload: unknown }>;
};

/** One kind of thing the import changed or dropped. */
/**
 * How faithfully one kind of thing survived the import.
 *
 * Four levels rather than lost/kept, because pixels and editability are
 * separate axes and a boolean hides that. An inline icon kept as markup
 * renders perfectly and cannot be edited as shapes — a pixel diff scores
 * it 100%, which is exactly the loss a boolean cannot express.
 * see docs/agent-native-review.md
 */
export type ImportFidelity =
  /** Pixels and editable semantics both survived. */
  | 'exact'
  /** Representable, but not identically. */
  | 'approximated'
  /** It renders, but you cannot edit it the way you could on the page. */
  | 'rendered-fallback'
  /** It did not come across at all. */
  | 'lost';

export type ImportReportGroup = {
  kind: string;
  /** One sentence, already pluralised for `count`. */
  label: string;
  count: number;
  /** Where, as the capture described it. A few, not all. */
  examples: string[];
  fidelity: ImportFidelity;
  /** For a fallback: what you CAN still change. Absent otherwise. */
  editable?: string;
};

/** What became of an import, sent back so the import window can say so. */
export type ImportResultPayload = {
  projectPath: string;
  ok: boolean;
  /** The created view's name, when it worked. */
  viewName?: string;
  /** How many elements the page reduced to. */
  elementCount?: number;
  /**
   * What the import changed or could not carry, grouped by kind.
   *
   * Structured rather than pre-formatted strings: the window shows
   * counts and a few locations per group, and a flat list of 300 lines
   * would be unreadable exactly when it matters most.
   */
  findings?: ImportReportGroup[];
  error?: string;
};

export type PageCreateArgs = {
  projectPath: string;
  pageName: string;
};

export type PageDeleteArgs = {
  projectPath: string;
  pageName: string;
};

export type PageDuplicateArgs = {
  projectPath: string;
  sourcePageName: string;
  newPageName: string;
};

export type PageRenameArgs = {
  projectPath: string;
  oldPageName: string;
  newPageName: string;
};

export type ComponentCreateArgs = {
  projectPath: string;
  /** PascalCase folder + component name. Caller is responsible for
   *  slugifying user input before sending — main re-validates. */
  componentName: string;
  /** `'view'` writes to `views/<Name>/`; default `'component'`. */
  kind?: ComponentKind;
  /**
   * Views only. The page slug whose `app/<slug>/page.tsx` becomes the
   * one-line wrapper that renders the view (`'home'` means
   * `app/page.tsx`). Null or absent: no wrapper is written.
   */
  wrapperSlug?: string | null;
  /**
   * Views only, with `wrapperSlug`. Overwrite an existing page at that
   * slug with the wrapper and delete its CSS module — the "convert page
   * to view" path. Without it an existing page is left alone.
   */
  replacePage?: boolean;
  /**
   * Optional initial TSX content. When omitted, the scaffold's
   * default `<div data-scamp-id="root"/>` template is written.
   * The convert-to-component flow passes pre-generated content
   * built from the source page subtree so the new component
   * captures the user's existing design as its initial body.
   */
  tsxContent?: string;
  /**
   * Optional initial CSS-module content. Paired with `tsxContent`
   * for the convert-to-component flow. Omitted callers get the
   * default blank `.root {}` block.
   */
  cssContent?: string;
};

export type ComponentDeleteArgs = {
  projectPath: string;
  componentName: string;
  kind?: ComponentKind;
};

export type ComponentReadArgs = {
  projectPath: string;
  componentName: string;
  kind?: ComponentKind;
};

/**
 * Write a small canvas thumbnail next to the sidebar component
 * row. The renderer passes a `data:image/png;base64,…` URL
 * captured via `html-to-image`; main decodes + writes to
 * `<projectPath>/.scamp/component-thumbs/<Name>.png`, creating
 * the parent directory tree if missing. Thumbnail capture is
 * best-effort: failures are surfaced via the return value but
 * don't propagate to the save indicator since the underlying
 * component save already succeeded.
 */
export type ClipboardWriteArgs = {
  text: string;
};

export type ContextWriteArgs = {
  projectPath: string;
  /** The whole file, already rendered by `buildContextMarkdown`. */
  content: string;
};

/**
 * One MCP tool call, forwarded from the main process to the renderer so it
 * can answer from live canvas state. See docs/plans/mcp-server-plan.md.
 */
export type McpQueryArgs = {
  /** Correlates the reply — main may have several calls in flight. */
  requestId: string;
  tool: string;
  args: Record<string, unknown>;
};

/**
 * The renderer's answer. `ok: false` carries a message the agent can act on
 * rather than a thrown error that would kill its turn.
 */
/** What the terminal indicator needs to describe the server. */
export type McpStatusResult = {
  running: boolean;
  /** Null when the server isn't running. */
  url: string | null;
  /** Null when the server isn't running. Already on disk in
   *  `.scamp/mcp.json`; surfaced so the UI can build a connect command. */
  token: string | null;
  /** Agent config files Scamp registered this session. */
  registered: ReadonlyArray<string>;
  /** An agent has sent at least one authenticated request this session —
   *  the difference between "we're listening" and "someone's talking". */
  agentConnected: boolean;
  /** Agents whose own config disables this server for the project: the
   *  user declined a prompt there, and it won't connect until reset. */
  disabledIn: ReadonlyArray<string>;
};

export type McpQueryResultArgs = {
  requestId: string;
} & ({ ok: true; data: unknown } | { ok: false; error: string });

export type ComponentWriteThumbnailArgs = {
  projectPath: string;
  componentName: string;
  /** `data:image/png;base64,…` URL captured client-side. */
  dataUrl: string;
};

export type ComponentWriteThumbnailResult =
  | { ok: true; thumbnailPath: string }
  | { ok: false; error: string };

export type ComponentReadThumbnailArgs = {
  projectPath: string;
  componentName: string;
};

/**
 * Returned as a base64 PNG string (no `data:` prefix). Renderer
 * wraps it for `<img src>` rendering. Null when no thumbnail has
 * been written for this component yet — sidebar then renders a
 * placeholder.
 */
export type ProjectWriteThumbnailArgs = {
  projectPath: string;
  /** `data:image/png;base64,…` URL, already cropped to the card aspect. */
  dataUrl: string;
};

export type ProjectWriteThumbnailResult =
  | { ok: true; thumbnailPath: string }
  | { ok: false; error: string };

export type ProjectReadThumbnailArgs = {
  projectPath: string;
};

/**
 * Base64 PNG (no `data:` prefix), or null when the project has never been
 * saved since thumbnails shipped. The card falls back to its
 * `cardBackground` colour.
 */
export type ProjectReadThumbnailResult = {
  base64: string | null;
};

export type ComponentReadThumbnailResult = {
  base64: string | null;
};

// ---- Project snapshots ----
// Persistent point-in-time copies of all page + component files, stored
// under `.scamp/snapshots/`. See docs/notes/snapshots.md.

export type SnapshotTrigger =
  | 'session_open'
  | 'agent_edit'
  | 'session_close'
  | 'manual'
  | 'auto_save'
  | 'before_restore';

export type SnapshotMeta = {
  id: string;
  /** ISO 8601 UTC timestamp the snapshot was taken. */
  timestamp: string;
  trigger: SnapshotTrigger;
  /** Display label (e.g. "External edit — page.module.css", a manual name). */
  label: string;
  /** Number of pages captured at snapshot time. */
  pageCount: number;
};

export type SnapshotCreateArgs = {
  projectPath: string;
  trigger: SnapshotTrigger;
  /**
   * Trigger detail: the user-typed name for `manual`, the changed
   * filename for `agent_edit`. Ignored for the time-based triggers.
   */
  label?: string;
};
/** `snapshot: null` means the create was collapsed or silently failed. */
export type SnapshotCreateResult = { snapshot: SnapshotMeta | null };

export type SnapshotListArgs = { projectPath: string };
export type SnapshotListResult = { snapshots: SnapshotMeta[] };

export type SnapshotRestoreArgs = { projectPath: string; snapshotId: string };
export type SnapshotRestoreResult =
  | { ok: true; snapshotId: string }
  | { ok: false; error: string };

export type SnapshotDeleteArgs = { projectPath: string; snapshotId: string };
export type SnapshotDeleteResult = { ok: boolean };

/**
 * Read one page's `.tsx` + `.css` from a snapshot WITHOUT restoring —
 * powers the read-only preview. `tsxPath` / `cssPath` are the project's
 * current absolute page paths; the snapshot mirrors the project layout so
 * they map straight in. Either field is `null` when the snapshot doesn't
 * contain that file (e.g. a page added after the snapshot was taken).
 */
export type SnapshotReadPageArgs = {
  projectPath: string;
  snapshotId: string;
  tsxPath: string;
  cssPath: string;
};
export type SnapshotReadPageResult = { tsx: string | null; css: string | null };

export type ProjectMigrateArgs = {
  projectPath: string;
};

/**
 * Result of a successful legacy → nextjs migration. Carries the
 * post-migration project so the renderer can refresh its view, plus
 * the path to the kept-on-disk backup (so the UI can surface it as
 * "your originals are at <path> in case you need them").
 */
export type ProjectMigrateResult = {
  project: ProjectData;
  backupPath: string;
  /**
   * Files the migration didn't own and left in place, project-relative,
   * for the UI to surface. Always empty for legacy → nextjs today.
   */
  unmovedFiles: string[];
};

// Routes IPC payloads (Scamp-framework projects)
export type RoutesListArgs = { projectPath: string };
export type RouteReadArgs = { projectPath: string; file: string };
export type RouteSetRenderArgs = { projectPath: string; file: string; render: RouteRender };
/** Writes a new route file; refused when the file exists. */
export type RouteWriteArgs = { projectPath: string; file: string; content: string };
/** Follow a renamed view into the route that renders it. */
export type RouteRenameViewArgs = {
  projectPath: string;
  oldView: string;
  newView: string;
};
export type DevVarsReadArgs = { projectPath: string };
/** `.dev.vars` keys only: values never leave the main process. */
export type DevVarsReadResult = { exists: boolean; keys: string[] };

/** One line of `scamp dev --json`, forwarded to the app log. */
export type DevServerLogPayload = {
  projectPath: string;
  level: 'info' | 'error';
  message: string;
};

// Preview-mode IPC payloads

/**
 * Lifecycle of a per-project dev server.
 *
 *   - `idle`: no server registered for this project (defensive
 *     fallback; openPreview always kicks at least `installing` or
 *     `starting` immediately).
 *   - `installing`: `npm install` is running because `node_modules`
 *     was missing on first open. Logs accumulate so the preview
 *     window can show a tail.
 *   - `starting`: deps are present, `next dev` has been spawned, we
 *     haven't yet seen the "ready" line in stdout.
 *   - `ready`: dev server is accepting requests on `port`. The
 *     preview window's webview is safe to navigate.
 *   - `crashed`: the process exited non-zero before reaching ready,
 *     OR exited unexpectedly after reaching ready. UI shows the
 *     log tail + a Restart button.
 */
export type DevServerStatus =
  | { kind: 'idle' }
  | { kind: 'installing'; logs: ReadonlyArray<string> }
  | { kind: 'starting'; port: number; logs: ReadonlyArray<string> }
  | { kind: 'ready'; port: number; logs: ReadonlyArray<string> }
  | { kind: 'crashed'; logs: ReadonlyArray<string>; exitCode: number };

export type PreviewOpenArgs = {
  projectPath: string;
  /** Page name to navigate the preview to on open (e.g. `"home"` →
   *  `/`, `"about"` → `/about`). */
  pageName: string;
  /**
   * Full list of page names in the project. Surfaced as a dropdown
   * in the preview window's URL bar so the user can jump between
   * pages without going back to the main window. Order matches the
   * canvas sidebar (alphabetical with `home` first).
   */
  pageNames: ReadonlyArray<string>;
  /** See `PreviewNavigatePayload.routes`. */
  routes?: Readonly<Record<string, string>>;
};

export type PreviewStopArgs = {
  projectPath: string;
};

export type PreviewRestartArgs = {
  projectPath: string;
};

export type PreviewGetStatusArgs = {
  projectPath: string;
};

/**
 * Pushed from main to the preview-window renderer whenever the
 * dev server's status changes. Carries the project path so a single
 * preview window listening to multiple projects (future) can
 * disambiguate; today every preview window listens to exactly one
 * project.
 */
export type PreviewStatusChangedPayload = {
  projectPath: string;
  status: DevServerStatus;
};

/**
 * Pushed from main to the preview-window renderer when the parent
 * (canvas) wants the preview to navigate to a specific page —
 * triggered by Cmd+P on a different page than the preview is
 * currently showing — or when the project's page list changes
 * (page added / renamed / deleted in the canvas) so the dropdown
 * stays accurate. The renderer treats `pageName === current` as a
 * no-op for navigation but still picks up an updated `pageNames`.
 */
export type PreviewNavigatePayload = {
  pageName: string;
  pageNames: ReadonlyArray<string>;
  /**
   * Route per page name, when the default `/` and `/<name>` mapping
   * doesn't apply. A Scamp-framework project previews each view at
   * `/_views/<Name>` and lists it by its slug.
   */
  routes?: Readonly<Record<string, string>>;
};

// Terminal IPC payloads
export type TerminalCreateArgs = {
  cwd: string;
  cols: number;
  rows: number;
};

export type TerminalCreateResult = {
  id: string;
};

export type TerminalWriteArgs = {
  id: string;
  data: string;
};

export type TerminalResizeArgs = {
  id: string;
  cols: number;
  rows: number;
};

export type TerminalKillArgs = {
  id: string;
};

export type TerminalDataPayload = {
  id: string;
  data: string;
};

export type TerminalExitPayload = {
  id: string;
  exitCode: number;
};

/**
 * Foreground-process status for a pty. Emitted by the main-side
 * poller whenever the pty's foreground command changes.
 *
 *   - `processName: null` — pty is at a shell prompt (idle). The
 *     foreground process is the shell itself.
 *   - `processName: 'claude' | 'aider' | …` — a non-shell command
 *     is currently in the foreground; an agent is presumed running.
 *
 * The renderer's `terminalActivitySlice` maintains a per-terminal
 * map and a derived `anyAgentActive` selector. The sync bridge
 * subscribes to that selector and pauses when any pty is busy.
 */
export type TerminalForegroundProcessPayload = {
  id: string;
  processName: string | null;
};

/**
 * Returned by `test:getBootstrap`. Off in normal usage; only populated
 * when the app is launched with `SCAMP_E2E=1`. The renderer uses this
 * to skip the Start Screen and auto-open a test project.
 */
export type TestBootstrap = {
  e2e: boolean;
  autoOpenProjectPath: string | null;
};

// ---- Auto-update IPC payloads ----------------------------------------

/**
 * Subset of electron-updater's `UpdateInfo` forwarded to the renderer.
 * The main process maps the full object down to this minimal shape so
 * neither shared nor renderer code has to import electron-updater's
 * main-only types. See docs/notes/auto-update.md.
 */
export type UpdaterInfoPayload = {
  version: string;
};

/** Subset of electron-updater's `ProgressInfo` for the download banner. */
export type UpdaterProgressPayload = {
  /** 0–100. */
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

// ---- Export IPC payloads ---------------------------------------------

export type ExportFormat = 'png' | 'svg';

export type ExportChooseSavePathArgs = {
  /** Suggested filename (no extension — the handler appends it). */
  filename: string;
  format: ExportFormat;
  /** Default folder hint, typically the project path. */
  defaultDir?: string;
};

export type ExportChooseSavePathResult = {
  canceled: boolean;
  path: string | null;
};

export type ExportPngArgs = {
  /** Captured PNG as a base64 data URL (`data:image/png;base64,…`). */
  dataUrl: string;
  path: string;
};

export type ExportSvgArgs = {
  svgString: string;
  path: string;
};

export type ExportResult = {
  ok: boolean;
  /** Populated on failure — short, user-readable. */
  error?: string;
};

/**
 * The signed-in identity, as the renderer sees it. Display data only —
 * the session token never leaves the main process, and the server
 * re-checks authority on every request.
 */
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

export type AuthStatusResult = {
  signedIn: boolean;
  user?: AuthUser;
};

export type AuthSignInResult =
  | { status: 'signed-in'; user: AuthUser; persisted: boolean }
  | { status: 'cancelled' }
  | { status: 'timeout' }
  | { status: 'failed'; message: string };

/** One text file in an HTML export, at a path relative to the export root. */
export type ExportHtmlFile = {
  path: string;
  contents: string;
};

export type ExportHtmlChooseFolderResult = {
  canceled: boolean;
  path: string | null;
};

export type ExportHtmlArgs = {
  /**
   * The folder the user picked through `ExportHtmlChooseFolder` — the
   * PARENT the export folder is created inside, not the export folder
   * itself. Main derives that name, so the renderer can't choose where
   * the write lands.
   */
  parentDir: string;
  /** Source project — the assets folder is copied from it. */
  projectPath: string;
  projectName: string;
  files: ExportHtmlFile[];
};

/**
 * `reason: 'occupied'` is retained for callers that distinguish it, but the
 * export no longer refuses a non-empty destination: it creates its own
 * folder inside the chosen one and steps over any name already taken.
 */
export type ExportHtmlResult =
  | {
      ok: true;
      /** The folder actually created, inside the chosen parent. */
      targetDir: string;
      fileCount: number;
      assetCount: number;
    }
  | {
      ok: false;
      error: string;
      reason?: 'occupied';
    };
