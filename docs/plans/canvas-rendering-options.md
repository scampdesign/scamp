# Canvas rendering: options to close the parity gap

Status: **options, for review.** We did not build anything yet.

This document continues [canvas-iframe-plan.md](canvas-iframe-plan.md).
The phase A test in that plan passed. This document compares that plan
with the methods that other tools use.

## The problem

The canvas and the Preview window show the same design. They use two
different methods to show it. The results are frequently different.

- **The Preview window** runs the real framework of the project
  (`scamp dev` or `next dev`) in a browser window. The Preview window
  is correct.
- **The canvas** uses the React renderer of Scamp. `ElementRenderer`
  draws each element from the model in memory. The canvas also loads
  the generated stylesheet:
  - The stylesheet is inside `@scope`.
  - Its `@media` rules change to `@container` rules.
  - Some inline styles stay on top of it.

The parity harness ([parity-harness.md](../notes/parity-harness.md))
finds the problems that its fixtures test. You find the other problems.
This table shows the canvas parity fixes since mid-September, sorted by
cause:

| Cause | Fixes |
|---|---|
| **DOM that only the canvas has.** The canvas puts two boxes around each instance. The page does not have these boxes. The canvas also draws variant frames and nested instances in its own way. | `430abe26`: a root with `height: 100%` stopped at the wrapper box. `05dd1df3`: a 0×0 wrapper box made an instance impossible to click. `70d9c20b`: nested instances showed as placeholders. `11bf5da5`: instances lost text runs. |
| **Replacements for the viewport.** A `div` is not a viewport. Thus `@media` changes to `@container`. The frame of the component editor has the size of the component. The canvas does not load `theme.css`. | `11bf5da5`: tablet rules applied in the component editor at Desktop. The `box-sizing` and `margin: 0` resets are copied as inline styles, because the canvas does not load `theme.css`. |
| **Inline styles.** Position and size stay as inline styles, for drag operations. | `734dcabe`: an element with only `right` showed at `left: 0`. |
| **Model defaults and parsing.** The defaults of the model, or the parser, do not agree with the file. | `149f75e3` and `53d54f0d`: the white root. `149f75e3`: a flow child changed to absolute position. |

The first three causes are **rendering** causes. The canvas draws a
result that is different from the browser result.

The fourth cause is a **round-trip** cause. The model loses data that
was in the file.

The rendering options in this document fix the first three causes. Only
a canvas that renders the file itself fixes the fourth cause.

## Known data

- **Most inline styles are removed**
  ([canvas-inline-layer-peel.md](../notes/canvas-inline-layer-peel.md)).
  These inline styles stay:
  - Width, height, position, and offsets, for drag operations.
  - The minimum height of the root.
  - The size of the instance wrapper box.
  - The `box-sizing` and margin resets.
  - Grid placement.
- **An iframe gives a real viewport.** We measured this in the app:
  - A 390px iframe in a 1440px window has an `innerWidth` of 390.
  - `@media` rules in the iframe use 390, not 1440.
  - The parent document can measure the iframe content and get access
    to it, because the iframe is same-origin.
  - A scale on a parent element does not change the viewport of the
    iframe.
- **The phase A test passed** (`60d0183a`).
  - Each parity fixture rendered in an iframe in the app. Each result
    was the same as the browser result. This includes fonts and
    `theme.css`.
  - A breakpoint fixture also passed. The current canvas cannot pass
    this fixture.
- **Your decisions from the iframe plan stay the same:**
  1. Do a test first. Delete the test code after. Then do the full
     migration.
  2. Do not release the change until you test it manually. The new
     canvas must feel equal to or better than the current canvas.
  3. The canvas must not use the Next.js dev server. A document that
     Scamp generates is satisfactory, if it is equal to the preview and
     it is fast.
  4. Use one iframe for each page or component that you edit.

## The methods of other tools

