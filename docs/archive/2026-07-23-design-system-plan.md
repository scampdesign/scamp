# Plan — Design System / Theme upgrade

Planning doc for `docs/design-system-prd.md`. This is a **large, multi-phase**
feature — the plan proposes an incremental breakdown so each phase ships and is
reviewed on its own. The **token data model + `theme.css` format + recursive
resolution** are the foundation everything else depends on, so they come early
and get the most scrutiny.

---

## Current state (from investigation)

- **Token model is flat.** `ThemeToken = { name, value }` (`shared/types.ts:295`).
  No category stored — it's *inferred from the value string* by `classifyToken`
  (`lib/tokenClassify.ts`, 5 categories: `color | fontSize | lineHeight |
  fontFamily | unknown`). **No primitives/semantic layers, no per-theme values.**
  Spacing/border/radius tokens currently masquerade as `fontSize`; shadows have
  no category.
- **Parser reads `:root` only.** `parseThemeFile` (`lib/parseTheme.ts`) uses
  postcss, ignores `.dark {}`/other selectors, and stores raw values (a
  `var(--other)` value is kept literally, not expanded).
- **Serializer rewrites wholesale.** `serializeThemeFile` emits `@import`s + a
  single `:root { … }` block; comments and other selectors are destroyed.
- **Resolution is single-level + `^var(--x)$`-only** (`elementToStyle.ts:56-82`),
  **no chain following** — a semantic token pointing at a primitive would render
  the literal string `var(--primitive)`. **This gap must close for semantic
  tokens to work.**
- **Store:** one flat `themeTokens: ThemeToken[]` (`slices/designSystem.ts`),
  fed by two parse sites — project open (`useProjectTheme`) and the chokidar
  listener (`syncBridge/themeListener.ts`).
- **`theme.css` path** is format-aware: `app/theme.css` (nextjs) / `theme.css`
  (legacy) (`main/ipc/themeOps.ts`). IPC = `ThemeRead/Write/Changed`; watched
  with a fast path. This is the **user-project** file (distinct from the app's
  own chrome `theme.css`).
- **UI:** `ThemePanel.tsx` is a 603-line **portal modal** with 3 tabs
  (colors/typography/unknown), eager writes on every edit. Opened from the
  sidebar rail's Design System icon (`showThemePanel`) and from pickers' "+ Add
  token" (`openThemePanel` store opener).
- **Right panel:** `PropertiesPanel.tsx` (260px `aside`, `ProjectShell.tsx:430`).
- **Pickers consume tokens decentrally:** `ColorInput`, `SpaceTokenButton`
  (via `FourSideInput`/`SpaceValueInput`), `TokenOrNumberInput`, `FontPicker` —
  each filters `themeTokens` inline and inserts `var(--name)` on select, via
  `useColorPickerContext`.
- **Not built yet:** the legacy read-only gate (specced), and everything
  DESIGN.md (greenfield).

---

## Architectural foundations (build first, get right)

These three underpin every story. Recommended approach:

### A. A structured authoring model + a derived flat list

Keep the existing `themeTokens: ThemeToken[]` as the **derived, fully-resolved
list** that pickers and `elementToStyle` consume (so the ~8 picker call sites
barely change). Introduce a new **`DesignSystem` authoring model** that the
panel edits and that serializes to `theme.css`:

```ts
type DesignSystem = {
  primitives: Palette[];        // color palettes → --color-<palette>-<shade>
  semanticColors: SemanticToken[]; // --color-<name>, per-theme value map
  themes: ThemeDef[];           // { id, label, cssClass } — light (default), dark, custom
  typography: { fonts, scale, textStyles };
  spacing: Scale; radii: Scale; borders: Scale; shadows: ShadowToken[];
  // category is STORED here, not inferred
};
```

