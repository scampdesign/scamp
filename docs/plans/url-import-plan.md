# Import a page from a URL — Plan

Status: **proposed** — for review. Open questions at the bottom; several
change the shape of the work and are worth settling before Phase 1.

Source story: `docs/archive/backlog-10.md` §3. The sibling story (§4, Figma
import) shares this plan's back half — everything from "DOM tree →
ElementTree" onwards is the same problem with a different front end, so
the seam between fetch and translate is drawn deliberately.

## Context

A user pastes a URL; Scamp brings that page in as a page or a component
they can then edit. The value is the cold-start problem: rebuilding an
existing page by hand to use it as a reference is the tax that stops
people trying Scamp on real work.

The promise is explicitly **a starting point, not a clone**. That framing
is doing real work in this plan — it is what makes several otherwise
blocking problems merely imperfect.

## What already exists

More than it first appears. This feature is mostly assembly.

| Need | Already there |
|---|---|
| DOM → tree, with real cascade | Electron's Chromium. Render offscreen, walk the live DOM. |
| Emit TSX + CSS | `generateCode` |
| Validate the result | `parseCode` + the round-trip invariant |
| Subtree → component | `extractSubtreeAsComponent`, `generateComponentFromSubtree` |
| Page / component on disk | `createPage`, `createComponent` (`src/main/ipc/`) |
| Assets, WebP, format-aware paths | `saveImageBuffer`, `copyImage`, `assetsDirFor` |
| Google Fonts in a project | `parseFontEmbed`, `googleFontsEmbed.ts` |
| HTML / CSS parsing | `htmlparser2`, `postcss`, `dompurify` — all present |
| Offscreen BrowserWindow pattern | `previewWindow.ts` (`show: false`, `contextIsolation: true`, `nodeIntegration: false`) |

**No new dependencies.** Worth stating up front, because "import a web
page" reads like it needs a scraping stack and it does not.

The inverse feature already shipped: `htmlExport.ts` / `generateHtml.ts`
turn an ElementTree into standalone HTML + CSS. Read it before starting.
Anything it had to special-case going out is something this will hit
coming in.

---

## The central problem: computed styles do not fit the model

The story says "resolves computed styles for each element". Taken
literally that produces unusable output, and this is the single decision
the feature lives or dies on.

`cssToScampProperty` understands **47 properties**. Chromium's
`getComputedStyle` returns roughly **340**. Every property Scamp cannot
type goes to `customProperties`, which `generateCode` emits verbatim at
the end of every class block.

So a naive import writes ~295 declarations per element. A 500-element
page becomes ~150,000 declarations of mostly `border-block-start-color:
rgb(0, 0, 0)`. The CSS module is megabytes, the properties panel is
useless, and the canvas — which now mounts the page's real stylesheet —
has to parse all of it on every keystroke.

### The fix: diff against a fresh element of the same tag

For each element, compare its computed style against the computed style
of a **bare element of the same tag in the same document**, and keep only
the properties that differ. Browser defaults, inherited-and-unchanged
values, and the UA sheet all fall away. What survives is approximately
"what the page's author actually wrote", which is what we want.

Concretely: hold one hidden `<div>`, `<p>`, `<h1>`, … per tag in the
offscreen document, read each one's computed style once, and use it as
the baseline for every element of that tag.

Two refinements, both necessary:

- **Inheritance.** An element inheriting `font-family` from `<body>`
  differs from a bare `<div>` and would be kept, re-stating the font on
  every node. For the ~20 inherited properties, diff against the
  **parent element's** computed value instead, so the declaration lands
  once at the level that set it.
- **A property allowlist for the tail.** Even after diffing, keep only
  properties that are plausibly visual. A denylist of vendor-prefixed and
  `-webkit-` internals removes most of the remainder.

Order matters: diff first, then split into typed fields (the 47) and
`customProperties` (the rest). Expected result is single-digit to low-tens
of declarations per element, which is a design a person can edit.

**This should be measured before anything else is built** — see Phase 0.

---

## Structure: what becomes what

