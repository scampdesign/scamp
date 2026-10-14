# Framework release readiness — gaps and fixes

Written 2026-09-22, from a read of the branch `fix/img-binding-decode`
against what a release that makes the Scamp framework (`scampjs`) the
primary format has to be able to claim.

The five items from `agent-framework-gap-report.md` are done. This is
what a second pass found once they were: three real gaps, two recorded
flakes, and the state of the branch itself.

Short version: the only thing that would stop a tag is that **the e2e
suite has never been run against the scamp format as a whole**, and
there is no CI that would have noticed. The rest is small.

---

## 1. The scamp format has no end-to-end coverage as a whole

**Status: green in all three formats. CI gap remains.**

Final run, 2026-09-22, after the fixes below and the default flip:

| Format | Result |
|---|---|
| scamp (the new default) | 488 passed, 1 skipped, 0 failed — 18.9m |
| legacy | 488 passed, 1 skipped, 0 failed — 18.9m |
| nextjs | 488 passed, 1 skipped, 0 failed — 18.8m |

Unit suite alongside it: 3376 passed, 1 skipped, 234 files.

`test/e2e/fixtures/project.ts` defaults a test project to `legacy`:

```ts
const format = opts.format ?? (envFormat === 'nextjs' || envFormat === 'scamp' ? envFormat : 'legacy');
```

So the scamp path runs only where a spec sets `format: 'scamp'`
explicitly, or under `SCAMP_E2E_FORMAT=scamp`. And
`.github/workflows/release.yml` runs no tests at all — it installs,
builds, and publishes. There is no workflow that runs Playwright, so
nothing has ever exercised the format this release is about.

This is not theoretical. `../archive/2026-09-16-framework-phase-5-plan.md` records that
running just the **canvas** specs under `SCAMP_E2E_FORMAT=scamp` found
four failures, all with one cause: a view kept the component artboard
instead of the page canvas. That was one folder out of thirty.

**Result (2026-09-22):** 489 tests, **464 passed, 24 failed**, 20.9
minutes. All 24 are now fixed. They fell into three groups:

| Cause | Tests |
|---|---|
| Harness: specs assuming the legacy page layout | 12 |
| A tool list this branch had grown without updating the e2e spec | 1 |
| **Real product bugs in the framework format** | 11 |

**The harness group** was one mistake repeated: specs wrote
`path.join(project.dir, 'home.module.css')` instead of asking the
fixture, which has been format-aware all along. That only resolves in a
legacy project; under scamp a page is a view at
`views/Home/Home.module.css`, so the spec ENOENTed before testing
anything. Same for the assets folder (`public/assets/` outside legacy)
and for the filenames the Code panel displays (`Home.tsx`, not
`home.tsx`). The fixture now exposes `tsxPath`, `cssPath`,
`themeCssPath`, `assetsDirPath`, `tsxName` and `cssName`, and the
specs use them.

**The three product bugs share one root cause — the same one behind the
Replace-image bug in item 6.** Code that reads `activePage` or
`project.pages`, both of which are empty in every framework project:

1. **The Code panel labelled both panes "— no page —"** on every page
   of every framework project. `CodePanel` built its labels from
   `activePage?.name`. The content was right; only the labels were
   dead. (2 tests)
2. **The Link section offered "No pages in this project"**, so you
   could not link between pages at all, and `classifyHref` marked every
   internal href as broken. The store's `pageNames` came from
   `project.pages`. `previewTarget` in `ProjectShell` already derived
   the list correctly from views — the store sync just never did.
   (3 tests)
3. **HTML export produced nothing.** `buildHtmlExport` takes `pages`,
   and it was handed `project.pages`. Views now go in as pages, named
   by slug so the output filenames and internal hrefs still line up,
   with non-view components passed separately. (2 tests)
4. **Previewing a snapshot silently did nothing.** `previewSnapshot`
   opened with `if (activePage === null) return`, so clicking any entry
   in the History panel was inert on every page of every framework
   project — a safety net that looked present and wasn't.
   `ActiveComponent` carries the same `tsxPath` / `cssPath`, so the fix
   is to take whichever target is open. (4 tests)

