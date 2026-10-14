# Export a project as HTML + CSS — Plan

Status: **implemented** — phases 1–4 built, tested, and verified against a
real project. See [What changed during the build](#what-changed-during-the-build)
for where the shipped code differs from this plan.

## Context

Export the whole project to a self-contained folder of plain `.html` and
`.css` files, openable by double-clicking or droppable onto any static
host. Distinct from the existing PNG/SVG export, which captures one
element or page as an image.

The governing goal, from the answer to question 4: **a page must look
identical in the export and on the Scamp canvas.** Where fidelity and
tidy output disagree, fidelity wins.

---

## What already exists

More of this is done than it looks:

- **The generated TSX is nearly HTML already.** A page is a plain tree of
  `div` / `p` / `img` / `a` with one attribute pattern:

  ```tsx
  <div data-scamp-id="rect_035f" className={styles.rect_035f}>
  ```

  `className={styles.x}` → `class="x"` and it's HTML.

- **The CSS Modules are already plain CSS.** Because every class embeds a
  unique id (`rect_035f`, `hero_card_a1b2`), the module files carry no
  scoping the output depends on — `.module.css` is valid standalone CSS,
  `@media` and `@keyframes` blocks included.

- **`generateCode`** (`lib/generateCode/`) is the model for this: a pure
  function from the element map to text, with `classNameFor`, `tagFor`,
  and `elementDeclarationLines` already factored out and reusable.

- **`detachInstance`** already does the hard part of instances: it clones
  a component's tree into page elements with prop overrides baked in as
  literal text. That is exactly the transform an exporter needs.

- **`componentTrees`** on the canvas store already holds every component
  parsed into an element map, kept current for canvas rendering.

- **`exportOps.ts` + the Export section** are the precedent for an export
  IPC and its UI, and `assertInsideActiveProject` guards the writes.

---

## What actually makes this hard

Found by reading real generated output rather than assuming.

### 1. Instances can't be text-transformed

A page references a component like this:

```tsx
<SidebarRow data-scamp-instance-id="inst_a024" label="home" />
```

Producing HTML from that means resolving the component's tree, applying
`label`, honouring the destructured defaults
(`{ prefix = "W", value = "420" }`), and filling slots. That's a data
operation, not a string operation.

### 2. Class names collide when modules are flattened

Every component module names its root `.root` — and so does every page
module:

```
components/IconButton/IconButton.module.css →  .root, .glyph_a001
app/page.module.css                        →  .root, ...
```

Under CSS Modules those are scoped apart. Concatenated into one document
they are the same selector, so the page root and every component root
fight.

### 3. Route hrefs aren't file paths

Links are written as Next routes — `href="/"`, `href="/about/team"`. On
disk those must become `index.html` and `about/team/index.html`, or every
link in the export is broken.

### 4. Asset URLs are server-root

Next-format projects reference `/assets/hero.webp`, which resolves from
the server root. Opened as a `file://` page that points at the
filesystem root. They need rewriting to a path relative to the page —
and with nested routes, that depth varies per page.

---

## Decisions

### 1. Generate from the element model, not by transforming the TSX

The exporter is a **sibling of `generateCode`** — `lib/generateHtml.ts`,
taking the same element map plus `componentTrees`, and emitting HTML
instead of TSX. It reuses `classNameFor` / `tagFor` so the class names in
the HTML and the CSS can't drift apart.

Transforming the TSX text would mean parsing JSX to resolve instances,
props, defaults, slots and the template-literal `className` on component
roots. We already hold all of that as data.

### 2. Every instance is expanded into its own plain elements, with its own CSS

Per the answer to question 4. There is **no shared component
stylesheet**. Each instance is flattened into ordinary HTML, and the
component's CSS is copied into that page's stylesheet, prefixed with the
instance id:

```html
<!-- instance inst_a024 of SidebarRow -->
<div class="inst_a024__root inst_a024">
  <span class="inst_a024__icon_b1c2">…</span>
  <span class="inst_a024__label_d3e4">home</span>
</div>
```

```css
/* from SidebarRow.module.css, prefixed */
.inst_a024__root  { … }
.inst_a024__icon_b1c2 { … }
.inst_a024__label_d3e4 { … }

/* the page's own per-instance override, unchanged */
.inst_a024 { width: 300px; }
```

This one decision does four things at once:

- **Collisions disappear.** Instance ids are already unique, so two
  instances of the same component — and a component root vs. a page root
  — can no longer share a selector. Problem 2 above is solved by
  construction rather than by a separate namespacing pass.
- **Per-instance size overrides just work.** The page's `.inst_a024` rule
  is left exactly as generated, and the root element carries both classes
  — mirroring the app, where a component root renders
  `` `${styles.root} ${className}` `` with `className` coming from the
  page's instance class. Same two classes, same order, same cascade.
- **Every instance is independent**, as asked: one instance becomes one
  set of elements, and diverging overrides can't leak sideways.
- **Fidelity is structural**, not something that has to be maintained.

The cost is duplication: ten instances of one component means ten copies
of its rules. That is the right trade for a static export whose purpose
is to look correct, and a later pass could collapse identical instances
if the file sizes ever justify it. Not now.

**Nested instances** (a component containing an instance of another)
chain the prefix — `inst_a024__inst_b111__root` — with a depth/cycle
guard so a component that somehow references itself can't spin.

**Slot content stays page-owned.** Elements the page places into a slot
keep their page class names and are not prefixed; they belong to the
page, and their rules are already in the page's stylesheet.

### 3. Nested routes, co-located CSS, relative links

Per the answers to questions 2 and 3 — folder picker, nested routes:

```
<chosen folder>/
  index.html          index.css        ← the root page
  about/
    index.html        index.css
    team/
      index.html      index.css
  theme.css           ← copied verbatim, including any @import
  assets/…            ← copied
```

Each page's CSS sits beside its HTML, so a page never reaches sideways
for a stylesheet — only up, to the shared `theme.css` and `assets/`.
From `about/team/index.html` that's `../../theme.css` and
`../../assets/hero.webp`. Computing that prefix is a small pure function
and gets its own tests, because off-by-one here silently breaks every
nested page.

`theme.css` is copied verbatim: it holds the design tokens every class
resolves through, and any `@import` (web fonts) has to survive.

### 4. `<html>`/`<body>` come from the project's own layout

`app/layout.tsx` supplies the document shell and the `<body>` margin
reset. The exporter reproduces that shape rather than inventing one, so
the export matches what Preview shows.

### 5. Static output — no JS

Hover/active/focus and transitions are CSS and survive. Nothing in a
Scamp page needs a script, so none is emitted.

### 6. Reveal the folder when it's done

Per question 5 — `shell.openPath` on success. It answers "where did it
go" without a dialog to dismiss.

---

## The alternative I'd not take: `next build`

Next can emit static HTML with `output: 'export'`, which would handle
instances and routing for free. Against it:

- It needs `node_modules` installed in the user's project. Fresh Scamp
  projects don't have one (the sample project checked here doesn't), so
  the first export would be an `npm install` plus a build — tens of
  seconds to minutes, and a network dependency.