The story's mapping (`div` → rectangle, `p`/`span`/`h1-h6` → text, `img`
→ image) is right but incomplete. Scamp elements carry a `tag` alongside
`type`, so the semantic tag is preserved rather than flattened.

| Source | Scamp |
|---|---|
| `div`, `section`, `nav`, `header`, `footer`, `main`, `article`, `aside` | rectangle, `tag` preserved |
| `p`, `h1`–`h6`, `span`, `a`, `li`, `label` | text, `tag` preserved |
| `img`, `picture > img`, `svg` | image (svg via the existing inline-SVG path) |
| `input`, `select`, `textarea`, `button` | input / rectangle per existing element types |
| `script`, `iframe`, `noscript`, `style`, `link`, `meta` | dropped |
| `br`, `hr` | dropped in v1 |

**Collapsing.** Real pages nest wrapper divs many levels deep for layout
reasons that Scamp's model does not need. A pass that collapses a
single-child wrapper contributing no styles into its child would cut
element counts substantially. Proposed for v1 behind a conservative rule
(no background, border, padding, or layout role); flag if you would
rather ship without it and see the raw tree first.

**Text.** A `<p>` containing only a text node becomes one text element.
A `<p>` with mixed inline children (`<span>`, `<a>`, bare text) is the
awkward case — Scamp's `InlineFragment` already models exactly this, so
inline children that carry no distinguishing style collapse into
fragments rather than becoming elements.

---

## Layout and position

Scamp's `position: auto` sentinel means "let the tree shape decide": root
is `relative`, flex/grid children flow, everything else is `absolute` at
a stored `x`/`y`.

- **Flex and grid parents** — set `display`, direction, alignment, and gap
  from the diffed computed style; children get `position: auto` and flow.
  This is the good path and the story is right to call it out.
- **Everything else** — children get `x`/`y` from
  `getBoundingClientRect()` **relative to the offset parent**, not the
  viewport. Getting this wrong is the classic import bug: everything
  lands correct at the root and nothing nests.
- **`position: fixed` / `sticky`** — preserve the typed value. Note the
  canvas renders sticky at rest by design
  ([note](../notes/canvas-sticky-position.md)), so an imported sticky nav
  will sit in place rather than float. Correct, and worth expecting.

Viewport width is the project's widest breakpoint (default 1440). One
width only — see Limitations.

---

## Fonts

Three paths, decreasing in fidelity.

**Google Fonts.** If the page links `fonts.googleapis.com`, parse the
families and weights out of the href and add the same embed to the
project via the existing `parseFontEmbed` path. High fidelity, no new
machinery, no licensing question — Google Fonts are open-licensed.

**Self-hosted `@font-face`.** Collect `@font-face` rules with `postcss`
from the linked stylesheets, download the `woff2`/`woff` sources, and
write them under the assets dir. **This hits a wall worth knowing about
now:** the app's CSP declares

```
font-src 'self' https://fonts.gstatic.com https://use.typekit.net https://p.typekit.net data:
```

`scamp-asset:` is allowed for `img-src` but **not** `font-src`, so a
downloaded font referenced through the asset protocol is blocked on the
canvas with no visible error — it silently falls back. Two options:

1. Widen `font-src` to include `scamp-asset:` (one line, consistent with
   how images already work).
2. Inline the font as a `data:` URI in the project CSS (already allowed,
   but bloats `theme.css` by ~50-100KB per face).

Option 1 is the recommendation. It needs a deliberate call because it is
a CSP change; see Open questions.

**Licensed / unreachable fonts.** Preserve the `font-family` stack
verbatim and surface the family in the post-import report as needing
manual setup. The full stack including fallbacks is kept regardless, so
the page degrades the way its author intended.

---

## Images and assets

Download each `img` source, then hand the bytes to **`saveImageBuffer`**
(`src/main/ipc/imageOps.ts`) — the clipboard-paste entry point, which
takes a `Buffer` rather than a source path and is therefore the right
fit for a download. It runs `bufferToWebpIfSmaller`, so WebP conversion,
the 3000px long-edge cap, and format-correct references (`/assets/…` on
Next.js, `./assets/…` on legacy) all come for free. `copyImage` is the
file-path sibling used by the pickers; don't reach for it here.

