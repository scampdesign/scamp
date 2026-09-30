# Why an agent's imported screens don't look right

A review of a user's project (`Frontend-design`), where 60 screens were
built by an agent through Scamp's MCP rather than through the importer.
Two views in the same project were imported with the importer, which
makes them a control: same project, same theme, same conventions file.

Measured by running Scamp's own `parseCode` and `lintView` over every
view, plus rendering two of them through the HTML exporter.

| | views | elements | findings | per element |
|---|---|---|---|---|
| agent | 60 | 5,765 | **6,906** | 1.20 |
| importer | 2 | 466 | 186 | 0.40 |

Nothing fails to parse. Every one of the 62 views round-trips through
`parseCode` cleanly. The problem is not malformed files.

---

## The one thing that explains the look

**6,339 of the agent's 6,906 findings are `undeclared-token`** — 92% of
everything wrong. The importer's two views have **zero**.

`design/theme.css` declares ten custom properties:

```css
--font-sans  --font-mono  --font-inter  --maxw
--r-xs  --r-sm  --r-md  --r-lg  --r-xl  --r-pill
```

Three typefaces, a max width, six radii. **No colours at all.**

The views reference **246 distinct tokens, 237 of them undeclared**, and
the most-used are all colour:

| uses | token | declared? |
|---|---|---|
| 972 | `--ink` | no |
| 827 | `--line` | no |
| 725 | `--surface` | no |
| 637 | `--ink-3` | no |
| 594 | `--ink-2` | no |
| 272 | `--surface-2` | no |
| 269 | `--brand` | no |

The agent designed a coherent colour system — ink, surface, line, brand,
`--teal-*`, `--risk-*` — and never wrote it down. `var(--ink)` with no
declaration is invalid at computed-value time, so the property falls
back: text inherits, backgrounds go transparent, borders take
`currentColor`.

Rendering `P03Patients` through the HTML exporter and sampling the first
50 elements:

- **50 of 50** have default-black text
- **45 of 50** have a transparent background

The same measurement on the importer's `ResovaHealth`: **0 of 190** with
default-black text.

So the screens are structurally right and entirely monochrome. That is
the whole "doesn't look great".

**Where the colours actually live:** `--ink` and the rest *are* declared
— in `about/*.html`, standalone documentation pages that the app never
loads, and in `scripts/riq/pages.ts`. The agent appears to have designed
the palette in those pages and then written views against it without
ever moving it into `design/theme.css`.

---

## The second visible problem

**0 of 60 agent views use a `Show` or `Repeat` binding.**

In the screenshot of `P03Patients` the loading spinner, the error state
("Patients could not be loaded"), the empty state ("No patients yet")
and the table header all render **at the same time**, stacked. The agent
built each state as a permanently visible block rather than binding it
to a condition.

The importer does not do this either, but it has an excuse: it copies a
page in one state. An agent designing a screen from scratch is choosing
to model states, and modelled them as stacked markup.

---

## The smaller ones

- **`not-panel-editable` — 286.** Values written in a form the
  properties panel cannot read, so the user cannot change them in Scamp.
  Example: `box-shadow: var(--sh-lg)` on `P01Login .overlay_card_2b5d`.
  The whole shadow falls through as a raw string, and the Shadows
  section shows nothing.
- **`side-not-typed` — 265.** `border-top-color` where Scamp types
  `border-color`. Renders correctly, drops out of the panel. Mostly
  spinners, where a one-sided border is the idiom.
- **`missing-sample` — 16.** `value={searchQuery}` with no default in
  the destructure, so the field renders empty on the canvas and the
  screen looks unfinished for a reason that is not a design decision.

---

## What this says about Scamp, not the agent

Three things here are ours, and the third is the one I would act on.

**The rule was already written, and clearly.** `agent.md` line 39, in
the project:

> Before referencing a token, check it exists in `theme.css`. Add
> missing tokens to `theme.css` first; never inline raw hex / rgba

So this is not a documentation gap. The agent had the rule, and the file
is **1,427 lines** — the rule is one line of it, competing with
everything else.

**Nothing enforces it, and nothing can.** Scamp's MCP is read-only:
there is no `scamp_write_view`. The agent writes files with its own file
tools, so Scamp is never in the write path and cannot check anything at
the moment it would matter. `scamp_check_view` and
`scamp_get_theme_tokens` both exist — the agent simply never had to call
them.

**`lintView` has no human-facing surface at all.** It is reachable only
through `canvasSnapshot`, which serves the MCP. A project can accumulate
6,339 undeclared tokens and *neither the agent nor the user is ever
told*, unless an agent volunteers to run a check. The user in this case
found out by looking at the screens.

---

## And one finding against our own importer

The control cuts both ways. Per element, the importer is **worse** than
the agent on the two panel-editability measures:

| finding | agent | importer |
|---|---|---|
| `side-not-typed` | 0.046 / element | **0.288** / element |
| `not-panel-editable` | 0.050 / element | **0.101** / element |

The importer writes about six times as much per-side border CSS and
twice as much unreadable-by-the-panel CSS as the agent did. It wins
overall only because it never invents a token. Worth its own look: an
imported view that renders perfectly and cannot be edited in the panel
is the `rendered-fallback` problem again, one level up.

---

## What I would do

1. **Surface `lintView` in the app.** The findings already exist and
   already name the element and the fix. A badge on a view that has
   undeclared tokens would have caught this on screen one instead of
   screen sixty. This is the highest-value change and the smallest.
2. **Make the canvas render an undeclared token visibly wrong**, or at
   least report it — silently falling back to black is what let 6,339 of
   these accumulate. A missing token is a mistake; it should not look
   like a design decision.
3. **Move the token rule out of prose.** 1,427 lines of `agent.md` is a
   lot of competition for one sentence. Given Scamp cannot gate the
   write, the next best thing is for `scamp_get_theme_tokens` to be the
   *obvious* first call — for example by having `scamp_get_conventions`
   return the declared token list inline, so an agent that reads
   conventions at all has the tokens in hand.
4. **Look at the importer's per-side CSS**, on its own evidence above.

Nothing here needs the user to redo their work: declaring the 237 tokens
in `design/theme.css` — they already exist in `about/` — would fix the
appearance of all 60 screens at once, without touching a single view.