| Method | Tools | Parity | Cost |
|---|---|---|---|
| **1. The real app in an iframe.** An injected script does selection and drag operations. | Onlook, Lovable, v0, Builder Fusion, Tempo, Bolt | Almost perfect. The canvas *is* the preview. | Each project needs a dev server. Hit tests are asynchronous and use `postMessage`. The frame stops when the app has an error. Each edit waits for a hot reload. Instances are not in the DOM. |
| **2. The editor renderer in same-origin iframes.** There is one iframe for each breakpoint, at the real width. Each iframe loads the real CSS. | Plasmic, Puck, GrapesJS, Webflow, Framer (DOM), the Builder.io SDK | Good, if the renderer is equal to production. | The renderer is a second implementation. CSS from the host app can go into the frames. Plasmic frames show black because of this problem. |
| **3. A render in the same document as the editor** | Utopia, Craft.js, **Scamp now** | The weakest. The editor controls `body`, inheritance, and the viewport. | Selection and measurement are the most simple. |
| **4. A renderer that does not use the DOM** (WebGL, Skia) | Penpot (new engine), Figma Sites | Parity is not a goal. The export is a separate translation. The Figma forums show differences. | Fast for large files. |
| **5. Limit the model to what code can show** | Subframe, and partially Framer and Webflow | This is a rule, not a renderer. Use it with method 1 or 2. | Fewer features. |

Two techniques occur in many tools:

- **Optimistic style change.** Onlook and Lovable first write the edit
  into an injected `<style>`. The change shows immediately. Then the
  tool writes the file, and the hot reload follows. This hides the
  time that the save takes.
- **Stable IDs on the DOM.** Onlook uses `data-oid`. Lovable uses
  `data-component-id`. These IDs connect a DOM node to its source.
  Scamp has `data-scamp-id` already.

No tool with good parity renders in the document of the editor. The
appendix gives the research sources.

## The options

For each option, this section gives:

- What the option renders.
- Which of the four causes the option fixes.
- The cost of the option.

### A. Keep the canvas in the same document, and fix the known problems

- Inject `theme.css` inside `@scope`. Then remove the resets from the
  inline styles.
- Set the instance wrapper boxes to `display: contents`. Then they do
  not add boxes.
- Keep only temporary values as inline styles, during drag operations.
- Add a fixture for each type of problem that we found.

**Fixes:** some DOM that only the canvas has. The `theme.css` part of
the viewport replacements.

**Does not fix:**

- `@container` compared to `@media`: `vw` and `vh` units,
  `position: fixed`, and the frame of the component editor.
- The `body` and `html` rules.
- Inheritance from the editor interface.

**Cost:** small. We can do it in small steps.

**Result:** this option is the current method with more fixes. We will
continue to fix one problem at a time. No tool with good parity uses
this method.

### B. A same-origin iframe, with the Scamp renderer in it

This option is the current iframe plan.

- `ElementRenderer` renders into the iframe document through a React
  portal.
- The iframe loads `theme.css`, the fonts, and the generated
  stylesheet. The stylesheet has no `@scope` and keeps its real
  `@media` rules.
- Overlays, handles, and hit tests move to the parent document. They
  read the geometry synchronously through `contentDocument`.

Plasmic and Puck use this method.

**Fixes:** all of the viewport replacements. We can remove these items:

- `@scope`.
- The `@container` change.
- The media rule fix in the component editor.
- The copied resets.

**Does not fix:**

- DOM that only the canvas has. The instance wrapper boxes, the variant
  frames, and the inline drag values stay, if we do not also remove
  them.
- Model defaults and parsing.

**Cost:** large. Selection, drag, resize, and text editing all must
work across the iframe boundary. The interaction code stays our code
and stays synchronous. This is the main reason that the speed can stay
equal to the current speed.

**Risks:**

- React portals across two documents. React attaches events to the
  host document.
- Text editing inside the iframe.

### C. A same-origin iframe that renders the generated output

This option is the same as option B, with one difference. The iframe
does not draw from the model with Scamp components. The iframe draws
the output that `generateCode` writes:

- The markup of the page, with each instance expanded in its position.
- The exact stylesheets.

There are two methods to do this.

**C1. Use the HTML export.**

- `generateHtml.ts` changes the model into static HTML. It expands the
  instances and adds a prefix to their classes.
- `htmlExportCss.ts` flattens the CSS to agree with the HTML.
- Render this output into the iframe.
- When the design changes, update the DOM with a keyed diff on
  `data-scamp-id`.
- No compiler is necessary.

**C2. Compile the TSX in the renderer.**

- Compile the generated TSX with a small transform (sucrase or
  esbuild-wasm).
- Render the result with React in the iframe. Include the bindings and
  sample data of views.
- For views, C2 is more accurate than C1.
- C2 adds a dependency, and a compile for each change.

**Fixes:**

- All of the viewport replacements, as in option B.
- **Also the DOM that only the canvas has.** There are no wrapper
  boxes, because the generated page does not have them.
