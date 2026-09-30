# Changelog

Everything Scamp does, and when it arrived.

This document has two parts, because they answer different questions:

- **[Releases](#releases)**: What changed in each version, newest first.
- **[Feature inventory](#feature-inventory)**: The complete list of what
  Scamp can do today, grouped by area, with no version attached.

The inventory exists because release attribution isn't reliable for the
early history. The bulk of the app shipped inside the first tagged build
(`v0.4.0`), and commit messages from that period are often a few words,
such as "added components" and "colorpicker". Rather than guess which
build a feature landed in, the inventory lists it plainly, and the
release notes cover what can be traced.

Dates are the tag dates. Versions follow the `package.json` version at
release time.

---

## Releases

### 0.8.8 (2026-09-30)

**Fixed**

- **Imported line icons keep their outline and their color.** An icon
  drawn as strokes rather than fills — most icon sets — arrived as a
  solid black shape. Scamp writes an imported icon's markup into your
  `.tsx` file, which means converting it to JSX, and the canvas and the
  HTML export were then reading that JSX as HTML, where the icon's paint
  means nothing and it falls back to a black fill. Icons now keep their
  paint in a form both can read, and existing imported pages render
  correctly without being imported again.

### 0.8.7 (2026-09-30)

**Added**

- **Style part of a text element.** Select some words on the canvas and
  change their color or weight, and Scamp wraps exactly those words in a
  `<span>` with its own class — the rest of the sentence is untouched.
  The properties panel shows the selection's own style while a range is
  selected, and shows nothing at all when the selection covers two
  different values, rather than picking one of them.

**Fixed**

- **Imported headings no longer wrap a line early.** Scamp asked Google
  Fonts for weights only, and Google serves a variable font with every
  other axis frozen at its default — so a heading set in Fraunces came
  back about 7% wider than the page it was copied from, wrapped one line
  sooner, and pushed every section below it down. Scamp now asks for
  each family's full set of axes. Around 158 Google families have an
  axis beyond weight.
- **A hidden "skip to content" link no longer paints a bar down the
  page.** Most accessible sites hide one above the top of the window.
  Scamp read its position as a stretch instead of an offset, so it
  imported as a dark bar thousands of pixels tall, over the text.
- **An icon with a gradient renders.** Gradients, filters, and masks
  inside an inline SVG are saved as an `.svg` file in your project and
  referenced as an image, because they can't survive being rewritten as
  JSX. They were rendering solid black. Plain icons are still imported
  inline, so they still follow the color around them.
- **Words keep the spaces around a styled word.** `works
  <span>alongside</span> AI.` imported as `worksalongsideAI.`
- **Importing two sites into one project no longer repaints the first
  one.** See the color note below.

**Changed**

- **An import writes literal colors instead of creating theme tokens.**
  Scamp used to lift any color it saw more than once into a theme token.
  A design system is a set of decisions about what should be shared, and
  counting how often a color appears can't make those — it produced a
  theme you didn't choose, and importing a second site into the same
  project could repaint the first one in the new site's palette.
  Turning imported colors into tokens is now yours to do, against a
  design you can see.

  **Note:** Views imported before this release may still reference
  tokens that hold another site's colors. Import those pages again to
  fix them.
- **The import report grades what it changed in four levels**, not two.
  An icon kept as markup renders perfectly and can't be edited as
  shapes — neither a loss nor a clean translation — so the report now
  separates *lost*, *renders but not editable*, *approximated*, and
  *exact*, worst first, and says what you can still change about a
  fallback.
- **Scamp is now under the Scamp Software License.** Free to use for
  personal and commercial work, and everything Scamp generates from your
  designs is yours. The source is published for transparency, not for
  copying or redistribution. See
  [LICENSE](https://github.com/scampdesign/scamp/blob/main/LICENSE).

### 0.8.6 (2026-09-28)

**Changed**

- **Scamp's source repository moved to the `scampdesign` organization.**
  **Help → Report a bug** and the repository link in the **Help** menu now
  point to
  [github.com/scampdesign/scamp](https://github.com/scampdesign/scamp).
  Nothing about updates changes: Scamp has taken them from
  `updates.scamp.club` since 0.7.1, and that doesn't depend on where the
  source lives.

### 0.8.5 (2026-09-25)

**Added**

- **Import a page from the web.** **↧ Import a page…** in the **Pages**
  sidebar opens a browser. Navigate to any page, click **Import**, and
  Scamp reads it as it appears on screen and writes a
  [view](user_docs/views.md) from it—real elements on the canvas, real
  TSX and CSS Module files on disk. The page's images are downloaded
  into the project, its fonts are installed or named, repeated colors
  become theme tokens, and the page's own class names become element
  names. See [Import a page from the web](user_docs/website-import.md).
- **Every import says what it changed.** An import is a translation into
  a smaller model, so the import window ends with a report: what came
  across differently, and what couldn't come at all. Losses are marked
  and listed first, and the report opens on its own when there is one,
  so a `<canvas>` you now have to rebuild isn't filed beside the
  bookkeeping.
- **An imported page arrives responsive.** After reading the page at
  full width, Scamp narrows the browser to each of your project's
  [breakpoints](user_docs/breakpoints.md) and reads it again, so the
  view carries the page's own media queries as per-breakpoint
  overrides rather than one fixed layout.
- **An agent can see the page an import came from.** Two MCP tools,
  `scamp_list_import_sources` and `scamp_get_import_source`, return the
  original HTML and CSS, so tidying an imported view starts from what
  the page actually said instead of a guess. The copy lives in a
  temporary folder, never in your project, and is deleted when you
  close the project. See [Work with AI agents](user_docs/ai-agents.md).

**Fixed**

- **Preview no longer goes blank when you leave the first page.** In a
  Scamp framework project, an added or imported page had no route, so
  following a link or picking a page in the preview toolbar asked the
  dev server for a URL that didn't exist. Adding a page now writes the
  route that renders it, renaming a page moves its route, and
  **Project settings** lists every route in the project. A view that
  already lost its route gets a **Generate route** button.
- **A project's start-screen card shows the project again.** Scamp
  framework projects have no pages, only views, and the card's capture
  only ever ran for a page—so every framework project had a blank card
  from the day the format shipped. Captures also now keep the design's
  own fonts and its background images, and a capture can no longer be
  filed under the project you just closed.
- **An element's inline markup renders on the canvas.** A `<b>`,
  `<em>`, or link inside a sentence, and children of a text element,
  appeared in the layers panel and in the code but not on the canvas.
- **A link points again.** Scamp's reset uses `all: unset` on `a`, which
  is what makes a linked element look like the box you drew—and it took
  `cursor: pointer` with it, so a link behaved like a div under the
  mouse in the preview and the export. `theme.css` puts it back for
  `a[href]`, and an existing project gets the rule when you open it. The
  canvas keeps the drawing cursor.
- **The terminal's output goes to the window that asked for it.** With
  more than one project open, a shell's output could arrive in the wrong
  window, which read as a terminal that wouldn't start.

### 0.8.0 (2026-09-23)

**Added**

- **Views: a page's design as a component-shaped file.** A view lives
  at `views/[Name]/` with a props type and sample data, and lists under
  **Pages** by its route slug. **+ Add Page** creates a view, and
  **Convert to view…** on a page's menu moves an existing page's
  elements across, leaving a one-line wrapper at the same route. See
  [Views](user_docs/views.md).
- **Data bindings in the Data tab.** Bind a list to an element with
  **Repeat this…**, a flag with **Show only when…**, and any attribute
  or event handler to a prop. The literal on the canvas becomes the
  prop's sample value and its default in the file, so a view renders on
  its own. Each binding has one canonical form in the file, and
  hand-written files in that form round-trip. See
  [Views and components](user_docs/code-output.md#views-and-components).
- **New projects run on the Scamp framework.** **New Project** writes
  `views/`, `routes/`, `design/theme.css`, and a `package.json` on
  `scampjs`, from the framework's own templates, instead of the Next.js
  layout. Existing Next.js projects open unchanged. See
  [Views](user_docs/views.md#scamp-framework-projects).
- **Migrate a Next.js project to the framework.** A **Scamp framework**
  section in the properties panel offers the move: each page becomes a
  view and a route, the theme moves under `design/`, and the Next.js
  files go to a backup folder. Anything Scamp didn't write stays in
  place and is listed. The offer sits in the panel rather than in a bar
  across the top, so a project that hasn't taken it keeps its canvas.
  See [Migrate a Next.js project](user_docs/views.md#migrate-a-nextjs-project).
- **Scamp framework projects open in Scamp.** A project with a
  `views/` folder and a `scampjs` dependency opens with tokens under
  `design/`, no wrapper pages, and `routes/` left entirely to you. You
  don't need the framework installed to design; a banner appears only
  when an installed `scampjs` implements a file format this version
  can't read, which is the case where a save would write the wrong
  shape.
- **Agents learn views.** `agent.md` gains a data bindings section, and
  the MCP server's new `scamp_get_view_props` tool returns a view's
  exact props type and sample data, so an agent writing the route
  passes the right shape.
- **Routes in the properties panel.** In a Scamp framework project, a
  **Routes** section lists every route and API handler, sets a page
  route's render mode, and opens a route in the code panel.
- **The properties panel shows what belongs to the page when nothing is
  selected.** Routes, then **Data** with the view's props and bindings,
  then **Keyboard shortcuts** as a section you open when you want it.
  The Visual and CSS tabs describe a selected element, so they no
  longer appear with nothing selected. **Generate route**
  writes a route for a view with the view's sample data in `load()`.
  The preview's request log lands in the app log, Project Settings
  shows the keys in `.dev.vars`, and agents get `scamp_list_routes`.
  See [Routes](user_docs/views.md#routes).
- **A page on the Scamp framework** in the user docs: what a project is
  made of, which files Scamp owns and which are yours, how a design's
  data becomes the shape a route provides, and where the framework's
  own documentation lives. See
  [The Scamp framework](user_docs/scamp-framework.md).
- **The `_scamp` export.** Every component and view file now ends with
  `export const _scamp`, which records the file format version and the
  event props. Scamp writes it on every save. New files declare contract
  1, and a file keeps the version it declares.
- **Preview through the Scamp framework.** In a Scamp framework
  project, **Preview** runs `scamp dev` from the project's `scampjs`
  (0.1 or later) and opens the current view at `/_views/[Name]`. The
  page list in the preview window holds the project's views. See
  [Views](user_docs/views.md#preview-a-view).
- **Agents can ask what you changed.** The new
  `scamp_get_recent_edits` tool reports your recent saves as the lines
  each one rewrote, so an agent can catch up before editing a file it
  read earlier. See [Work with AI agents](user_docs/ai-agents.md).

- **Bind an image's source to data.** An `<img>`'s **Src** and **Alt**
  appear in the **Data** tab's attribute list, so a card grid or a
  gallery can take its images from a prop or from a repeat's rows. The
  **Image** section shows the binding in place of the path and points
  at the **Data** tab.
- **Agents can check what a view lost.** The new `scamp_check_view`
  reports bindings that didn't parse, declarations that render but
  leave the panel controls blank, tokens `theme.css` doesn't declare,
  and sample rows that disagree with each other. A file can parse
  perfectly and still arrive degraded, and the element tree looks
  correct in every one of those cases.
- **Agents can read the project's conventions.** The new
  `scamp_get_conventions` serves `agent.md`'s own content through the
  MCP server, scoped to the project's format and a section at a time,
  so an agent can ask for the one rule it needs.

**Changed**

- **Adding a page writes its route.** In a Scamp framework project,
  **+ Add Page** now creates the view and the route that renders it, so
  the page has an address straight away. **Generate route** stays for a
  view that has no route — one you converted, or one an agent wrote.
- **Renaming a page takes its route with it.** The route that renders
  the page follows the rename, so the project still builds and the page
  keeps an address. A route you placed yourself stays where it is, with
  only its references updated.
- **The Routes section shows the open page's route.** The properties
  panel is about the page in front of you, so its route list is too,
  with the render mode on the line under the path. Project Settings
  has a **Routes** section with every route in the project, page and
  API.
- **Scamp writes only the lines a change touches.** A design change
  rewrites the CSS rules and the elements it affects instead of
  replacing both files. A file Scamp didn't write keeps its comments,
  its extra imports, its module-level code, and its formatting.
- **An edit from outside is merged, not dropped.** When a file changes
  on disk while you're designing, Scamp merges the two changes if they
  touch different lines, instead of reloading and losing yours. Only a
  real overlap still stops the save.

- **`agent.md` describes the project you actually have.** In a Scamp
  framework project it still called the project a Next.js App Router
  project and named files that aren't there — `app/page.tsx`,
  `app/layout.tsx`, `next.config.ts`. It now documents the framework
  layout, the route file and its exports, and how an image whose source
  comes from data binds.

**Fixed**

- **A view's artboard matches the size the toolbar shows.** A view
  opens at the project's page width instead of the component default.
- **An image whose source comes from data renders on the canvas.**
  `src={product.image}` on an `<img>` is a binding like any other
  attribute, but it was read as literal text: the canvas drew a broken
  image, and the next save wrote the placeholder into the file. Bound
  `src` and `alt` now resolve, including per row inside a repeat.
- **Five things that didn't work in a Scamp framework project.** Each
  read the open *page*, and a framework project has no pages — every
  page is a view. **Replace image** and **Set background image** did
  nothing; the **Code** panel labelled both panes "— no page —"; the
  **Link** section offered no destinations and marked every internal
  link broken; **Export HTML** wrote an empty folder; and clicking an
  entry in **History** didn't preview the snapshot.
- **A failed image import tells you it failed.** Every import path —
  the image tool, drag-and-drop, **Replace image**, **Set background
  image** — discarded the error, so a failure was indistinguishable
  from nothing happening. Failures now appear in the **App Log**.
- **Saving doesn't rewrite `&` in a URL.** An image source ending
  `?w=2000&q=80` came back as `&amp;q=80` on the next save. The page
  rendered the same either way, but it changed a line nobody edited.

### 0.7.2 (2026-09-15)

**Fixed**

- **Adding text to a box in a flex or grid container no longer shifts
  the box.** A box drawn into a layout container kept the coordinates it
  was drawn at, and a box drawn before its parent became a flex or grid
  container kept its old position. The moment a text was placed inside,
  those leftover numbers were written as `left` and `top` on the box's
  positioning context, and it jumped by that much. New boxes under a
  layout parent now start at zero, and the generated CSS always writes
  `left: 0px; top: 0px` for a positioning context, so the layout owns
  the position and every save is stable.

### 0.7.1 (2026-09-10)

**Changed**

- **Updates now come from Scamp's own update server.** Nothing changes
  in how you use the app: it still checks for updates on launch and
  every four hours, and installs them the same way. Under the hood, this
  version switches the update feed from GitHub Releases to
  `updates.scamp.club`, so future releases keep reaching you wherever
  the source code lives.

### 0.7.0 (2026-09-08)

Electron 44, the full flex vocabulary in the panel, a Transform section,
and better guidance for coding agents.

**Added**

- **Every flex control, in the Layout and Size sections.** Layout gains
  **Wrap**, a **Reverse** toggle on its own row, **Align content**, and
  separate **Row gap** and **Column gap** inputs. When an element sits in
  a flex container, the Size section gains an **Advanced** disclosure
  with **Grow**, **Shrink**, **Don't shrink**, **Basis**, **Align self**,
  and **Order**. Everything is written as longhand CSS, and hand-written
  flex CSS round-trips back into the panel, including the `flex`
  shorthand. Drawing a box into a flex container, or typing a pixel size
  on its main axis, turns **Don't shrink** on so the box keeps the size
  you gave it. See [Flex layout](user_docs/flex-layout.md).
- **A Transform section.** Add translate, rotate, scale, and skew
  functions in order, and set the transform origin from nine presets or
  any CSS value. Hand-written `transform` lists parse into the same rows.
  See [Transforms](user_docs/transforms.md).
- **Agents learn to create Scamp components.** The MCP server now
  describes itself on connect, and a new `scamp_get_component_scaffold`
  tool hands an agent the exact starter files for a component, so it
  writes real component folders instead of a page of examples.
  `agent.md` gains a Scamp components section and page conventions.
- **The MCP indicator says what's wrong.** The dot in the terminal header
  is gray until an agent connects, green after one has, and amber when
  Claude Code has the server disabled for this project because you
  declined its prompt. In the amber state the copy button copies the
  command that brings the prompt back. See
  [Work with AI agents](user_docs/ai-agents.md).
- **A Linux page in the user docs** that explains the Wayland behavior
  below and how to opt out. See [Linux](user_docs/linux.md).

**Changed**

- **Electron 31 to 44**, with electron-vite 5, Vite 7, and Node 24. The
  clipboard and folder pickers are updated for the new APIs: choosing a
  project folder now starts from your default projects folder and
  remembers the last pick, rather than opening on Downloads.
- **On Linux, Scamp runs through XWayland by default.** Electron 44
  crashes on startup under the native Wayland backend on some systems,
  so Scamp asks for X11 and restarts itself once at launch. Set
  `SCAMP_OZONE_PLATFORM=auto` to opt back into native Wayland.
- **User docs and this changelog follow the Google developer
  documentation style guide.** Sentence-case headings, second person,
  present tense, and task headings as imperatives.

**Fixed**

- **Long page and component lists scroll inside their sidebar section**,
  the way the layers list does, instead of scrolling the whole window.
- **Saving from the CSS panel with Cmd+S no longer pauses sync.** The
  app's own write was being reported back as an external edit, which
  showed a "nothing was saved" warning and paused syncing until the
  quiet window passed.
- **Component instances fill at every breakpoint.** An instance whose
  width was set to Fill at the Mobile breakpoint stayed at its desktop
  size on the canvas, while the preview filled correctly. The canvas now
  resolves the component's elements at the active breakpoint.

### 0.6.6 (2026-08-31)

**Fixed**

- **Clicking an element inside a flex or grid container no longer moves
  it.** Selecting one could send it to the end of its container, and
  selecting the last one could lift it out into a sibling, because a
  plain click was running the whole drag gesture. A mouse click emits no
  movement, but a trackpad tap emits a pixel or two of jitter, which was
  enough to resolve and commit a drop. Dragging now starts only after
  the pointer has traveled, so a click selects and nothing else. The
  same gap let a click near a container's edge reparent an absolutely
  positioned element; that's closed too.

### 0.6.5 (2026-08-29)

Sign-in arrives, the start screen gets a visual refresh, and the canvas
starts rendering your page's real stylesheet instead of an approximation
of it.

**Added**

- **Sign in to a Scamp account.** An account panel sits at the bottom of
  the start-screen sidebar. Signing in opens your browser, you approve
  there, and the app picks up the result on its own. When you're signed
  in, the panel shows your name, email address, and a sign-out link.
  Everything is optional: Scamp works exactly the same signed out, never
  prompts you on launch, and there's nothing to dismiss. Your session
  lasts 30 days and renews whenever you use it, so it expires from
  disuse rather than on a clock. If your OS can't store the sign-in
  securely, the panel tells you so rather than quietly forgetting you.
  See [Accounts](user_docs/accounts.md).
- **Project thumbnails on the start screen.** Each card shows a picture
  of the project's home page, recaptured whenever you save. Projects
  without one show their artboard color in the same space, so the grid
  stays even. Thumbnails live in `<project>/.scamp/preview.png`.
- **A refreshed start screen.** New project cards; the default projects
  folder moved from a block of sidebar chrome to a folder icon beside
  the **Projects** heading (hold the pointer over it for the path, and
  click to change it); and project names shown the way you read them.
  `my-portfolio` displays as "My Portfolio", with the folder name still
  shown on hover and used unchanged on disk. **"Last opened" now stays
  readable past a day.** It steps through minutes, hours, days, weeks,
  months, and years, where a project opened last week previously showed
  a bare "14:32" with no date.
- **The canvas renders your page's real stylesheet.** `::before` and
  `::after`, `:nth-child`, and any hand-written selector now appear on
  the canvas. Previously they were parsed, preserved, and written back
  to your files, yet stayed invisible while you designed. That mattered
  most for agent-written CSS, because `agent.md` recommends `::before`
  for decorative touches. Component instances get their own scoped copy,
  so one instance's styles can't leak into another or into the page
  around them.
- **Breakpoints resolve against the artboard**, not the app window. A
  390 px frame now fires your mobile breakpoint no matter how wide the
  Scamp window is, so what you see at each size is what a browser at
  that size does.
- **Export a project as HTML.** A new **Export HTML** button in the
  project header writes every page as plain `.html` and `.css` files
  into a folder you choose, with no build step and no dependencies.
  Pages keep their routes (`about/index.html`), links between them are
  rewritten to work both on a static host and straight off disk, images
  are copied into `assets/`, and `theme.css` comes along so every token
  still resolves. Component instances are flattened into ordinary
  markup, each with its own copy of the component's styles, so
  per-instance sizing and text survive. You pick a location, and Scamp
  creates a folder there named after the project. Re-exporting reuses
  it, and a name held by anything Scamp didn't write is stepped over
  rather than overwritten. The button reports progress and the result: a
  spinner while writing, a green count when it lands, and a red **Export
  failed** with the reason on hover, so an export that declines to run
  can't be mistaken for one that did nothing.
- **Semantic color tokens accept a literal value.** A semantic row could
  only be pointed at a primitive; a hand-written value showed as
  "— custom —" and couldn't be edited. Rows now use the same color
  control as the properties panel, so you can map to a primitive, type
  a value, or use the picker and eyedropper. The picker offers
  primitives only, because pointing one semantic token at another would
  put a reference cycle two clicks away.
- **An image's Source is editable.** It was a read-only filename, and
  the only way to change it was **Replace**, which imports from your
  assets, so there was no route to an image you hadn't imported,
  including one at an absolute URL. It's now a text field that commits
  on Enter or blur.

**Changed**

- **Scamp runs as a single instance.** Opening it again focuses the
  window you already have rather than starting a second copy. Sign-in
  requires this, because it needs one known place for the browser to
  hand its result back to.
- **The Image section moved** to directly after Element in the
  properties panel, matching what Typography already does for text. The
  thing you opened the panel for now leads the style sections. It used
  to sit twelfth, below Background, Border, Shadows, and Filters.
- **Background no longer offers "Set background image" on an `<img>`**,
  where it read as a second source competing with the element's own. It
  still appears if a background image is already set, so one added
  elsewhere stays removable, and it's untouched for every other element.

**Fixed**

- **Boxes drawn inside a flex or grid container keep the size you
  drew.** They were being clamped against the parent, so a box drawn to
  fill a container came out smaller than the drag that made it.
- **Fill height works in a flex row.** It emitted `height: 100%`, which
  resolves against an `auto`-height container and computed to zero, so
  the element vanished. It now emits `align-self: stretch`, and the Size
  panel still reads **Fill**.
- **Links and buttons keep your page's styles.** The canvas reset for
  semantic tags was overriding styling you set on `<a>` and `<button>`.
- **Duplicate CSS declarations are still flagged when they change
  nothing.** A property repeated with the same winning value produced
  identical code, so the warning was dropped, which is exactly the case
  where the duplicate has no other symptom to notice it by.
- **Animated elements no longer stretch the artboard.** Mid-animation
  positions were being counted as canvas extent, so the scrollable area
  grew and shrank while an animation played.
- **`position: absolute` survives on a flex or grid child.** It was
  being discarded on parse and then deleted from your file on the next
  save.
- **`position: sticky` renders at rest on the canvas.** A real sticky
  element stuck to the canvas viewport, so it drifted away from where it
  sits in the page as you panned, and its coordinates were read as
  scroll offsets. Your generated CSS is unchanged; this affects only the
  canvas.
- **Grid gaps round-trip** through the shorthand without drifting.
- **Gradient backgrounds render on the canvas**, not only in preview.
- **Tooltips raised by a click no longer stick open.**
- **Sign-in's loopback listener no longer hangs** when closing.

### 0.6.0 (2026-08-19)

A batch of editing improvements, plus image compression on import.

**Added**

- **Collapse branches in the layers tree.** A disclosure triangle
  appears on any element with children. **Alt+click** folds or unfolds
  the whole branch at once. A collapsed row shows a dot when your
  selection is hidden inside it, and selecting on the canvas expands
  whatever the element is nested in. The state is session-only: it's
  never written to project files, and it resets when you switch page or
  component.
- **Cut, multi-select copy, and paste positioning.** **Cmd+X** cuts as a
  single undo step, **Cmd+C** copies a multi-selection, **Cmd+Shift+V**
  pastes in place at the copied coordinates, and right-clicking and
  selecting **Paste** drops at the clicked point. Copy, Cut, and Paste
  are added to the element right-click menu. Copying with the page
  selected takes everything on it.
- **Duplicates keep their name.** `menu_a1b2` duplicates to `menu_c3d4`
  instead of reverting to `rect_c3d4`, recursively for named children.
  **Duplicate** is added to the right-click menu.
- **Images are compressed on import.** PNG and JPEG are re-encoded to
  WebP, and anything larger than 3000 px on its longest edge is scaled
  down to fit. A 7 MB camera photo typically lands under 500 KB. SVGs
  and existing WebP files are left alone, and the original is kept
  whenever converting wouldn't make it smaller.
- **Anonymous usage counting**, off unless you opt in. A random ID
  generated on your machine identifies the installation, not you.
  Opting out deletes it. Toggle it in **Settings > Privacy**.

**Changed**

- **Drop targeting is unambiguous.** The middle of a container means
  "inside it", and its leading and trailing edges mean "beside it". One
  shared rule applies to both the canvas and the layers tree. The
  destination container is outlined during the drag, and grid
  containers behave exactly like flex ones.
- **Cmd+V now offsets** from the copied position rather than pasting at
  the exact coordinates. **Cmd+Shift+V** is the paste in place.
- **Image conversion runs in a child process**, so a large import never
  freezes the app. An "Optimizing image…" indicator appears over the
  container it's landing in.

**Fixed**

- Choosing an image that's already in your assets folder links it
  instead of making a duplicate copy each time.
- Grid children can be reordered by dragging. Previously only flex
  children could. A grid child fell through to the absolute-move path,
  where dragging did nothing and only siblings highlighted.
- Pasting with a text, image, or input selected no longer nests the
  pasted element inside it.
- The layers tree no longer offers "drop inside" for images, inputs, and
  component instances.
- `npm run test:unit` and `npm run test:integration` were matching zero
  files and exiting as if nothing needed running.

### 0.5.7 (2026-08-10)

- **MCP server**, so coding agents can query the live canvas: the open
  page, the element tree, selection, theme tokens, and breakpoints.
- **Live context file** kept up to date on disk for agents that read
  files rather than call tools.
- **Copy context for agent** on the element right-click menu.
- Code panel improvements, including highlighting the selected element
  in the TSX and CSS.
- User docs for the AI agent features.

### 0.5.6 (2026-07-31)

- Component bug fixes.

### 0.5.5 (2026-07-28)

- Color and token picker polish, and a semantic picker in the theme
  builder.

### 0.5.4 (2026-07-27)

- Element tree menu updates.
- Theme and font upgrades.
- Card view for the project list.

### 0.5.3 (2026-07-27)

- Fixed a duplicate element-ID issue.
- Design cleanup on the layout controls.

### 0.5.2 (2026-07-24)

- **Design system panel**: The token editor moved into the main frame,
  navigation moved to the sidebar, and palette and theme work landed.

### 0.5.1 (2026-07-17)

- Fixed canvas sizing inside components.

### 0.5.0 (2026-07-16)

- **Component slots**: Instances can take page-owned content.
- SVG improvements.
- Aspect-ratio lock and canvas overflow controls.

### 0.4.7 (2026-07-13)

- Zoom control cleanup.

### 0.4.6 (2026-07-09)

- Fixed a CSP issue that blocked crash reporting.

### 0.4.5 (2026-07-06)

- Inline SVGs render as real `<svg>` on the canvas, recolor reliably,
  and are click-selectable and labeled in the layers tree.

### 0.4.4 (2026-06-25)

- **Drag to reparent** on the canvas, into absolute containers and into
  flex and grid containers at an insert position.

### 0.4.3 (2026-06-24)

- Fixed a stuck snapshot-preview lock when canvas content is replaced.

### 0.4.2 (2026-06-24)

- The updater shows the real error, and the app version is added to
  Settings.

### 0.4.1 (2026-06-24)

- Components no longer inherit the page root's `100vh` floor.

### 0.4.0 (2026-06-23)

First tagged release. Contains the bulk of the app; see the
[feature inventory](#feature-inventory) for the full list. Notable
capabilities that landed in this window: the canvas and element model,
bidirectional file sync, components, the color picker and color tokens,
breakpoints, element states, animations and transitions, CSS grid,
export to PNG and SVG, preview mode, snapshots and the history panel,
typography tokens, crash reporting, automatic updates, and Windows and
macOS packaging.

---

## Feature inventory

Everything Scamp does today. Each entry links to its user documentation.

### Canvas and elements

- Draw rectangles, text, images, and form inputs; select, move, resize,
  and nudge with arrow keys. [Canvas](user_docs/canvas.md)
- Change an element's HTML tag without breaking its CSS class, plus
  tag-specific attributes, `<select>` and `<option>`, and inline SVG.
  [Elements](user_docs/elements.md)
- Rename elements; names become the CSS class prefix
  (`hero_card_a1b2`). [Element naming](user_docs/element-naming.md)
- Duplicate, copy, cut, and paste, including across pages and at a
  chosen point. [Canvas](user_docs/canvas.md)
- Group and ungroup into flex containers.
  [Grouping](user_docs/grouping.md)
- Canvas size presets and custom widths, content clipping, and an
  overflow indicator. [Canvas](user_docs/canvas.md)
- Link elements to other pages or external URLs.
  [Link between pages](user_docs/linking.md)

### Layout

- Flex containers with direction, wrap, gap, alignment, and
  justification, plus flex-child controls.
  [Flex layout](user_docs/flex-layout.md)
- CSS Grid containers with column and row tracks and per-item
  placement. [Grid layout](user_docs/grid-layout.md)
- Drag to reparent and reorder on the canvas and in the layers tree,
  with drop-target feedback. [Layers panel](user_docs/layers-panel.md)
- Aspect-ratio lock on resize. [Canvas](user_docs/canvas.md)

### Styling

- Visual and raw-CSS editing modes.
  [Properties panel](user_docs/properties-panel.md)
- Color picker with alpha, hex entry, project swatches, and theme
  tokens. [Color picker](user_docs/color-picker.md)
- Typography: fonts, size, weight, line height, and letter spacing.
  [Typography](user_docs/typography.md)
- Box shadows, blend modes, and CSS filters, including backdrop filters.
  [Filters](user_docs/filters.md)
- CSS transforms with a transform origin.
  [Transforms](user_docs/transforms.md)
- Hover, active, and focus styles through the state switcher.
  [Element states](user_docs/element-states.md)
- Transitions between states.
  [Transitions](user_docs/transitions.md)
- Preset keyframe animations with full timing control.
  [Animations](user_docs/animations.md)

### Responsive design

- Per-breakpoint overrides, with the canvas switching to the
  breakpoint's width. [Breakpoints](user_docs/breakpoints.md)

### Components

- Reusable components shared across pages, with a dedicated editor.
- Slots for page-owned content, and per-instance text overrides.
- Detach an instance back into plain elements.
  [Components](user_docs/components.md)
- Views: a page's design in the component file shape, listed under
  Pages, with repeat, show, attribute, and event bindings in the Data
  tab.
  [Views](user_docs/views.md)

### Design system

- The Design System panel, backed by a real `theme.css`.
  [Design system](user_docs/design-system.md)
- Color palettes (primitives) and semantic color tokens.
  [Colors](user_docs/colors.md)
- Type scale and reusable text styles.
  [Text styles](user_docs/text-styles.md)
- Spacing, border width, radius, and shadow tokens.
  [Design tokens](user_docs/design-tokens.md)
- Light, dark, and custom themes.
  [Themes](user_docs/themes.md)
- An auto-generated `DESIGN.md` that describes the system for agents.
  [DESIGN.md](user_docs/design-md.md)

### Code output and sync

- Real TSX and CSS Module files written as you design, with save status
  and a live code preview.
  [Code output](user_docs/code-output.md)
- Bidirectional sync: edit the files externally, and the canvas reloads.
  [Bidirectional sync](user_docs/bidirectional-sync.md)
- Next.js, Scamp framework, and legacy project formats.
  [Views](user_docs/views.md#scamp-framework-projects)

### Work with AI agents

- An MCP server that exposes the live canvas to coding agents,
  including each view's props type and sample data.
- A live context file on disk for file-reading agents.
- **Copy context for agent** for pasting into a chat or terminal.
  [Work with AI agents](user_docs/ai-agents.md)

### Project management

- Pages: create, rename, delete, and navigate.
- Per-page undo and redo, plus a visual History panel.
  [Undo, redo, and history](user_docs/undo-redo.md)
- Snapshots: durable point-in-time backups you can preview and restore.
  [Snapshots](user_docs/snapshots.md)
- A start screen with recent and discovered projects, shown as cards
  with a thumbnail of each project's home page.
  [Get started](user_docs/getting-started.md)
- Import a live web page as a view, with a report of what the
  translation changed and what it could not carry.
  [Import a page from the web](user_docs/website-import.md)
- Style part of a text element: select words on the canvas and give them
  their own color or weight, written as a `<span>`.
  [Typography](user_docs/typography.md)

### Output and preview

- Export the page or a selected element as PNG or SVG.
  [Export](user_docs/export.md)
- Preview mode running a real Next.js dev server.
  [Preview mode](user_docs/preview.md)
- Images compressed to WebP on import, with oversized photos scaled to
  fit. [Elements](user_docs/elements.md)
- Export the whole project as a folder of static HTML and CSS.
  [Export](user_docs/export.md)

### The app itself

- A built-in terminal panel. [Terminal](user_docs/terminal.md)
- App and per-project settings, including the privacy toggle.
  [Settings](user_docs/settings.md)
- Optional sign-in to a Scamp account, with the session stored in your
  OS's secure storage. Every feature works signed out.
  [Accounts](user_docs/accounts.md)
- Automatic updates, and opt-in anonymous crash reporting.
- Complete keyboard shortcuts.
  [Keyboard shortcuts](user_docs/keyboard-shortcuts.md)
- Linux-specific display behavior and the Wayland opt-out.
  [Linux](user_docs/linux.md)
