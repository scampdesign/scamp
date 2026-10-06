# Importing a React app into Scamp — tech plan

Give Scamp a React project folder; it imports the app's pages as views,
the way the HTML importer imports a URL. SCMP-102. Split out of
[`builtin-agent-plan.md`](builtin-agent-plan.md) on 2026-10-05; this
replaces the scoping draft of the same name (2026-10-06).

Test project throughout: `riq_design/riq_frontend_demo` — React 19,
Vite, React Router 7, MUI + Emotion, 105 CSS/SCSS files, Azure MSAL
behind a dev-only sign-in bypass, 48 routes.

---

## What we measured before planning

Everything below was run against the test project's dev server, with
the current importer and no new code.

| Question | Answer |
|---|---|
| Does render-then-capture work on a real React app? | Yes. `scripts/import-pixels.mjs` on four routes, unchanged: `/patients` **95.6%**, `/billing/dashboard` **95.2%**, `/intake` 91.8%, `/history` 91.4% |
| Can a static parse of the router find the routes? | Not well: 26 `path:` literals in `router.tsx`. Six Rx routes come from `Object.entries(RX_TOOL_ROUTES).map(…)` and another 16 are nested under it |
| Can the running app tell us? | Yes. The `RouterProvider` fiber's `props.router.routes` gives all **48**, computed ones included |
| Can crawling links find them? | No. The sidebar navigates with `<button onClick={navigate}>`, not `<a>` |
| Do routes render as themselves headlessly? | 18 of 19 checked. `/dashboard` redirects to `/setup`: a setup gate reads session state |
| Does the page know which React component drew each element? | Yes, in dev builds. Each DOM node's `__reactFiber$…` gives the owner chain (`AppSidebar → AppFrame → FramedPage`) and, through `_debugStack`, the JSX call site (`app-sidebar.tsx:102:72`) |

The last row is what makes this plan work. React 19 dropped
`_debugSource`, but `_debugStack` still names the file, line and
column, and the 13 sidebar items all share one call site — line 102,
the `.map()`.

---

## The approach: render, capture, and read React's own tree

The scoping draft offered **A** (render the app, capture it) and **B**
(read the source), and guessed a hybrid. The measurements settle it,
and the hybrid needs less source-reading than it guessed:

- **What a view looks like** comes from the browser, through the
  existing capture and `reduceCapture`. Fidelity is measured, not
  inferred, and every importer fix (this week's grid areas, size rules,
  shorthand folding) applies to React imports for free.
- **What a view is made of** — which subtree is `AppSidebar`, which
  rows came from one `.map()` — comes from React's fiber tree, read by
  the capture script in the same pass. No Babel, no bundler plugin, no
  parsing of CSS-in-JS: React already knows.
- **The source files** are read only for names: the list a `.map()`
  iterates (`navItems.map(` on line 102) and, in the AI pass, the
  conditions behind what one render can't show.

Approach B (source only) stays out. It can't check itself, and this
app's styling — global classes, SCSS, Emotion, MUI — is exactly what it
would have to resolve by hand.

---

## Pipeline

```
React folder
  │ 1. intake: package.json → framework, dev script, router
  ▼
dev server (Scamp starts it, or the user gives a URL)
  │ 2. routes: read the live router; the user picks routes, fills :params
  ▼
import window, one route at a time, every breakpoint
  │ 3. capture  (+ react: owners, call site, component props per node)
  ▼
reduceCapture per route                         ← unchanged
  │ 4. components: one Scamp component per React component seen
  │    with the same shape; slots for wrappers; text props from fiber props
  │ 5. repeats: siblings from one call site → repeat + samples
  │ 6. tokens: the app's own custom properties, where it used them
  ▼
views + components + theme + assets, written in one transaction
  │ 7. (optional) AI pass: react-import skill, with the source to read
  ▼
.scamp/react-import.json  ← route → view map, for re-import
```

### 1. Intake

New `src/main/reactImport/detect.ts` (pure, tested on fixture
`package.json`s): framework (`vite`, `next`, `react-scripts`), the dev
script, package manager (lockfile), router (`react-router`,
Next `app/` or `pages/`), and whether `node_modules` exists.

Unsupported in v1, said plainly: React Native, Remix/Gatsby
specifics, apps with no dev server.

### 2. Run it and find its routes