One caveat that matters at import scale: `bufferToWebpIfSmaller` writes
each buffer to a temp file because the optimizer child works from a
path. Its comment reasons that this is free "because pasted images are
small" — true for a screenshot, less true for forty images off a
marketing page. If Phase 0 shows this dominating import time, the fix is
a buffer-capable path into the child, not a bypass of the optimizer.

- `srcset` / `picture` — take the source the browser actually chose
  (`currentSrc`), not the first candidate.
- CSS `background-image: url(...)` — same treatment; rewrite the URL in
  the declaration before it lands in `customProperties`.
- Data URIs — decode and write as a file rather than carrying kilobytes
  inline.
- Cross-origin failures are non-fatal: keep the absolute URL, report it.

---

## Import as component

Reuses the existing extraction path rather than a parallel one: build the
ElementTree exactly as for a page, then `extractSubtreeAsComponent` +
`generateComponentFromSubtree`, then `createComponent`.

The only new decision is **which subtree**. A whole page imported as a
component is rarely what someone wants — the story's examples are "a
header, card, etc.". Options: import the whole body and let the user
delete, or offer a CSS selector field in the dialog. Recommend the
selector field, defaulting to `body`, as it is a small addition that
makes the feature match its stated use.

---

## Rendering an untrusted page safely

This feature executes arbitrary third-party JavaScript on the user's
machine. That is not incidental — running the page is *how* we get real
computed styles — so it needs to be deliberate.

- Dedicated `session` partition, cleared and destroyed after each import.
  Never the default session: an import must not touch the user's
  sign-in cookies.
- `sandbox: true`, `nodeIntegration: false`, `contextIsolation: true`,
  no preload with privileges. Note `previewWindow.ts` uses
  `sandbox: false`; do **not** copy that here — it exists for the
  `<webview>` case.
- Block new windows, downloads, permission requests, and navigation away
  from the origin.
- Hard timeout (~30s) covering load and settle, then destroy the window
  regardless.
- **Refuse private-network and loopback URLs** unless the user explicitly
  confirms. Otherwise "import from URL" is an SSRF primitive pointed at
  the user's own LAN and any local admin panel.
- `http://` allowed but warned; `https://` expected.

Only the extracted JSON — a plain tree of tags, styles, and asset URLs —
crosses back out of that window. No page-controlled string is ever
executed on our side.

---

## IPC surface

As the story specifies, with types in `src/shared/types.ts` and channel
constants in `src/shared/ipcChannels.ts` (never inline strings).

| Channel | Direction | Payload |
|---|---|---|
| `import:url` | renderer → main | `{ url, importAs, selector? }` |
| `import:url:progress` | main → renderer | `{ step, percent }` |
| `import:url:complete` | main → renderer | `{ pageId }` or `{ componentId }` |
| `import:url:error` | main → renderer | `{ message }` |

Progress steps are user-legible, not internal: fetching, rendering,
reading styles, downloading images, downloading fonts, writing files,
validating. A 500-element page with 40 images is a genuinely slow
operation and silence will read as a hang.

Handler lives in `src/main/ipc/urlImport.ts`, with the pure translation
logic in `urlImportOps.ts` so it is testable without Electron — the split
`authService` / `ipc/auth.ts` already uses.

**Menu.** The File menu is currently the stock `{ role: 'fileMenu' }`
with no custom items, so this is the first entry that needs a real
submenu built around the role's defaults.

---

## The round-trip gate

The story requires it and it should be a hard gate, not a warning:

```
generateCode(imported) → parseCode → deep-equal the input
```

If it fails, the import does **not** open. Write nothing, report the
failure with the offending element. An import that silently produces a
tree Scamp cannot re-read would corrupt the user's project on their first
save — the failure mode the round-trip invariant exists to prevent.

Realistically this will fail often at first, and each failure is a real
bug in the translation. Treat the gate as the primary development
feedback loop rather than a final check.

