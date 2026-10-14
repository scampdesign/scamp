# Importing a React app into Scamp — tech plan

Give Scamp a React project folder; it imports the app's pages as views,
the way the HTML importer imports a URL. SCMP-102. Split out of
[`../archive/2026-10-06-builtin-agent-plan.md`](../archive/2026-10-06-builtin-agent-plan.md) on 2026-10-05; this
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

### Phase 1 — one route from a React project — **done**

**↧ Import a React app…** under **Pages** opens `ReactImportDialog`:
choose the folder (main reads it with `detect.ts`; only a folder chosen
in the system dialog can be started), see the exact commands, then
**Run and import** — or give the address of a server already running.
`reactImport/appServer.ts` installs if needed, starts the dev script on
a free port in its own process group, and stops it when the import
window closes or the app quits.

The import window gains a React mode: the app's routes beside the page
(`RoutePanel`), params filled in before a route can be visited, a
redirect flagged when a route's address changes within four seconds of
choosing it, one persistent session per app, and the view named after
its route (`viewNameForRoute`) — a single-page app's `<title>` is the
same on every route. For both modes, the first read now happens at the
widest breakpoint's width rather than the window's.

Found on the way: the DOM container holds the root fiber React created
first, and React swaps its two trees on commit, so reading from it can
find an empty tree. `readRoutesFn` starts from `stateNode.current`.

On riq_frontend_demo: 47 routes listed 3.5s after **Run and import**,
`/dashboard → /setup` flagged, `/patients` imported as `Patients`.
Tests: `test/reactImportDetect.test.ts`, `test/reactRoutes.test.ts`,
and `test/e2e/import/react-import.spec.ts` against
`test/fixtures/react-app` (copied to a temp folder with Scamp's own
`node_modules` linked, so nothing installs).

### Phase 2 — every route in one go — **done**

Routes are ticked in `RoutePanel` (the ones that open as they stand,
by default; a route with params once its values are in) and **Import N
pages** runs `useImportBatch`: visit each route, wait for the load to
stop and settle, skip one whose address changed (a redirect), read it
at every width (`readAllWidths`, shared with single import), deliver
it with a batch reference, and wait for the app window's verdict
before the next — one at a time, so each view's name sees the last.
`BatchSummary` shows each route's outcome and **Stop after this page**.

**Undo** is **Remove these pages**, not a snapshot: a restore copies
files back but never deletes new ones, and an import only adds views.
The import window names a batch id and nothing else; the app window
removes only the views it recorded making for that batch.

**A new project per app** is the default when a default projects
folder is set: the dialog creates it (taking `-2`, `-3` if the name is
taken, and reusing it on retry), starts the server for it, and `App`
switches to it (`onSwitchProject`), where the import window opens.

On the fixture app: four routes ticked, three imported into a new
project, `/private` skipped as a redirect, all three removed in one
step. Tests: `projectNameFrom` units, and the second test in
`test/e2e/import/react-import.spec.ts`.

**Not done here:**

- **Fonts from the project's own files.** Scamp's font system knows two
  sources, Google and Adobe (`applyThemeFonts`, `parseFontEmbed`);
  local files need a third, across the canvas, preview, export and
  thumbnails. Its own piece of work. Until then, a family Google serves
  (Inter, on the test app) is substituted from Google.
- **Routes.** A view's route is its slug (`BillingDashboard` →
  `/billing-dashboard`), not the app's path (`/billing/dashboard`), and
  a new project's starter `Home` keeps `/`, so the app's `/` arrives as
  `Home2`. Carrying the app's paths belongs with the route map in
  Phase 7.

### Phase 3 — React's tree in the capture, and components — **done**

**The capture.** `captureScript.ts` reads React's fiber tree when the
page has one: each node gains `react.owners` (the app's components that
drew it, nearest first, with an id per instance) and `react.site` (the
JSX call site, React 19). A component is the app's unless its JSX lives
under `node_modules`, which `_debugStack` says; React 18 has no stack,
so every named component counts. The payload gains each instance's
plain props. Optional fields, so `CAPTURE_VERSION` stays 3.

**The plan.** `@lib/reactComponents` (`planReactComponents`) runs over
a finished batch's views:

- An element is the root of an instance when it belongs to it and its
  parent doesn't. A component with several top-level elements stays as
  elements (`fragment`).
- Children the instance doesn't own are content passed in. Content that
  is the same in every copy (the bell every top bar has) is part of the
  component; content that differs is the page's, through one `children`
  slot — and only where that element holds nothing else, because a
  Scamp slot replaces all of its element's children (`slots`).
- Copies with the same name and shape are one group, largest first, so
  the shell is made before the buttons inside it.
- Each element's look is the copies' majority. A copy that differs only
  in paint (the selected nav item's background, weight, shadow; an
  invisible attribute such as `datetime`) takes the common look
  (`style-varies`). A copy that differs in layout stays as it is
  (`too-different`, naming the fields: `placeholder on dp_search_input`).
- A size the copies share is kept; one that differs — a shell as tall as
  its page, a breadcrumb as wide as its words — goes back to `auto`.
- Text that differs is a prop, named after the React prop that held it.
- A group containing a component made earlier in the run stays as
  elements (`nested`): components inside components are not made yet.

**The app.** When a run finishes, the import window asks the app window
to finish the batch (`ImportBatchAction`, `finish`); it plans, writes the
components, rewrites the views with instances, opens the last view, and
reports what it made and kept. **Remove these pages** removes the
components too.

**On riq_frontend_demo** (39 routes): 25 components, among them
`AppSidebar` (34 copies), `Clock` and `NotificationsBell` (34),
`Breadcrumbs` (23), `GreetingBanner2` (21); the project goes from 10,623
elements to 6,475; pixels 94.12% → 93.78%, with the Rx tools losing most
(`/rx-copilot/weight-loss` 92.1 → 87.5). Tests:
`test/reactComponents.test.ts`, a real React capture
(`test/fixtures/import/pages/react-app.html`), and the batch e2e, which
now checks the fixture's `Shell` (with its slot) and `Page`.

**Found on the way:** the eval passed components to the export as
`{ tsx, css }` where it reads `{ tsxContent, cssContent }`, so every
instance exported empty and pixels read 51%. The harness now takes
render and compare apart (`capturePage`, `renderView`, `compareShots`)
and inlines every stylesheet the export writes.

### Phase 4 — repeats — **done**

`@lib/reactRepeats` (`planRepeats`) runs after components, on each view
and each component definition. A run of neighbouring siblings is one
`.map()` when React says so: they share a JSX call site (React 19), or —
React 18 gives no call site — each carries a `key` with one owner
writing them all, or each is the keyed root of an instance of one
component. The capture now records those keys (`react.key`, and each
owner's `key`).

A run whose rows have the same shape and the same look becomes one
element with `repeat: { over, as }`, the rows as samples on the root,
and what differs — words (`prop: 'row.field'`), attributes and an
image's `src`/`alt` (`bind`), an instance's props (`bind` on the
instance) — as row fields, named after the layer or the prop. Sizes
that differ by row go back to the content. The key is a field every row
holds a different value of, else a numbered `id`. Rows that differ in
look stay as copies: a status chip's colour is data the template can't
hold.

The list and row names come from the source: main reads the call
site's line (`@shared/reactSource`, `listNamesAt`) from the folder Scamp
is running the app from, and only files inside it
(`ReactImportListNames`). `RECEIVED_RANGES.map((range) =>` gives
`receivedRanges` / `range`; without a source the list is named after
its row (`claimRows`).

**The export now expands repeats.** `generateHtml` wrote a repeated
element once and ignored show flags — wrong for any repeat, imported or
made in the Data tab. It now evaluates bindings the way the canvas does
(`expandChildren`, `resolveAttr`, `resolveInstanceOverrides` from
`@lib/bindingEval`): once per sample row, a hidden element left out,
row-bound text, attributes and instance props from the row.

**On riq_frontend_demo:** 28 lists, 231 rows, are now one element each;
the project goes from 10,624 elements to 6,218; pixels 93.77%, the same
as with components alone. 86 lists stay copies, because their rows
differ in shape (42), an icon (12), or a status colour (21). Tests:
`test/reactRepeats.test.ts` (with a generate → parse → generate round
trip and a real React 18 capture), `test/reactSource.test.ts`, the
repeat cases in `test/generateHtml.test.ts`, and the team list in the
batch e2e.

### Phase 5 — tokens from the app — **done**

**The capture** (`authoredTokens`, asked for only by a React import that
keeps tokens) runs the cascade over the page's stylesheets: each style
rule matched once with `querySelectorAll`, declarations ranked by
`!important`, an approximate specificity (`:where` counts nothing,
`:is`/`:not`/`:has` count their argument), then source order; media and
supports rules only when they apply; inline styles last. A property is
the app's token when its winning declaration is exactly
`var(--name)`, including through a shorthand (`padding: var(--space)
8px` gives the top and bottom, not the sides; `border: 1px solid
var(--line)` gives the colours). Each token's value is read where it was
used, and a name that means two things in two places is dropped. Every
other theme the page declares (`[data-theme="x"]`, `.dark`) is read by
switching the page into it for a moment.

**The import** (`@lib/appTokens`): `themeFromTokens` adds the tokens to
the project's theme — the theme the page was showing as `:root`, `dark`
as `.dark`, anything else as `.theme-<name>`, each holding only what
differs — and reuses one the project has with the same value. One it has
with another value is left literal everywhere (`conflicts`).
`tokenizeCapture` writes `var(--name)` back into the capture before the
reducer runs, so references reach the elements through the usual
mappers — except where the panel has a control that can't read one
(`font-weight`, `box-shadow`): there the literal stays, so it can be
edited.

**The choice** is in the dialog: *Use the app's own theme tokens* (the
default) or *Keep plain values*.