- **The dev server.** Generalise `src/main/devServer/devServerManager.ts`
  (port allocation, ready detection, log tail, stop on quit) to run a
  foreign app's `dev` script with the port passed the framework's way
  (`--port` for Vite, `-p` for Next, `PORT=` for CRA). Running a
  project's code needs a yes from the user, every time. Missing
  `node_modules` offers `npm install` (or the lockfile's manager) with
  the log visible. **Or** the user pastes the URL of a server already
  running — the cheapest path, and Phase 1's first one.
- **Routes.** Read the live router from the page: React Router's
  `RouterProvider` / data router props, falling back to walking
  `<Routes>` elements in the fiber tree. Next.js: the `app/` and
  `pages/` directories on disk, which *are* the route table. `*` and
  auth routes (`/login`, `/session/*`) are unticked by default.
- **Params.** `/patients/:patientId` needs a sample. The picker
  suggests one by visiting the parent route and collecting rendered
  values that fit (`href`s, then `navigate` targets seen in
  `onClick` props on the fiber); the user can type their own.

### 3. Capture, with React's tree

The import window drives the routes: load, wait for network idle and
fonts, capture at the widest breakpoint, then each narrower one —
exactly what `ImportApp.tsx` does for one URL today. Its `<webview>`
gets a persistent partition per React project, so a sign-in or a
finished setup survives between routes and between imports.

- **Redirects are reported, not imported.** A route whose final URL
  differs (`/dashboard → /setup`) is flagged in the picker. The window
  is a real browser: the user can click through to the state they want
  and press **Capture this page**, which records that route as captured.
- **`captureScript.ts` gains a `react` field per node**, only when a
  fiber is present (so HTML imports are untouched):
  `{ owners: string[]; site?: string; key?: string }`. `owners` lists
  user components only — frames under `node_modules` (MUI's `ButtonBase`,
  Router internals) are dropped, by the `_debugStack` URL. `site` is the
  JSX call site, project-relative. Component props are recorded once
  per component instance, primitives only, for naming.
- `CAPTURE_VERSION` bumps; the reducer ignores `react` until Phase 3.

### 4. Components

New pure module `src/renderer/lib/reactComponents.ts` over all the
routes' reduced trees plus their `react` annotations.

- **A component instance's root** is a node whose nearest user owner
  differs from its parent's. Single-root components only in v1;
  fragments are reported.
- **Same component** = same React name and the same shape (tags and
  child structure, ignoring text) across occurrences, in any view. Two
  or more → one Scamp component, named after the React one.
- **Text that varies** between instances becomes a text prop. Its name
  comes from the instance's fiber props when a prop holds that exact
  string (`IconButton`'s `label="Close menu"` → `label`); otherwise
  `text`, `text2`.
- **A wrapper whose content varies by page** — `FramedPage`, `AppFrame`
  — becomes a component with a `children` slot. Every route's view is
  then the shell instance with the page inside it. That's the single
  biggest structural win on the test app: the sidebar and top bar
  appear once in the project instead of 18 times.
- **Styles that differ by instance** (the active nav item's `is-active`)
  have no home in Scamp's instance model. v1 takes the most common
  form for the component and reports the rest by name. See *Open
  problems*.
- Built on what the agent already uses: `generateComponentFromSubtree`
  and `replaceSubtreeWithInstancePure`.

### 5. Repeats

Two or more siblings with the same call site and the same shape are one
`.map()`. They become one element with `repeat: { over, as }`, the rows
as `samples` on the view root, and the varying texts as row fields.

- `over` is the identifier before `.map(` on the call site's source line
  (`navItems`), read from the project in main. Fallback: `items`.
- Row field names follow the same rule as text props, using the row
  component's fiber props when there is one.
- A repeat inside a component makes the list a prop of the component.

### 6. Tokens: the app's own, where it used them

The test app declares its design system as custom properties
(`--surface-nav`, `--space-6`, `--radius-md`, with `[data-theme]`
variants). The token mode question stays as the agent beta has it:

- **Keep hex values** — today's literal import, unchanged.
- **Create theme tokens** — deterministic, and unlike the counting
  approach removed in `20ea369`, it guesses nothing. The capture records
  which properties an element got from an authored `var(--x)` (matched
  rules via CSSOM), and only those are written as `var(--x)`. The app's
  `:root` and `[data-theme]` custom properties become `theme.css`
  tokens and themes. A colour the app wrote literally stays literal.

Import into a **new Scamp project per React app** by default, so its
tokens never collide with another site's
([`../notes/import-token-collisions.md`](../notes/import-token-collisions.md)).

### Fonts and assets

A React project has its fonts on disk (`public/fonts/InterVariable.woff2`).
`importFonts.ts` today chooses between installed and Google; add a third
source, **the project's own files**, copied into the Scamp project with
an `@font-face`. That also closes the font substitution in the parity
log. Images go through `fetchImportImage` as now, from the dev server.

### 7. The AI pass (optional)

A second skill beside `import-cleanup`: `react-import`, with one extra
read tool, `scamp_get_react_source(view, element)`, which returns the
JSX around an element's call site. Its jobs are the ones one render
can't do: conditions for `showIf` (`{isLate && <Badge/>}`), better
prop and row names, and the active-state leftovers. It runs per view
with the token mode already decided, plan then apply, and **Undo AI
session** covers the batch.

### Re-import

`.scamp/react-import.json` maps route → view, component → Scamp
component, and the React project path. A re-import updates the mapped
views in place instead of adding `PatientList2`, and starts each
updated view's agent conversation fresh.

---

## Phases

Each phase ships something usable and is measured on the eval below.

### Phase 0 — the eval — **done**

`node scripts/react-import-eval.mjs <dir or url> [/route …]`. Given a
folder it reads it with `detect.ts` and starts the dev server on a free
port (and stops it); given a URL it uses that server. Routes come from
the running router (`reactRoutes.ts`), or name them. Per route: whether
it rendered as itself, pixel match, findings per element, the view's
round trip, and what React's tree offers Phases 3 and 4 — user
components and call-site sibling groups. Results in `.react-eval/`.

The pixel measurement moved into `scripts/lib/pixelHarness.mjs`, shared
with `import-pixels.mjs`, so the two can't drift.

**Baseline** (riq_frontend_demo, 2026-10-06, the importer as of
`47dd4a2`, no React-specific code):

| | |
|---|---|
| Routes in the router / visitable as they stand | 48 / 42 |
| Measured / redirected | 39 / 3 (`/ → /login`, `/dashboard → /setup`, `/appointment/patient-details/upload → /setup`) |
| Pixels | mean **94.1%**, median 95.1%, lowest 85.0% (`/org-manager/people`); 20 of 39 at 95% or better |
| Findings per element | mean 0.08 |
| Round trip | ok on every route |
| Components drawn on 2+ routes | 48 — `AppShell`, `AppFrame`, `AppSidebar` and `IconButton` on 38–39 each |
| Call-site sibling groups | 328 |
| Elements carrying a fiber | 99–100% |

The lowest routes are MUI-heavy (`muigrid_root`, `muitypography_root` on
the Rx tools) or a layout gap like the parity log's open "text wraps a
word early" entry; those are importer work and show up here first.

### Phase 1 — one route from a React project

**Import from React app…** in the import menu: pick a folder, detect,
either paste a running URL or let Scamp start the dev server (with
consent and install). The import window opens on the app with a route
list beside it; choosing a route and **Capture** imports it as a view,
exactly as an HTML import. Redirects are flagged.
Tests: `detect.ts` units, devServer foreign-app mode, an e2e against a
tiny fixture React app checked into `test/fixtures/react-app/` (Vite,
three routes, one redirect).

### Phase 2 — every route in one go

Tick routes, fill params, **Import N pages**: the window visits each,
captures every breakpoint, and the app window writes all the views in
one transaction with one snapshot (`react_import`) so it undoes in one
step. One report per route plus a summary. Fonts from the project's
own files. Persistent session partition.

### Phase 3 — React's tree in the capture, and components

The `react` annotation, then `reactComponents.ts`: shared components,
the shell as a component with a slot, text props named from fiber
props. Reported: fragments, style-varying instances.

### Phase 4 — repeats

Call-site grouping, `repeat` + row samples, list names from source.

### Phase 5 — tokens from the app

Authored `var()` per property, `:root` / `[data-theme]` tokens and
themes, behind **Create theme tokens**.

### Phase 6 — the AI pass

The `react-import` skill, `scamp_get_react_source`, an eval rubric on
the test project's views (findings per element, `showIf` found, names
kept, pixels unchanged).

### Phase 7 — re-import

The route → view map and in-place update.

---

## Open problems

- **Instance style variants.** An active nav item, a selected tab: the
  same component styled per instance. Scamp instances override text and
  slots, not styles. Options are a class-toggle binding (`bind` on
  `className` from a boolean prop) or element states; either is its own
  plan. Until then, the most common form and a named finding.
- **State a URL can't reach.** Modals, a filled form, a wizard's step 4.
  **Capture this page** covers it by hand; scripted interactions per
  route are possible later.
- **Next.js server components.** Their output has fibers in dev, but the
  owner of server-rendered markup needs checking on a real app before
  Phase 3 claims Next support.
- **Production builds** have no `_debugStack`, so Phase 3+ needs the dev
  server. The import says so rather than silently importing without
  components.
- **Arbitrary code.** Starting the dev server runs the project's
  scripts. Consent each time, the command shown, and nothing run before
  the user says yes.

## Decisions

Made 2026-10-06:

1. **Approach:** render + capture + React's fiber tree, not
   source-reading.
2. **What "existing project" means:** import pages **from** a React app
   **into** a Scamp project. Adding Scamp to the React project in place
   is a different product and stays out.
3. **Where an import lands:** a new Scamp project per React app by
   default, with "into this project" as an option.
4. **The bulk-import plan** ([`agent-bulk-import-plan.md`](agent-bulk-import-plan.md))
   ships separately; only `scamp_check_project` may be folded into
   Phase 6, if the eval wants it.
5. **Dev server:** Scamp may run the project's `dev` script, with the
   user's consent each time. Phase 1 starts with "paste a running URL"
   and adds starting the server in the same phase.