- Each variant frame becomes one iframe.
- The canvas renders the same output that a save writes. Thus the
  canvas agrees with the preview, also when the model loses data.

**Does not fix:** model defaults and parsing. If an external edit
contains data that the parser loses, a save still changes that data.
But this becomes a round-trip problem, not a parity problem. The
round-trip tests find it.

**Cost:** the interaction work from option B. Also, the canvas tools
must move out of the render tree:

- The minimum height of an empty page.
- The drop targets for slots.
- The drag box of an instance. The root element of the instance
  becomes the drag box. Commit `05dd1df3` already uses the root
  element as the hit target.
- The drag previews. These become optimistic style changes.

**Risks:**

- C1 is a second generator, next to the TSX generator. The two
  generators can become different. The oracle of the harness does not
  use C1, so a fixture finds this problem.
- A full render for each key press is too slow for large pages. Thus
  the diff must be keyed and fast.

### D. The real dev server in an iframe

- Run `scamp dev` for the project.
- Set the canvas iframe to `/_views/<Name>`.
- Inject a script that adds IDs to nodes, does hit tests, and changes
  styles.
- Use `scamp dev` only. Do not use `next dev`, because of your
  decision.

Onlook and Lovable use this method.

**Fixes:** all four causes, also model defaults and parsing. The canvas
runs the file on the disk.

**Cost:**

- Each open project needs a server process before the canvas can draw.
- Each edit waits for a write and a hot reload. Lovable says that this
  takes "seconds".
- Hit tests are asynchronous and use `postMessage`.
- When the code has an error, the canvas stops.
- Instances are not in the DOM. Thus selection needs the source mapping
  work that Onlook describes.
- Next.js projects get no improvement.

**Result:** this option gives the best parity, but the slowest edits.
The canvas is not "smooth and fast". The canvas also depends on the
save pipeline. You asked us to prevent this.

### E. A renderer that does not use the DOM

This option uses Skia or WebGL, as the new Penpot engine does. We
include it only to reject it. With this option, parity is always a
translation problem.

## Comparison

| | A | B | C1 | C2 | D |
|---|---|---|---|---|---|
| DOM that only the canvas has | partially | no | **yes** | **yes** | **yes** |
| Viewport replacements | partially | **yes** | **yes** | **yes** | **yes** |
| Inline drag values | partially | with the style change | **yes** | **yes** | **yes** |
| Model defaults and parsing | no | no | no | no | **yes** |
| Edit speed | the same as now | the same as now | the same as now, if the diff is fast | one compile for each change | a write and a reload |
| Works for Next.js projects | yes | yes | yes | yes | no |
| New dependency | none | none | none | a transform | none |
| Size of the change | small | large | large | large, plus C1 | large, plus a server |

## The effect on the workspace plan

[workspace-canvas-plan.md](workspace-canvas-plan.md) puts all pages and
components on one infinite canvas. It has one live frame. The other
frames are read-only renders. All frames are under one `translate()
scale()` transform.

The workspace plan expects an iframe change. One `FrameHost` component
draws the frames. Thus a change to iframes changes one component, not
the workspace.

| Option | Effect on the workspace |
|---|---|
| A | No effect. The workspace plan uses this method now: one stylesheet scope for each frame, and `@container` for breakpoints. |
| B, C1, C2 | **No block.** These options give some advantages and add some work. See the lists after this table. |
| D | **Almost a block.** See the list after this table. |
| E | No block, but we reject E for parity. |

**Advantages of B and C for the workspace:**

- Each frame is a real document. The per-frame stylesheet scope
  (`[data-scamp-frame]`) is not necessary.
- The same page at more breakpoints, next to each other, uses real
  `@media` rules. This is open question 4 of the workspace plan. With
  `@container`, `vw` and `vh` units are not correct.
- With C1, a read-only frame is static HTML. It does not need a React
  tree for each frame. This can make the frames faster.
- The global DOM lookups in phase 3 of the workspace plan become
  lookups in the `contentDocument` of the active frame. The
  `activeFrameElement()` helper in that plan agrees with this.

**Work that B and C add to the workspace:**

- **Pan and zoom over a frame.** Wheel and pointer events inside an
  iframe do not go to the parent document. Set `pointer-events: none`
  on the inactive frames. Then the parent gets the events, and uses
  `contentDocument.elementFromPoint` for hit tests. For the active
  frame, send the wheel events to the parent with a listener inside
  the iframe. If we do not do this, Ctrl+wheel inside the active frame
  does not zoom the workspace.