That is **five** instances of one mistake, counting the Replace-image
guard, and a sixth already fixed before this branch (`CssPanel`'s
`editTargetRef`). Reading `activePage` or `project.pages` is the
defining hazard of this format change: both are empty in every
framework project, and every one of these failed *silently* — an inert
button, a dead label, an empty export, a list with nothing in it. None
raised an error, which is why none had been noticed.

That sweep has been done for the renderer (2026-09-22) and came back
clean: `CssPanel` routes through whichever target is active,
`storeSubscription` compares both via `toEditTarget(activePage,
activeComponent)`, `loadComponent` sets the history page id from
`component.tsxPath`, and `ProjectShell`'s `previewTarget` already
derives everything from views. The remaining `activePageName` reads are
sidebar selection state, which is a different thing.

Worth repeating the grep after any feature that touches the open
target, since every instance so far has been silent rather than loud.

None of these would have been caught by the unit suite, and none was
visible from reading the code without running it. That is the argument
for the CI gap below.

**The e2e default is now `scamp`** (`fixtures/project.ts`). It was
`legacy`, so a plain `npx playwright test` — what a person or a CI job
runs — exercised the format that matters least, which is how those 24
failures sat undiscovered. A spec that pins `opts.format` still wins,
and `SCAMP_E2E_FORMAT=legacy|nextjs` still selects the others.

Worth a follow-up: **49 specs pin `format: 'nextjs'`** against 5 for
scamp and 1 for legacy, so the framework layout is still the least
covered even after the flip. Most of those pins are probably "needs
components, which legacy lacks" rather than "is about Next.js", and
auditing them would move real coverage onto the format this release is
about.

Next.js was re-run in full after all (the machine was free), and is
green. Before that it had only the specs this branch touches (54
passed), which covers the blast radius: this branch changed `escapeJsx`, which alters generated
TSX for every format, and the fixture accessors, which every spec uses.
That check immediately caught one: the Code panel labels a Next.js page
`home.tsx` while its file is `app/page.tsx`, so a basename-derived
expectation was wrong there. The fixture now derives the label from the
target's name rather than from disk.

**Still open: there is no CI running any of this.** A release workflow
that builds and publishes without running the suite means the next
regression of this kind lands in a tag. Adding a workflow is outside
this branch, but it is the thing most likely to let this happen again.

**Note on method:** an e2e run measures `out/`, built by
`electron-vite build`, which resolves `.js` shims over `.ts` exactly as
the dev server does. `npx tsc --build tsconfig.web.json --force`
has to precede `npm run build`, or the run measures the last shim
regeneration rather than the current source. The bundle hash printed by
the build is the tell: unchanged hash means unchanged code.

---

## 2. An image can't be bound to data from the UI

**Status: fixed.**

`TAG_ATTRIBUTES` in `lib/elementTags.ts` has entries for `video`,
`iframe`, `input`, `button`, `form`, `label`, `blockquote`, `time`,
`dialog`, `textarea` — and none for `img`.

The Data tab's `attributeCandidates` builds its list from the typed
attributes for the tag, plus `a`'s link attributes, plus whatever is
present in the attribute bag, plus whatever is already bound. For an
`<img>` all four are empty: there is no `img` entry, `src` and `alt`
are typed fields rather than bag entries, and an unbound image has no
bindings yet. So the Data tab offers **nothing** to bind.

An agent writing the file can create `src={product.image}`, and since
the parser fix (`5d5c574`) that now works end to end. A designer
cannot. Shipping "images can be data-driven" in a release where only
agents can make one is the wrong shape.

**The fix is not to add `img` to `TAG_ATTRIBUTES`** — `ElementSection`
renders an input per entry, so that would put a second Src and Alt
field in the Element section, duplicating the ones the Image section
already owns. Bindability and panel-rendering are different questions
for this tag, so they need different lists.

---

## 3. Regenerating a file rewrites `&` as `&amp;`

**Status: fixed.**

`escapeHtml` escapes `&` in every attribute value and text body. An
agent writes:

```tsx
<img src="https://images.unsplash.com/photo-1441986300917?w=2000&q=80" />
```