---

## Phases

**Phase 0 — measure, before designing anything.** Offscreen-render three
real pages (a marketing page, a docs page, an app dashboard). Report:
element count, computed-property count per element raw vs. diffed, how
many diffed properties are typed vs. `customProperties`, and the size of
the resulting CSS. This validates or kills the diff approach and sizes
everything downstream. Nothing else starts until this is in.

**Phase 1 — fetch and extract.** Offscreen window with the security
posture above; walk the DOM; emit the intermediate JSON tree. No Scamp
types yet. Output inspectable as a file.

**Phase 2 — translate.** Intermediate tree → ElementTree. Tag mapping,
the style diff, layout/position, text and inline fragments. Pure and
unit-tested against fixtures captured in Phase 1. The round-trip gate
lands here.

**Phase 3 — assets and fonts.** Images through `copyImage`; Google Fonts
through the existing embed path; `@font-face` download plus the CSP
decision.

**Phase 4 — wire it up.** IPC, File menu, dialog, progress, the
pre-import expectation notice, the post-import report of detected fonts
and anything that failed.

**Phase 5 — import as component.** Selector field and the extraction
path.

---

## Files to touch

**New:** `src/main/ipc/urlImport.ts`, `src/main/ipc/urlImportOps.ts`,
`src/main/urlImport/` (offscreen render, DOM walk, style diff, font
collection), `src/renderer/lib/domToElements.ts` (pure translation),
`src/renderer/src/components/ImportFromUrlDialog.tsx`.

**Modified:** `src/shared/ipcChannels.ts`, `src/shared/types.ts`,
`src/main/menu.ts`, `src/preload/index.ts`, `electron.vite.config.ts`
(if the CSP widens), plus a `docs/user_docs/` page and a changelog entry.

---

## Tests

Per CLAUDE.md, everything in `src/renderer/lib/` needs full coverage —
`domToElements.ts` is the bulk of it.

- Tag mapping including every dropped tag.
- Style diff: inherited vs. non-inherited, UA defaults falling away, a
  property that differs only in serialization not value.
- Position: nested absolute children resolve against the offset parent.
- Flex and grid parents produce flowing children, not absolute ones.
- **Round-trip on captured fixtures** — the load-bearing test. Real HTML
  from Phase 0 lives as a fixture; the assertion is that translation
  round-trips.
- Integration: temp dir, fake fetch, assert files on disk and no network.
- Unhappy paths: 404, timeout, non-HTML content type, empty body, a page
  that is one giant canvas, a redirect to a different origin.

---

## What this plan does NOT do

Scripts, iframes, interactive behaviour, pseudo-element content,
animations, keyframes, complex selectors beyond what the cascade already
resolved into computed values, multiple breakpoints, `@supports`, and
shadow DOM. Also not authentication — pages behind a login are out, and
the dialog should say so rather than appearing to hang.

---

## Open questions

1. **Widen `font-src` to `scamp-asset:`?** Needed for self-hosted fonts
   to render on the canvas. Recommendation: yes. The alternative is
   data-URI inlining, which bloats `theme.css`. yes
2. **Wrapper collapsing in v1?** Substantially better output, some risk
   of collapsing something load-bearing. Recommendation: yes, with a
   conservative rule. yes
3. **Selector field in the dialog**, or import the body and let the user
   delete? Recommendation: selector field, defaulting to `body`. go with your rec
4. **Element ceiling.** Is there a count above which we refuse rather
   than produce something unusable — 2,000? Phase 0 should inform this. I'm not sure on this I would go with your rec. im initial reaction is no block, but a warning.
5. **How loud is the expectation-setting notice?** A dismissible line in
   the dialog, or a confirm step? The "best-effort, not a clone" framing
   only works if the user actually read it. a warning like this is good
6. **Does this share a seam with Figma import (§4)?** If Phase 2's input
   is a documented intermediate format rather than a DOM-shaped one,
   Figma import reuses Phases 2-4 entirely. Slightly more work now,
   likely much less later. that sounds good to me!