- **Many documents.** 30 to 40 frames are 30 to 40 documents. The
  memory and the time to open are not known. Culling and the thumbnail
  fallback of the workspace plan help, but we must measure.
- **Thumbnails.** `exportCapture.ts` copies DOM nodes from the main
  document. It must read from the iframe document.
- **Text caret at zoom.** The Notebook test showed a correct caret at
  0.5×, 1×, and 2× zoom in the main document. We must do the test again
  inside a scaled iframe.

**Why D is almost a block:**

- Each frame is a full page load of the dev app, with its own bundle
  and hot reload client. 40 frames are 40 app loads.
- Each read-only frame needs the asynchronous `postMessage` bridge.
- `scamp dev` has a route for views (`/_views/<Name>`). Components do
  not have a route. Component frames need a change to the scampjs
  contract.
- Next.js projects get no frames.

**Order of the work:** do this experiment before phase 2 of the
workspace plan. Phase 1 (split the Viewport) is necessary for both
plans. If C1 continues, phase 2 must use iframes in `FrameHost` from
the start. Then we do not build per-frame `@container` scopes and
remove them later.

## Recommendation

**Use C1, with the phases of option B. Make the decision after a test
on this branch. The test has a time limit.**

- C1 removes the most causes. It does not need a server or a compiler.
- C1 uses a generator that Scamp already has and tests.
- Hit tests stay synchronous and stay in our code.
- C1 is method 2. Each tool with good parity and fast edits uses method
  2. C1 adds one step: it renders the generated output, not the model.
- Model defaults and parsing then belong to the round-trip tests. That
  is the correct location for them.

The interaction phases of option B are the same work for C1:

1. Overlays in the parent document.
2. Hit tests.
3. Drag operations.
4. Text editing.

If we change the render step later, we do not lose this work.

## The test

First, render only. Measure the results. If the results are bad, delete
the code. We do not release this test.

1. **Render.** Add a developer flag. When the flag is on, draw the open
   page into a same-origin `srcdoc` iframe, as in C1:
   - Make a `<head>` one time. It contains `theme.css`, the fonts, and
     the flattened stylesheet.
   - Use the `<body>` from the HTML export. When the design changes,
     update it with a keyed diff.
   - Set the iframe to the width of the artboard. Scale it with the
     zoom.
2. **Measure parity.** Set the parity harness to measure the iframe:
   - Geometry, paint, and computed style for each fixture.
   - New fixtures that fail on the current canvas: breakpoints, the
     component editor, and nested instances.
3. **Measure speed.** Use three pages: a blank page, a large imported
   page (the 24,248px marquee page), and the Songs view in glitch. The
   Songs view has many instances. Measure:
   - The time to the first draw.
   - The time from a property change to the paint.
   - The memory.
4. **Overlays only.** Draw the selection outline and the handles in the
   parent document. Get their positions from `getBoundingClientRect`
   through `contentDocument`. Do not add edits yet. Make sure that the
   overlays follow the zoom and the scroll.
5. **Many frames.** Put 30 read-only C1 iframes under one
   `translate() scale()` transform, as the workspace does. Use the
   pages of a large project. Measure:
   - The time to open and the memory.
   - The frame time during pan and zoom.
   - The frame time at 0.2 zoom, with all frames on the screen.
6. **One interaction.**
   - Click to select an element through the iframe.
   - Drag an element. During the drag, write an optimistic style into
     the iframe. When you release the element, write the file.
   - Compare this drag with the current drag.

**Continue if all of these are true:**

- Each parity fixture passes. This includes the new fixtures.
- On the large page, a property change paints in one frame (16ms) or
  less.
- You think that the drag feels the same as the current drag.
- 30 frames pan and zoom at 60 frames per second, or the thumbnail
  fallback of the workspace plan is sufficient below 0.2 zoom.

**Stop if one of these is true:**

- The diff is too slow on the large page.
- Selection through the iframe cannot be synchronous.

If we continue, the migration gets its own plan. That plan uses the
phases of option B and the render step of C1.

## Results of the test

We ran steps 1 to 6 on 2026-10-30, on the `exp/canvas-rendering`
branch. The code is in `src/renderer/src/canvas/experiment/`. The
measurements are in `test/e2e/parity/iframe-c1*.spec.ts`.

**Decision: continue (go), after you test the drag manually.**

### Parity