and the next canvas save rewrites it to `&amp;q=80`. JSX decodes the
entity, so the rendered result is identical and the round-trip is
stable — it does not compound across saves. But in a tool whose whole
premise is bidirectional sync with files a human and an agent both
edit, a save that dirties lines nobody touched is worse than cosmetic.

Nothing is lost by stopping. The parser decodes entities on the way in
either way, so a literal `&amp;` in the source already arrives as `&`;
not re-escaping on the way out makes the file *more* faithful to what
was written, not less. `<`, `>` and `"` still have to be escaped.

---

## 4. Two recorded flakes

**Status: one fixed, the rest recorded with better leads than "flaky".**

`docs/todos.md` #2 has `canvas/draw-into-flex.spec.ts` failing once
under parallel load. The auth loopback specs joined it during this
branch's work, and chasing them produced something more useful than
"flaky": the failure reproduced 3 times out of 3 in a window
immediately after a full `npm run test`, then stopped and has passed
every run since. The two files use non-overlapping port ranges and each
already carries a comment describing a previous fix for this same
flake, so a third speculative fix without a live repro would be
guesswork. `docs/todos.md` #2 now records how to re-open the window —
run the full suite, then immediately loop the two auth files — which is
the part that was missing.

---

## 6. Correction: the Replace-image bug was far wider than described

`cfbcc1b` says Replace image was dead "in the component editor". That
understates it, and the commit message is wrong about the blast radius.

`src/main/ipc/project.ts:80` — **a scamp-format project has no pages at
all**:

```ts
const pages = format === 'scamp' ? [] : …
```

Every view lives in `project.components` with `kind: 'view'` and opens
through `openComponent` → `loadComponent`, which sets `activeComponent`
and clears `activePage` (`useActiveTarget.ts:83`: "A framework project
has no pages: its first view opens instead"). A view is only a *page*
in a Next.js or legacy project.

So `if (!activePage) return` in `handleReplace` meant **Replace image
did nothing on every page of every framework project**, not just in the
component editor — which is exactly what was reported, and what I
initially told Angie was probably unrelated. The same held for
BackgroundSection's "Set background image".

Two things follow:

- The fix matters more than its commit says. The e2e spec exercises it
  through a component, which is the same `activeComponent` code path,
  so the coverage is right even though its name reads narrower.
- **The Data tab is reachable for views**, because `isComponentEditing`
  is `activeComponent !== null` and that is true for every view. Item 2
  above is therefore reachable in a framework project, which was worth
  confirming before fixing it — a bindable `<img>` in a panel nobody
  could open would have been pointless.

---

## 5. The branch is unmerged and mostly undriven

**Status: for Angie.**

Nine commits on `fix/img-binding-decode`. The image fixes have been
exercised in the real app. These have not:

- the `<img>` binding parser fix — needs the six product images
  confirmed on the canvas in `ecommerce-store`
- `scamp_check_view` and `scamp_get_conventions` — need one real call
  each from a Claude Code session in the Scamp terminal
- the regenerated `agent.md` — cheapest to check and highest
  consequence, since it rewrites into every project on open

`ecommerce-store`'s Product view also still has unsaved canvas state on
`.product_img_a9a6` (`position: absolute; left: 0; top: 0`, not in the
CSS module) that predates this work. Decide whether to keep or discard
it before saving, so it isn't read as part of the fix.

---

## Not blockers

- **The Next.js path.** Frozen but first-class and tested, per
  `nextjs-sunset.md`. Its removal criteria are explicitly about a later
  release: the migration offered for several releases, and telemetry
  showing Next.js projects at a negligible share of opens.
- **Framework phases.** 1 through 4 are all marked implemented in their
  plans. Phase 5 is further adapters (Node, Vercel, Netlify), scoped as
  demand shows.
- **Sentry in development.** `enabled` follows the user's opt-in, not
  the build type, so a dev session transmits — tagged `environment:
  development`, so it is filterable. Working as designed; a decision to
  revisit rather than a gap.
- **The Linux GPU console noise** (`vaInitialize`,
  `GetVSyncParametersIfAvailable`). Expected under the forced X11
  backend, see `linux-wayland-ozone.md`.