- The output is Next-shaped: `_next/` directories, hashed filenames,
  framework runtime. That isn't "a folder of HTML/CSS files".
- It fails in ways we don't control and can't explain well in-app.

Generating directly is more code, but it's fast, offline, dependency-
free, and produces output a person can read.

---

## Phases

### Phase 1 — `lib/generateHtml.ts`
Pure: `(elements, rootId, componentTrees, options) → string`. Instance
expansion with the `inst_x__` prefix, prop defaults and overrides, slot
content, nested instances, void elements, HTML-escaped text, and `class=`
from `classNameFor`. Fully tested, as `renderer/lib` requires — this is
where the real logic lives.

### Phase 2 — CSS assembly
Pure: prefix each instance's component CSS, concatenate it after the
page's own rules, and compute the relative depth prefix for a page's
asset and theme references. Also pure, also fully tested.

### Phase 3 — writing the folder
Main-side: folder picker (remembering the last choice), create the nested
page directories, write the HTML and CSS, copy `assets/` and `theme.css`,
rewrite asset URLs and route hrefs, then reveal the folder. Refuses to
write into a non-empty folder that isn't a previous export.

### Phase 4 — UI + e2e
An **Export HTML** action in the project header beside Preview, then an
e2e that exports a real project and asserts the folder's shape and
contents.

---

## Files to touch

**New:** `src/renderer/lib/generateHtml.ts`,
`src/renderer/lib/htmlExportCss.ts`, `src/renderer/lib/htmlExportPaths.ts`,
`src/renderer/lib/htmlExport.ts`, `src/main/ipc/htmlExportOps.ts`,
`src/main/ipc/htmlExport.ts`,
`src/renderer/src/components/projectShell/useHtmlExport.ts`,
`test/generateHtml.test.ts`, `test/htmlExport.test.ts`,
`test/htmlExportCss.test.ts`, `test/htmlExportPaths.test.ts`,
`test/htmlExportOps.test.ts`,
`test/integration/htmlExport.integration.test.ts`,
`test/e2e/export/html-export.spec.ts`.

**Modified:** `src/shared/ipcChannels.ts`, `src/shared/types.ts`,
`src/preload/index.ts`, `src/main/index.ts`, `tsconfig.web.json`,
`src/renderer/lib/generateCode/internal.ts` +
`src/renderer/lib/generateCode/tsx.ts` (shared `escapeHtml`),
`ProjectHeader.tsx`, `ProjectShell.tsx`,
`docs/user_docs/export.md`, `docs/CHANGELOG.md`.

**Shim regen:** both projects (`tsconfig.web.json` and
`tsconfig.node.json`), dev server stopped. `npm run build` before the
e2e, since it runs `out/main/index.js`.

---

## Tests

**`generateHtml.test.ts`** — the core:
- a page of nested rects emits the expected markup, with `class=`
  matching `classNameFor`
- an instance expands to the component's tree with every class prefixed
  by the instance id, and the root carrying both `inst_x__root` and
  `inst_x`