On load: parse `theme.css` → `DesignSystem` **and** flatten it to
`ThemeToken[]` (primitives + the active theme's semantic values) for the store.
On edit: update `DesignSystem` → reserialize `theme.css` **and** re-derive the
flat list. This isolates the big change to the model + parse/serialize +
resolution, leaving consumers stable.

### B. `theme.css` parse/serialize for multi-block, referenced tokens

- **Parse:** walk `:root` (primitives + default/light semantic + typography) AND
  `.dark` / `.theme-*` blocks (per-theme semantic overrides). Tag each token
  with `{ category, theme, isReference }`. Keep `var()` values intact.
- **Serialize:** emit organized, commented blocks — primitives, semantic
  (light in `:root`, others in `.dark`/`.theme-*`), typography, spacing, etc.
  Panel-authoritative (wholesale rewrite, like today, but structured). **Decide:
  does it need to preserve arbitrary user-authored CSS in `theme.css`?** (Q1)
- **Round-trip is the tightest constraint** — `parse(serialize(ds)) === ds`.
  Mandatory unit tests (`lib/`), like the generateCode↔parseCode invariant.

### C. Recursive, theme-aware token resolution

- Make resolution in `elementToStyle` **follow `var()` chains** (semantic →
  primitive → hex) with a **cycle/depth guard**, and loosen matching beyond
  `^var(--x)$` (at least handle the exact-var case through N levels; decide on
  `var(--x, fallback)` / `calc(...)` — Q2).
- Resolution must know the **active theme** (which `.dark`/`.theme-*` semantic
  values to use) for canvas preview (Phase 3). Add an `activeThemeId` to the
  store; the derived flat list uses that theme's semantic values.

### D. Backward compatibility + new-project scaffold

- **Existing projects:** parse their flat `:root` tokens into the model without
  loss — keep them as-is (a "custom/uncategorized" bucket or best-effort
  categorized); do **not** force-restructure. (Q3)
- **New projects:** scaffold the default palettes (Brand/Neutral/Error/Warning/
  Success × 9 shades), semantic tokens, type styles, spacing/radius/shadow
  defaults per the PRD. Where does scaffolding happen (project create IPC)? (Q4)

---

## Phased breakdown

Ordered by dependency + risk. Each is a shippable, separately-reviewed unit.

### Phase 1 — Move the editor into the right panel (PRD story 1)
Low-risk, high-visibility; also completes the deferred "inline Design System"
from the sidebar-nav work. Convert `ThemePanel` from a **modal → right-side
panel** that replaces `PropertiesPanel` when the Design System rail icon is
active (reuse the 260px `.panel` slot or the `.bodyContent` overlay pattern that
Settings already uses). Canvas stays interactive; panel has its own scroll;
remembers last-open section (session pref). Keep the **current flat token
editing** for now — no model change yet. Add the **legacy read-only gate**.

### Phase 2 — Token model foundation + Colors: primitives & semantic (story 2) — ✅ DONE
The foundation (A–D above) plus the Colors section:
- Structured model, multi-block parse/serialize, recursive resolution, migration.
- **Primitives:** palettes with 9 shades, add/rename/delete, per-shade color
  picker; "Generate palette" from a seed via **OKLCH** (Q5: color lib vs hand-roll).
- **Semantic:** mapping dropdown (grouped by palette) + resolved swatch; add
  custom; delete-warning when a primitive is referenced.
- Heavy `lib/` unit tests (round-trip, resolution chains, OKLCH scale).

**Shipped:**
- `lib/resolveToken.ts` — recursive `resolveTokenChain` (semantic→primitive→hex,
  null on dangling/cycle). Wired into `elementToStyle` (canvas) and `ColorInput`
  (picker swatches), replacing the old single-level resolvers.
- `lib/palette.ts` — `generatePalette` (OKLCH 50–900 ramp, `culori`); 10 shades
  (incl. 50) to match the generator, not 9.
- `lib/colorModel.ts` — `buildColorModel`, the derived VIEW (palettes + semantic).
- `ThemePanel` Colors section — Primitives (palette blocks, per-shade picker,
  Generate, rename-rewrites-refs, delete-with-ref-warning) + Semantic (palette-
  grouped mapping dropdown, resolved swatch, add-custom) + Other (non-`--color-*`
  colours). All `--color-*` tokens route to Colors by NAME so semantic `var()`
  values don't double-render in Unknown.
- `parseTheme.serializeThemeFile(parsed, existingCss?)` — in-place merge that
  preserves hand-written CSS / resets / comments (Q1). Callers (ThemePanel,
  FontsSection) read the file first.
- New-project scaffold (`DEFAULT_THEME_CSS`) — 5 primitive palettes + 10 semantic
  tokens + typography scale. **Deferred:** spacing/radius/shadow tokens are NOT
  scaffolded yet — they classify as lengths and would land in Typography until
  Phase 5 gives them name-aware sections. Backfill/migrate leave existing
  projects untouched (Q3).

### Phase 3 — Theme switcher: light / dark / custom (story 3) — ✅ DONE
- Per-theme semantic values; `.dark` / `.theme-*` CSS blocks.
- Theme tabs in the panel; **canvas preview** applies the theme's class to the
  root and resolves semantic tokens for the active theme (`activeThemeId`).
- A theme switcher in the **canvas toolbar** too.

**Shipped:**
- `lib/parseTheme.ts` — parses `.dark`/`.theme-*` blocks into `ThemeBlock[]`;
  `themeDefsFromParsed` / `themeDefFromClass` (Light always first), and
  `deriveThemeTokens(base, overrides)` (overlay semantic by name). Serializer
  emits + reconciles theme blocks in place (round-trip tested).
- Store (`designSystem` slice) — `themeBaseTokens` (:root), `themeOverrides`
  (blocks), `themes`, `activeThemeId`. `setThemeData(parsed)` loads all of it and
  derives `themeTokens` for the active theme; `setActiveTheme(id)` re-derives.
  Both parse sites (project open + chokidar) route through `setThemeData`.
  **Canvas preview needs no `.dark` class** — the canvas resolves tokens in JS
  and injects `themeTokens` as frame CSS vars, so re-deriving for the active
  theme is the whole mechanism.
- `ThemePanel` — themes are scoped to the **Semantic** area and rendered as
  **stacked blocks** (not tabs): a Light block that owns the token set (names /
  add / delete), then one block per theme below it. "+ Add theme" duplicates
  Light's semantic values into a new editable block (auto-named Dark → Theme N,
  rename inline in the block header; remove via the block's ×). Semantic edits
  route to `:root` for Light, to that theme's override block otherwise; the
  write path prunes orphaned overrides. Preview is the canvas toolbar
  `ThemeSwitcher` (hidden for light-only projects) — decoupled from panel
  editing. `FontsSection` writes base + overrides so a font edit can't clobber
  theme blocks.
- **Scaffold:** Light only (per Q) — no default `.dark`; users add themes.
- e2e: `test/e2e/themes/theme-switcher.spec.ts` (add Dark → `.dark` block + tab;
  edit-on-Dark writes to `.dark` not `:root`; canvas switcher toggles preview).

### Phase 4 — Typography tokens (story 4) — ✅ DONE
Font families (`--font-*`, Google/upload), type scale (preset ratios + custom),
**semantic text styles** (each emits a group: family/size/weight/leading/
tracking). A **"Text style" dropdown** in the WYSIWYG Typography section applies
a whole style at once. Delete-warning for styles used on elements.

**Shipped:**
- `lib/typographyModel.ts` — `buildTextStyles` groups `--text-<name>-<prop>`
  (family/size/weight/leading/tracking) into `TextStyle[]`; `isTextStyleToken`,
  `textStyleTokenName`, `textStyleLabel`, and `defaultTextStyleTokens` (the PRD
  default set: Display, H1–H4, Body large/Body/Body small, Label, Code). Unit-tested.
- `ThemePanel` Typography section reorganised into **Font families / Type scale /
  Text styles**. Text-style tokens route out of the generic buckets by name.
  Text Styles sub-section: per-style block (rename header + prop rows), add/rename/
  delete with a **usage-count delete-warning**; empty-state "+ Add default text
  styles" (full PRD set) + "+ Add text style". Text styles are global (base tokens).
- WYSIWYG `TypographySection` — a **"Text style" dropdown** applies a whole style:
  `var()` refs for family/size/leading/tracking, concrete number for weight (Q:
  token references). The dropdown reflects the applied style via the size ref, and
  text-style tokens are excluded from the individual size/weight/family pickers.
- **Type-scale preset generator deferred** (Q: keep editable rows) — `--text-*`
  scale tokens stay plain editable rows under "Type scale".
- **Scaffold:** add-on-demand (no default text styles in new projects) — keeps the
  scaffold lean and the WYSIWYG pickers unpolluted until the user opts in.
- e2e: `test/e2e/themes/text-styles.spec.ts` (add defaults → token groups; apply
  H1 → element linked to `var(--text-h1-*)` + concrete weight).

### Phase 5 — Spacing / border / corner / shadow tokens (story 5) — ✅ DONE
New **real categories** (extend `TokenCategory` + all inline `.filter` sites +
ThemePanel bucketing — the classification bottleneck). Scales with presets;
radius visual previews; shadows reuse the multi-layer shadow editor.
**Also scaffold** the default spacing/radius/shadow tokens here (deferred from
Phase 2 — they'd misclassify as lengths without these name-aware categories).

**Shipped:**
- `lib/tokenRoles.ts` — the classification bottleneck solved by NAME (these are
  all lengths/shadow strings, indistinguishable by value): `isRoleToken`,
  `isDesignRoleToken`, `roleTokenName`/`roleTokenLabel`, `tokensForRole`, and the
  PRD default sets (`--space-1…16`, `--border-thin/medium/thick`,
  `--radius-none…full`, `--shadow-sm…xl`). Unit-tested. `--color-border` is NOT a
  border-width token (prefix disambiguates).
- `ThemePanel` — four new sections (**Spacing / Border widths / Radius /
  Shadows**), routed by name out of the generic buckets. Each: add/rename(label)/
  delete/edit-value, empty-state "+ Add default …" + "+ Add token". Radius rows
  show a corner-preview swatch; shadow rows use a monospace box-shadow input.
- `ThemeSectionNav` gets the four sections; `parseTheme.groupRootTokens` emits
  `/* Spacing */`, `/* Border widths */`, `/* Radius */`, `/* Shadows */` blocks
  so theme.css stays organised (shadow comma-values round-trip).
- Picker hygiene: `TypographySection` excludes role tokens (and text-style
  tokens) from the size/line-height/family pickers — they classify as lengths but
  aren't type. **Positive picker wiring (radius/shadow/spacing pickers) stays
  Phase 6** per the split.
- **Scaffold:** add-on-demand (no defaults in new projects) — consistent with
  text styles + Light-only themes; keeps length pickers unpolluted until opt-in.
- e2e: `test/e2e/themes/design-tokens.spec.ts` (add defaults → grouped tokens;
  shadow multi-layer value round-trips; section nav lists + scroll-jumps).

### Phase 6 — Token pickers across the WYSIWYG (story 7) — ✅ DONE
Wire category-correct pickers everywhere per the PRD table (radius, border-width,
shadow presets, spacing, type scale, font family, text style). Mostly extends
the existing pickers now that categories are real (Phase 5) and semantic tokens
exist (Phase 2). Introduce a shared `tokensForCategory()` helper to replace the
scattered inline `classifyToken(...) === '...'` filters.

**Shipped:**
- `lib/tokensForField.ts` — the shared `tokensForField(field, tokens)` helper the
  plan called for: one source of truth mapping each WYSIWYG field (fontSize /
  lineHeight / fontFamily / letterSpacing / spacing / borderWidth / radius /
  shadow) to its eligible tokens, with category filtering + prefix prioritization
  (type fields drop design-role/text-style internals; length fields keep the
  design roles, drop text-style internals). Unit-tested.
- Refactored Border/Spacing/Layout/Typography sections onto `tokensForField`,
  removing the scattered `classifyToken(...) === 'fontSize'` + inline prioritize
  snippets (kept the prefix prioritization from the previous slice).
- **Shadow preset dropdown** (the one missing picker) — `ShadowsSection` gains a
  "Shadow preset…" `<select>` of `--shadow-*` tokens; picking one resolves the
  token's box-shadow value, parses it with `parseBoxShadowShorthand`, and
  replaces the element's structured shadow rows. (Model stores shadows
  structurally with no `var()`, so it's a one-time preset application, matching
  the PRD "replaces the rows with the token value".)
- Colors / spacing / radius / border / font-size / font-family / font-weight
  (via the Phase-4 Text-style dropdown) pickers already existed — this completes
  the PRD table.
- e2e: `shadow-preset.spec.ts` (preset → multi-layer box-shadow on disk);
  `tokensForField` unit tests; prioritization + refactor covered by the existing
  picker specs.

### Phase 7 — DESIGN.md generation (story 6) — 🚧 CORE DONE (forms + CLI deferred)
Largely independent; can run after the model (2/4/5) exists.
- New artifact `DESIGN.md` in project root (**Q6: exact filename** `DESIGN.md`
  vs `design.md`). YAML front matter auto-generated from tokens; markdown prose
  from the Design System forms; regen on change (debounced 500ms); parse prose
  back on external edit (YAML ignored on read — tokens are panel-authoritative);
  chokidar watch; `agent.md` reference.
- **CLI integration** (lint button, export). **Q7: verify the
  `google-labs-code/design.md` spec + `@google/design.md` CLI actually exist and
  are stable** before building to them — this is an external dependency and a
  real risk; if unavailable, we ship our own `DESIGN.md` format and skip the CLI.

**Q7 verified:** the spec repo (`google-labs-code/design.md`) and CLI
(`@google/design.md`, npm v0.3.0, `lint`/`diff`/`export`/`spec`) both exist —
alpha, so generation is kept self-contained. **Q6:** `DESIGN.md` (uppercase).

**Shipped (core, chosen over the full story):**
- `lib/designMd.ts` — `generateDesignMd(tokens, prose)` (YAML front matter:
  `name`/`description` + `colors` with `{colors.*}` refs for semantic tokens +
  `typography` from text styles (resolved) + `rounded`/`spacing` from role
  tokens; then prose sections in spec order) and `parseDesignMd` (reads
  name/description + section bodies back; ignores token YAML). Round-trip unit-tested.
- Main-process IPC (`DesignMdRead`/`DesignMdWrite`, `designMdOps.ts`) — DESIGN.md
  lives at the project root next to agent.md, both formats.
- `useDesignMdSync` — regenerates DESIGN.md from `themeBaseTokens` (debounced
  500ms), reading the existing file to preserve authored prose; writes only on
  change. Mounted in ProjectShell.
- `agent.md` template references `DESIGN.md` (both nextjs + legacy).
- e2e: `test/e2e/themes/design-md.spec.ts` (generated on open; token YAML
  regenerates while authored prose round-trips).

**Prose forms (added after core):**
- Store `designProse` (`name` / `description` / section bodies) + `setDesignProse`.
- `DesignDocSection` — a "Documentation" section at the bottom of the theme
  panel: project name, description, and a textarea per spec section (Overview…
  Do's and Don'ts), bound directly to the store (only this component subscribes,
  so keystrokes don't re-render the panel). Added to `ThemeSectionNav`.
- `useDesignMdSync` rewritten as two-way: loads prose on open, writes on
  token/prose change (debounced), and reads external DESIGN.md edits back into
  the forms via a `DesignMdChanged` watcher event — ignoring echoes of its own
  writes through a `lastWritten` ref so a self-write can't clobber in-flight edits.
- e2e extended: form edit → prose in DESIGN.md; external DESIGN.md edit →
  form fields populate.

**Still deferred:** the "Lint design system" CLI button (`npx @google/design.md
lint`) — written up as a separate follow-up story in
[`design-md-lint-plan.md`](./design-md-lint-plan.md).

---

## Cross-cutting risks

- **`theme.css` round-trip vs. hand edits.** A structured wholesale-rewrite
  serializer + chokidar reload can fight an agent/user hand-editing the file.
  The generateCode↔parseCode discipline (byte-stable round-trip, thorough tests)
  is the model to follow.
- **Resolution correctness.** Recursive var() following with cycles, missing
  refs, and per-theme values is subtle — needs a strong unit-test suite.
- **External-spec dependency (DESIGN.md CLI).** Verify before committing (Q7).
- **Scope.** This is weeks of work. Recommend building Phase 1 first (visible,
  low-risk), then Phase 2 (the foundation), reviewing each before proceeding.

## Testing

- **`lib/` (mandatory, this is where the rigor goes):** the new
  parse/serialize round-trip; recursive+theme-aware resolution; OKLCH palette
  generation; DESIGN.md YAML generation + prose parse-back; migration of legacy
  flat tokens.
- **E2E:** panel-as-right-panel open/close + legacy gate; add/edit primitive →
  semantic swatch updates → canvas element using it recolors; theme switch
  previews on canvas; text-style apply in WYSIWYG; token pickers per category;
  DESIGN.md written on edit.

---

## Open questions for review

1. **`theme.css` authority** — is the panel the sole author (structured wholesale
   rewrite, arbitrary hand-added CSS in `theme.css` not preserved), or must we
   preserve unknown user CSS around the managed blocks? I do want us to also respect any had written values into the theme.css file.
2. **`var()` resolution scope** — follow exact-`var(--x)` chains through N levels
   is required; do we also need `var(--x, fallback)` and `calc(var(--x)*2)`
   resolved on the canvas, or leave those as passthrough for now? we dont need the fallbacks or calc right now, but we should creat a follow up plan to support them after all design system work is done.
3. **Existing projects** — leave their current flat tokens as an "uncategorized/
   custom" bucket (recommended, no data loss) and only scaffold full defaults for
   NEW projects? Or attempt to auto-categorize existing tokens into primitives/
   semantic? leave as is.
4. **Where does the new-project default scaffold live** — generated at project
   creation (main IPC), or lazily on first theme-panel open if `theme.css` is
   empty? generate at project creation, so users can open and edit some default values or delete them and start fresh.
5. **OKLCH palette generation** — add a small color dependency (e.g. culori) or
   hand-roll the OKLCH→sRGB math (~100 lines, no dep)? we can add a dependency here if needed.
6. **DESIGN.md filename** — `DESIGN.md` (as the PRD's file tree shows) or
   `design.md` (as the spec name)? And does `agent.md` already exist to reference
   it, or do we create/append it? all caps "DESIGN.md" we need to then reference in agent.md.
7. **design.md spec + CLI** — should I first verify the
   `google-labs-code/design.md` spec and `@google/design.md` CLI exist and are
   stable? If they're not real/available, do we (a) define our own DESIGN.md
   format and drop the CLI/lint features, or (b) defer Phase 7 entirely? we should follow what exisit currently from https://github.com/google-labs-code/design.md
8. **Phase order / scope for now** — do you want me to implement **Phase 1**
   first (right-panel move + legacy gate) as the next concrete step, then come
   back for Phase 2? Or a different starting point? yes do phase 1 first.
9. **Undo/history for token edits** — the PRD implies eager saves (as today,
   no undo). Keep token edits out of the undo stack (recommended), or integrate? yeah ill go with your rec here. 
