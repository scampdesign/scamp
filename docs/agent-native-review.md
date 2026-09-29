# What BuilderIO/agent-native can teach Scamp's importer

A read of [BuilderIO/agent-native](https://github.com/BuilderIO/agent-native)
(6.9k stars, TypeScript monorepo, "A framework for building agentic apps"),
focused on its design app — `templates/design/` — and its HTML import path,
with an eye on what transfers to Scamp.

Reviewed 2026-09-29, against `HEAD` that day. Files read in full:
`templates/design/app/lib/design-import.ts`,
`templates/design/actions/import-design-source.ts`,
`templates/design/server/lib/import-design-files.ts`,
`templates/design/app/pages/design-editor/html-layer-positioning.ts`,
`templates/design/FIGMA_INTEROPERABILITY.md`, `PARITY-LOG.md`, and the
`design-editor-architecture` skill.

---

## Read this before copying anything

**The repository has no LICENSE file**, and GitHub's API reports no detected
licence. Its root `package.json` declares `"license": "ISC"`, which is
permissive — but a declaration in a manifest with no licence text is a
conflict, not a grant. Treat everything below as **ideas to learn from, not
code to lift**, and resolve the licensing question before any of their source
is copied. That matters more now that Scamp is proprietary: a provenance
argument is much harder to make after the fact.

---

## The one architectural difference, which explains the rest

**Their design format is HTML.** Import barely transforms anything:
`normalizeImportedHtmlDocument` strips scripts and event handlers, wraps a
fragment in a document, and stores it. Editing is `DOMParser` → mutate the
element → serialise back, addressed by a `data-agent-native-node-id`
attribute. `buildCodeLayerProjection` projects that HTML into a layer tree for
the UI. The file is the model.

**Scamp reduces.** A capture becomes a constrained element model, which
becomes TSX plus a CSS Module. That reduction is the product: it is why Scamp
emits code a person would be willing to own.

Neither is wrong, and this is not an argument to switch. But it is worth
naming plainly:

> agent-native does not have Scamp's 94%-fidelity problem, because it never
> throws anything away. It has a different problem — nothing guarantees that
> arbitrary imported HTML is *editable*, or that an edit is expressible.

Scamp is paying a fidelity cost for a code-quality benefit. That trade is
defensible and probably correct. The useful move is to be explicit about it
and to measure both halves — which is exactly what their fidelity contract
does and Scamp's import report does not.

---

## 1. The fidelity contract — the highest-value idea here

`templates/design/FIGMA_INTEROPERABILITY.md` is 1,522 lines and opens:

> This is the acceptance contract for Figma interoperability in Design. It is
> deliberately stricter than a feature checklist: a path is only **exact**
> when the original visual result **and the relevant editable semantics**
> survive. A rendered fallback can be pixel-faithful while still losing
> editability, so it is reported separately.

And later:

> Those boundaries make a universal lossless round trip impossible; the
> product must report them instead of claiming success.

The structure is a per-construct matrix — *Figma construct | Representation in
Design | Fidelity and residual limit* — plus a workflow table with a
**Required verification** column ("REST fixture, authenticated file,
screenshot comparison").

Three fidelity levels, not two:

| Level | Meaning |
|---|---|
| **Exact** | Pixels *and* editable semantics survive |
| **Approximated** | Representable, but not identically — rotation reconstructed from the post-rotation bounding box; radial/angular gradients as CSS radial/conic |
| **Rendered fallback** | Pixels survive, editability does not — filtered/rotated image crops, gradient text, OpenType overrides |

### Why this matters to Scamp right now

`src/renderer/lib/importReport.ts` grades every finding with a boolean,
`lost: true | false`. That conflates two different failures, and it has a
blind spot the pixel harness shares:

```ts
svg: {
  label: (n) => `${n} inline ${n === 1 ? 'icon' : 'icons'} kept as markup —
                 they render, but are not editable as shapes`,
  lost: false,
},
```

The label already says the right thing — *renders, not editable* — but the
grade says `lost: false`, and a pixel diff scores it **100%**. That is
precisely agent-native's "pixel-faithful while still losing editability". The
new `scripts/import-pixels.mjs` cannot see this class of loss **at all**, by
construction, and the current 99% goal is silent about it.

**Recommendation.** Replace the boolean with three levels — `exact` /
`approximated` / `rendered-fallback` — and add a "what you can still edit"
line to the fallback entries. This is a small change to `importReport.ts` and
the import window's report list, and it makes the report honest about the axis
the pixel score cannot measure.

---

## 2. `PARITY-LOG.md` — the practice worth stealing outright

A running log of measured comparisons against a reference implementation
(Figma), 227 lines and growing. Every entry has the same spine:

1. **Measured reference behaviour**, with the method named — "measured via CDP
   input on page `textedit-probe`, 126px Inter" — and real numbers.
2. **What Design did before**, with the repro.
3. **Cause**, in one sentence naming the actual code.
4. **Fix**, naming the file *and the spec that fails without it*.
5. **Re-run result.**

What makes it good is the vocabulary for outcomes that are not "fixed":

`FIXED` · `NOT REPRODUCED` · `DEFERRED` · `NO CHANGE` · `NOTICED (not fixed)` ·
`Not matched, deliberately` · **`Retraction:`**

That last one is real:

> **Retraction:** a `blob:` URL once persisted after a failed local upload; it
> came from the pre-existing optimistic preview path with no upload provider
> configured, not from this change.

They also record the *harness's own* limitations beside the findings:

> Tooling note: osmouse reports `accessibility:false` from this agent's
> process, so OS clicks are silently dropped; Figma text-edit gestures worked
> with CDP `page.mouse`.

### Why this matters to Scamp right now

This is the discipline Scamp already half-practises — `docs/notes/` for causes,
"the test must fail without the fix" — but scattered across commit messages
instead of accumulating in one readable place. The current importer push is
generating exactly this material and losing most of it:
`docs/notes/import-variable-fonts.md` and `import-positioned-insets.md` are two
entries of what should be one log.

The "not fixed" vocabulary is the valuable half. Scamp's importer work keeps
producing findings that are neither shipped nor wrong — the inset heuristic
that gained 5.2 points on one site and lost 1.7 on another sat in limbo until
it got its own note. `NOTICED (not fixed)` and `Not matched, deliberately`
give those a home.

**Recommendation.** Start `docs/notes/import-parity-log.md` with that spine and
that status vocabulary. Fold the two existing import notes into it as the first
entries.

---

## 3. They hit Scamp's variable-font bug, and solved it the same way

From `templates/design/shared/design-template-presets/landing-dtc.ts`:

```
family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..700,100;1,9..144,300..700,100
```
```css
.serif { font-family:'Fraunces', serif; font-variation-settings:'SOFT' 100; }
```

Same typeface, independently: they name `opsz` and `SOFT` explicitly in the
Google Fonts URL rather than requesting weights alone, and they set
`font-variation-settings` in the CSS.

Two things follow.

**The fix shipped in `8c12cbf` is the right shape.** Independent
corroboration, from a team that clearly hit the same wall.

**The gap left open is confirmed real.** That note records that gainwix's
source set `font-variation-settings: "SOFT" 100` and Scamp's capture does not
carry it. agent-native sets it explicitly *because it matters* — so this is
worth closing rather than leaving as a footnote. `CAPTURED_PROPERTIES` in
`src/shared/importCapture.ts` is the one-line change; the work is in
`font-optical-sizing` and the inheritance rules around it.

---

## 4. Fail loudly rather than silently degrade

From the fidelity matrix, on image fills:

> Missing image URLs **fail the import** instead of silently disappearing.

Scamp does the opposite today. In `useWebsiteImport.ts`, a failed image fetch
is collected into `failedAssets` and reported, and the import proceeds:

```ts
if (got.ok) downloaded.set(asset.url, got.relativePath);
else failedAssets.push(`${new URL(asset.url).pathname.split('/').pop()}: ${got.error}`);
```

That is a defensible choice — an import that mostly worked beats no import —
and the report does say so. But it should be a *decision*, not a default. The
asymmetry worth noticing: a missing hero image is a visibly broken page, while
a missing decorative icon is not, and the current code treats them the same.

**Recommendation.** Keep continuing, but escalate: if a failed image is above a
size or area threshold, grade it `rendered-fallback` and open the report on it
(the report already auto-opens when something is `lost`).

---

## 5. Strategy is recorded in the result

Their `ImportResult` carries:

```ts
strategy?: "restNodes" | "htmlFallback" | "localKiwi";
figmaApiKeyMissing?: boolean;
unresolvedImages?: number;
matchStatus?: "matched" | "ambiguous" | "none" | "error";
```

Three import strategies with explicit fallback, and the result says which one
ran and why. When a user reports "the import was bad", the first question —
*which path did it take?* — is already answered.

Scamp has one capture path, so this maps less directly. But the same instinct
applies: `CAPTURE_VERSION` is already on the payload and is not surfaced
anywhere a user or an agent can see it. When an import is wrong six weeks from
now, knowing which capture version produced it is the difference between a
diagnosis and a guess.

---

## 6. The edit-fidelity harness — a different *kind* of test

From `templates/slides/scripts/edit-fidelity/README.md`:

> Drives the real Slides editor in Chromium and checks one rule: clicking into
> text, typing, pressing Enter, or just leaving an edit **must not change any
> styling or layout** on the slide. Unit tests have repeatedly missed breaks on
> this path. […] only a real browser rendering real CSS shows what the user
> sees.

It runs in CI for pull requests touching those areas.

This is an **invariance** test, not a comparison test, and Scamp has nothing of
the kind at the UI level. The pure-function round trip
(`generateCode` → `parseCode`) is the same idea one layer down, and it is the
repo's most valuable contract — but it cannot see a canvas interaction that
rewrites a file it should have left alone.

**Recommendation.** One e2e spec: open an element for editing, click away
without typing, assert the file on disk is **byte-identical**. Then the same
for entering and leaving each properties-panel section. This is cheap, and it
targets the class of bug that the current style-loss issue in
`MEMORY.md` belongs to.

---

## 7. Agent-facing engineering, which is their actual thesis

The repo is built to be worked on by agents, and two habits stand out.

**Skills that exist purely to stop an agent wasting its context.** The
`design-editor-architecture` skill says:

> `DesignEditor.tsx` is ~20,900 lines and holds only three things: state
> declarations, the `useCallback` wrappers that gather arguments, and the JSX.
> […] **To change what an editor action does, edit the command module.**
> Opening `DesignEditor.tsx` to change behavior is almost always the wrong
> move — it will exhaust your context before you find the code.

**A task → file routing table.** 86 one-per-action modules under
`design-editor/commands/`, and a table mapping "Undo / redo", "Paste",
"Style commit", "Layer move / rename" to exact filenames.

Scamp's `CLAUDE.md` is genuinely good — better written than their equivalent —
but it is all *rules* and no *map*. It says how to write code and what must be
tested; it does not say where anything is. A "common task → file" table would
have saved real time this week: finding where theme tokens reach the canvas
took four greps through `src/renderer/store/canvas/slices/`.

**Recommendation.** Add a task → file table to `CLAUDE.md` covering the ten
most-edited paths (capture, reduce, generate, parse, canvas render, properties
panel, theme tokens, IPC, thumbnails, import).

---

## What not to copy

- **Their HTML sanitiser.** `sanitizeImportedHtml` is a chain of regexes over
  markup. It is the wrong tool for the job and well known to be bypassable;
  Scamp's reduction to a typed model is structurally safer, and
  `sanitizeInlineMarkup` is the only comparable surface.
- **A 20,900-line component.** Their own skill exists to route agents *around*
  that file. The routing table is the good idea; the file it routes around is
  not.
- **HTML as the design format.** It makes their import nearly lossless and
  their generated code nobody's idea of clean. Scamp's reduction is the
  product.

---

## Recommendations, in the order I would do them

| # | Change | Effort | Why now |
|---|---|---|---|
| 1 | Three-level fidelity in `importReport.ts` | Small | The pixel push is optimising a number that cannot see editability loss |
| 2 | `docs/notes/import-parity-log.md` with the status vocabulary | Small | The current work is generating these findings and losing them |
| 3 | Capture `font-variation-settings` / `font-optical-sizing` | Small | Known gap, now independently corroborated |
| 4 | Escalate large missing images to a reported fallback | Small | Silent degradation on the one asset that matters most |
| 5 | Edit-invariance e2e spec | Medium | Targets the style-loss class directly |
| 6 | Task → file table in `CLAUDE.md` | Small | Pays for itself in a session |

Nothing here changes the importer's architecture. The strongest single idea is
the first one: **agent-native measures visual fidelity and editability as two
separate axes, and reports them separately.** Scamp currently measures one and
grades the other with a boolean — which is a gap the pixel harness, by its
nature, will never surface.

---

## Sources

- [BuilderIO/agent-native](https://github.com/BuilderIO/agent-native)
- [`templates/design/FIGMA_INTEROPERABILITY.md`](https://github.com/BuilderIO/agent-native/blob/main/templates/design/FIGMA_INTEROPERABILITY.md)
- [`PARITY-LOG.md`](https://github.com/BuilderIO/agent-native/blob/main/PARITY-LOG.md)
- [`templates/design/server/lib/import-design-files.ts`](https://github.com/BuilderIO/agent-native/blob/main/templates/design/server/lib/import-design-files.ts)
- [`templates/design/app/lib/design-import.ts`](https://github.com/BuilderIO/agent-native/blob/main/templates/design/app/lib/design-import.ts)
- [`templates/slides/scripts/edit-fidelity/README.md`](https://github.com/BuilderIO/agent-native/blob/main/templates/slides/scripts/edit-fidelity/README.md)