- **two instances of the same component don't share a single class** —
  the regression for the collision this design exists to prevent
- a prop override is applied; a destructured default is used where there
  is no override
- a nested instance chains the prefix, and a self-referencing component
  stops instead of recursing forever
- slot content keeps its page class names and is not prefixed
- void elements (`img`, `input`) self-close; empty `div`s emit
  `<div></div>`, not `<div />`
- text is HTML-escaped (`&`, `<`, quotes)
- a missing component emits a placeholder rather than throwing

**`htmlExportCss.test.ts`**:
- a component module is prefixed per instance, with `@media` and
  `@keyframes` blocks surviving intact
- the page's own `.inst_x` override rule is passed through untouched, so
  per-instance sizing still applies
- page CSS is otherwise unchanged
- the relative prefix is `""` at the root, `"../"` one deep, `"../../"`
  two deep

**Integration** — real temp dirs: the folder shape including nested page
directories, `assets/` and `theme.css` copied, `/assets/x.webp` rewritten
to the right relative depth for both a root and a nested page, and
`href="/about/team"` → `about/team/index.html`.

**e2e** — export a project with a component instance, an image and a
link; assert the folder contents and that every path the HTML references
exists on disk.

---

## Answered

1. **Where the action lives** — project header, beside Preview.
2. **Where it writes** — folder picker, remembering the last choice.
3. **Nested routes** — `about/team/index.html`, links rewritten to match.
4. **Instances** — expanded to plain HTML per instance, component CSS
   copied into that page's stylesheet, so canvas and export match. Drives
   decision 2 above.
5. **After export** — reveal the folder.

## Risks worth naming

- **CSS duplication** scales with instance count. Accepted deliberately
  (decision 2); revisit only if real projects produce uncomfortable file
  sizes.
- **Prefixing is textual on the component's CSS.** Selectors Scamp
  generates are simple class rules, so this is safe for our output — but
  hand-edited component CSS with descendant or attribute selectors needs
  the rewriter to handle more than a leading `.class`. Phase 2 should
  parse selectors properly rather than regex the first token.
- **`@import` in `theme.css`** means an exported page can still reach the
  network for fonts. Fine, but it's not strictly offline-complete;
  worth a line in the user docs.

---

## What changed during the build

Five things the plan got wrong or didn't anticipate.

### 1. Pages can't nest, so the routing question was smaller than it looked

`shared/pageName.ts` restricts a page name to `^[a-z0-9-]+$` — one URL
segment. The export tree is therefore at most one level deep, and the
"how should nested routes flatten" question only ever concerns
`about/index.html` vs `about.html`. The folder form was kept anyway,
because a static host then serves the page at `/about`, matching the
route the project used.

### 2. Keyframes had to be renamed too

Prefixing class names alone still lets a component's `@keyframes fade`
collide with a page's `fade` once the stylesheets are concatenated —
the same defect as `.root`, one layer down. `prefixCss` renames
keyframes declarations *and* the `animation` / `animation-name`
references pointing at them. The set of declared names is threaded
through the recursion rather than recomputed per block, so a rule
inside `@media` referencing a top-level keyframe isn't orphaned.

### 3. Four lib files, not two

Route/depth helpers aren't CSS and don't belong in `htmlExportCss.ts`,
so they became `htmlExportPaths.ts`. And the per-project orchestration
(parse everything, assemble each page, emit the file list) became
`htmlExport.ts` — pure, which is what lets the whole pipeline be tested
without Electron or a temp directory.

### 4. CSS urls resolve against the stylesheet, not the page

`theme.css` is shared by every page but lives at the export root, so its
`url()` targets must stay root-relative rather than being rewritten for
any one page's depth. Page stylesheets sit at the same depth as their
markup, so a single per-page rewriter serves both their `url()`s and
the document's `src` / `href`.

### 5. `parseCode` never throws, so the `skipped` list is unreachable

Unparseable source yields a bare root rather than an exception. The
`skipped` plumbing is kept as insurance against a future parser that
does throw, but the tested behaviour is the real one: a malformed page
exports as an empty document instead of failing the export.

## Verification

- **222 unit + integration assertions** across six spec files, plus two
  e2e tests driving the real button through a stubbed folder picker.
- **The tests were mutation-checked**: breaking the instance prefix and
  re-introducing the keyframes-threading bug each failed exactly the
  tests written to catch them.
- **Exported a real project** (`scamp-ui`: 2 pages, 4 components, many
  instances) and rendered it in Chromium — 181 classes in the markup,
  none missing from the stylesheets, no page errors, no failed
  requests, and the nested page's `../theme.css` resolving correctly.

## Still open

- **Remembering the last export folder** was suggested in the answer to
  question 2 but not built — the picker starts wherever the OS
  defaults. Cheap to add if it grates.
- **CSS duplication** scales with instance count, as accepted in
  decision 2. Untested against a project with dozens of instances of
  one component.
- **Hand-edited component CSS** with descendant or attribute selectors
  is handled (the prefixer is selector-aware, not a regex), but only
  against the cases in `htmlExportCss.test.ts` — CSS nesting in
  particular has had no real-world exercise.