- All 14 parity fixtures pass in the iframe. Geometry and computed
  styles agree with the browser.
- A new fixture, `viewport-height-units`, also passes. It uses `50vh`.
  The current canvas fails it: there, `vh` is the height of the app
  window.
- **We found a divergence in the current canvas.** The canvas draws the
  root of each view at 900px or more. The preview draws the root at the
  height of its content. This occurs because the scampjs templates
  give no `min-height: 100vh` to a view root ("the shell's `body` owns
  the viewport"). The canvas adds its own height floor. You see this
  difference when a view root has a background color. The iframe draws
  the view correctly.
- **The parity oracle must use the saved file.** When a project opens,
  Scamp can write the seeded file again. For example, a page becomes a
  view, and the view root loses `min-height: 100vh`. The test oracle
  now renders the saved CSS, because the preview renders the saved CSS.

### Speed

Each page had 96 to 1,001 elements. "Edit to paint" is the time from a
background change in the store to the second animation frame. It
includes the work of the full app and at least one frame wait.

| Page | Elements | Edit to paint now (p50) | Edit to paint in the iframe (p50) | Build and patch in the iframe |
|---|---|---|---|---|
| Ruixen (imported) | 206 | 82 ms | 33 ms | 8.9 ms |
| Gainwix (imported) | 218 | 73 ms | 35 ms | 7.6 ms |
| Resova Health (imported) | 221 | 53 ms | 33 ms | 5.6 ms |
| glitch Songs | 96 | 29 ms | 23 ms | 3.7 ms |
| Synthetic | 1,001 | 100 ms | 47 ms | 8.3 ms |

- **The iframe is faster than the current canvas on each page:** 1.3 to
  2.5 times, at the median.
- **A style change** costs 3.7 to 8.9 ms to build and patch. This is
  less than one frame (16 ms). The markup does not change, so there is
  no DOM patch.
- **A change to the markup** (add, delete, text) costs more. Before we
  skipped the patch for style changes, a patch on the Ruixen page took
  12.6 ms, plus 7 ms to build. That is approximately 20 ms, more than
  one frame. The patch is simple now. It matches children by position.
  A keyed patch, or a patch of only the changed subtree, can make it
  faster.
- **The first draw** takes 43 to 56 ms.
- **Memory:** the iframe uses 14 to 60 MB more than the current canvas.
  This measurement is not exact, because the old canvas is not released
  immediately.

### 30 frames under one transform

| Page in each frame | Time to load | Memory added | Pan at 0.25 zoom (p50 / p95) | All frames on the screen at 0.2 zoom (p50 / p95) |
|---|---|---|---|---|
| glitch Songs | 0.36 s | 41 MB | 8.3 / 11 ms | 8.4 / 50 ms |
| Synthetic, 1,001 elements | 0.69 s | 133 MB | 8.4 / 18 ms | 16.7 / 49 ms |

- The test display runs at 120 Hz, so one frame is 8.3 ms.
- Pan at 0.25 zoom is smooth.
- With all 30 frames on the screen at 0.2 zoom, some frames are slow
  (p95 49 to 50 ms). The thumbnail fallback below 0.2 zoom, from the
  workspace plan, is necessary.

### Selection and drag

- Click to select works through the iframe. The hit test is
  synchronous. It uses `contentDocument.elementFromPoint`.
- The selection outline is in the parent document. It follows the zoom.
- A drag moves the drawn node with `translate` first. On release, it
  writes one `moveElement` in one history step. The file changes by the
  correct number of pixels. A delete removes the node from the iframe.
- **You must judge how the drag feels.** A test cannot do this.

### Problems that the test found

- **Objects from the iframe fail `instanceof` checks.** A node in the
  iframe belongs to the window of the iframe. Its `HTMLElement` and
  `Element` are not the ones in the app window. Thus `instanceof`
  checks are always false. This stopped the drag. It also stopped the
  DOM patch inside elements, and no test found that until we added the
  delete check. In the migration, use `nodeType` checks or the
  constructors of the iframe window. Add a lint rule for this.
- **The height of the iframe can only increase.** `100vh` in the iframe
  follows the height of the iframe. If the iframe gets its height from
  its content, the two change each other. The test lets the height
  increase only. The migration needs a better rule: for example, a
  fixed viewport height, and a separate height for the content.

### Comparison with the go and stop conditions

| Condition | Result |
|---|---|
| Each parity fixture passes, with the new fixtures | **Yes**, 15 of 15 |
| A property change paints in one frame on the large page | **Yes** for style changes (3.7 to 8.9 ms). **Almost** for markup changes (about 20 ms on the Ruixen page) |
| The drag feels the same as the current drag | **Not known.** You must test it |
| 30 frames pan and zoom at 60 frames per second, or the thumbnail fallback is sufficient | **Yes** at 0.25 zoom. Below 0.2 zoom, use the thumbnail fallback |
| Stop: the diff cannot keep up | Did not occur |
| Stop: selection cannot be synchronous | Did not occur |

### What the test does not do

The iframe mode is a test. It is not a complete canvas. It does not
have these items:

- The draw tools, the resize handles, text editing, and reorder of
  flow children.
- The component editor. The component editor uses the current canvas.
- Changes to the light or dark theme while the iframe is open.
- Fonts that load after the iframe opens.

### How to try it

1. Run `npm run dev` on the `exp/canvas-rendering` branch.
2. Open a project, and open a page or a view.
3. Open the developer tools (**Ctrl+Shift+I**), and type
   `__scampIframeCanvas.set(true)` in the console.
4. Click elements, and drag an absolute element. Compare it with the
   current canvas: type `__scampIframeCanvas.set(false)`.

The setting stays after a restart. Set it to `false` when you finish.

## Open questions

1. **One iframe or more?** Now the canvas shows one breakpoint at a
   time. With iframes, it is easy to show more breakpoints next to each
   other, as Framer and Pinegrow do. Do you want this, or is it out of
   scope?
2. **Views with bindings.** C1 renders a view with sample data, as the
   HTML export does. Is this sufficiently equal to the preview? Or do
   views need C2?
3. **Text editing.** Where does text editing occur?
   - On the canvas, inside the iframe.
   - Or in an overlay editor in the parent document. An overlay editor
     is easier to build. But it shows the styles of the text less
     accurately.

## Appendix: sources

- **Onlook:** the real app in iframes. A `postMessage` bridge.
  `data-oid` IDs. An injected `CSSManager` that applies the edit
  before the file write.
  <https://github.com/onlook-dev/onlook>,
  <https://docs.onlook.com/developers/architecture>
- **Utopia:** runs the user code in the document of the editor. Adds
  paths to the DOM.
  <https://github.com/concrete-utopia/utopia>
- **Plasmic:** one same-origin iframe for each artboard. The Plasmic
  interpreter renders with the React of the host. CSS from the host
  goes into the artboards.
  <https://docs.plasmic.app/learn/app-hosting/>,
  <https://github.com/plasmicapp/plasmic>,
  <https://forum.plasmic.app/t/multiple-issues-with-code-components-version-conflicts-black-backgrounds-preview-errors/10708>
- **Builder.io:** the real site in an iframe. The content arrives
  through `postMessage`. The same SDK renders in the editor and in
  production.
  <https://www.builder.io/c/docs/how-builder-works-technical>
- **Webflow:** the canvas renders the internal format of Webflow. Code
  components use Shadow DOM.
  <https://webflow.com/blog/getting-to-the-source>,
  <https://developers.webflow.com/code-components/component-architecture>
- **Framer:** a DOM canvas that uses the same React runtime as the
  published sites. Each breakpoint is a separate frame.
  <https://www.framer.com/blog/why-framer-uses-react-to-build-sites>
- **Penpot:** a new Rust/Wasm engine on Skia. It replaces SVG, for
  speed.
  <https://www.wearedevelopers.com/videos/1353/rendering-design-software-in-the-browser-at-penpot>
- **Lovable:** `lovable-tagger` IDs. An optimistic DOM update. Then a
  small diff and a hot reload, in "seconds".
  <https://lovable.dev/blog/visual-edits>
- **Puck:** a same-origin iframe at the viewport widths. It copies the
  styles of the host.
  <https://puckeditor.com/docs/integrating-puck/viewports>
- **GrapesJS:** canvas iframes with overlay "spots".
  <https://grapesjs.com/docs/modules/Canvas.html>
- **Figma Sites:** a WebGL editor with an HTML/CSS output. The forums
  report differences between them.
  <https://forum.figma.com/ask-the-community-7/font-breakpoints-within-components-not-functioning-on-preview-published-sites-41865>

The data about the internal design of Webflow and Framer comes from
search summaries, not from their own articles. The data about Tempo,
Figma Make, and Bolt is our interpretation. These rows are less
certain.