**On riq_frontend_demo** (39 routes): 43 tokens a route, 18,700 `var()`
references across the views; pixels 94.10% against 94.12% with plain
values; findings per element 0.06 against 0.08; components and repeats
unchanged. Tests: `test/appTokens.test.ts` (with
`test/fixtures/import/pages/tokens.html`, the cascade cases in a real
browser), and the batch e2e, whose fixture app now has tokens and a dark
theme.

### Phase 6 — the AI pass — **built; real-model eval pending**

**Where things came from.** When a multi-page import finishes, the app
window sends each view's and component's element → JSX call site map to
main, which writes `.scamp/react-import.json` with the app's folder — its
own record of what it started, never the renderer's word
(`reactImport/record.ts`, `ReactImportRecord`). Phase 7 builds on it.

**The tools.**

- `scamp_get_react_source` (read, answered in main): the JSX around an
  element's line, marked and numbered, or the files a view drew from.
  Only files inside the app's folder are read.
- `scamp_set_show` (write): `showIf` on an element, its sample on the
  root; `!flag` stores the flag's own value.
- `scamp_rename_list` (write): a list, its row variable, its fields and
  key — every row path beneath it and the sample rows.

Both writes are pure (`@lib/agentEdits`), round-trip through
generate → parse, and run in the renderer and the headless canvas.

**The skill** (`skills/reactImport.ts`, `react-import`, v1): read the
source for elements that look conditional and for each list; plan
conditions (named for the source's condition), names (the source's) and
tags; apply on approval; report what it couldn't do — the selected nav
item above all. Tools: reads, the source, `set_show`, `rename_list`,
`set_tag`; no styles, deletes or components. The view must look the
same.

**The entry.** The Agent panel shows **Tidy up with AI** on a view a React
import made in this session, and starts it as a new conversation under
the skill, with the import's leftovers in the first message
(`reactTidyRequest`).

**The eval**, `scripts/react-agent-eval.mjs`: imports routes as the app
does (`scripts/lib/reactImportPipeline.mjs`, shared with the import
eval), runs the skill per view in the headless canvas with the source
answered by the same `sourceFor`, and reports show conditions, generic
names (`items`, `text2`), pixels, findings, the round trip, edits and
cost. Scripted: before equals after, round trip ok. **A real-model run
needs a budget.**

Tests: `test/agentBindingEdits.test.ts`, the skill and request cases in
`test/agentSkills.test.ts` and `test/agentCleanup.test.ts`,
`test/integration/reactImportRecord.integration.test.ts` (including a
path that tries to leave the app's folder), and
`test/e2e/agent/agent-react-tidy.spec.ts` on the scripted provider.

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
