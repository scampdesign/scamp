# Follow-up story — "Lint design system" button (DESIGN.md)

**Status:** deferred / not started. Follow-up to design-system Phase 7 (see
`../archive/2026-07-23-design-system-plan.md`). The DESIGN.md generation + prose forms shipped; this
is the remaining piece of PRD story 6.

## Goal

A **"Lint design system"** button in the theme panel's Documentation section
that runs the `@google/design.md` CLI against the project's `DESIGN.md` and
surfaces the results without the user opening a terminal.

## What `lint` checks

`npx @google/design.md lint DESIGN.md` validates:

1. **Structural correctness** — the YAML front matter parses and matches the
   spec (valid keys; well-formed typography / color objects).
2. **Broken token references** — any `{colors.foo}` / `{rounded.md}` ref that
   points at a token absent from the file (catches renamed / deleted
   primitives a semantic token still points at). Highest-value check, since
   Scamp generates the YAML from tokens.
3. **WCAG contrast failures** — computes contrast ratios between colour pairs
   (text vs background, etc.) and flags AA/AAA failures. Genuine design
   feedback not available from `theme.css` alone.

## UX

- Button lives in the **Documentation** section (`DesignDocSection`).
- On click: **flush any pending debounced DESIGN.md write first** (so the lint
  runs against current state), then run the CLI, then show results.
- States: `idle → "Linting…" (spinner) → "✓ No issues" | "⚠ N issues"` with a
  list (offending token / colour pair + message).

## Recommended phased approach

The CLI is **alpha (v0.3.0)** — its output format isn't guaranteed stable, so
don't bet a rich inline UI on parsing it yet.

- **Phase A (small, robust):** run the CLI in Scamp's existing terminal (pty)
  panel — raw output shown verbatim, immune to format churn. Add a minimal
  inline badge next to the button derived only from the **exit code** + issue
  **count** (the stable parts): `✓ passed` / `⚠ N issues`.
- **Phase B (later, once the CLI stabilises):** parse the full output into a
  styled inline issue list per the PRD (each issue with token/pair + message +
  severity), no terminal needed.

| Approach | Pros | Cons |
|---|---|---|
| Terminal run + summary badge (Phase A) | Trivial; robust; survives CLI output changes | Less polished; detail lives in the terminal |
| Full inline results (Phase B) | Polished; matches PRD | Fragile parsing against an alpha CLI |

## Open questions / decisions

- **Dependency strategy:** `npx @google/design.md` downloads on first run
  (seconds; **fails offline**). Alternative: add it as a project/dev dependency
  so it's local + instant + offline-safe, at the cost of a dependency. Decide
  per project vs global.
- **When to enable:** only for nextjs projects, or all? (DESIGN.md exists for
  both.) Gate the button if `DESIGN.md` doesn't exist yet.
- **Export commands (stretch):** the same CLI exposes `export --format
  css-tailwind` and `export --format dtcg`. A future "Export tokens" affordance
  could reuse the same plumbing. Out of scope for this story.

## Acceptance criteria (Phase A)

- A "Lint design system" button in the Documentation section, disabled/hidden
  when `DESIGN.md` is absent.
- Clicking flushes the pending write, runs `@google/design.md lint DESIGN.md`,
  and streams output to the terminal panel.
- A summary badge reflects the run: linting / passed / `N issues` / error
  (e.g. offline / CLI unavailable) — the error state must be graceful, never a
  crash or silent no-op.
- e2e: the button appears, triggers a run, and the badge reflects a
  deterministic outcome (mock the CLI in tests to avoid the network).

## Verification notes

- `google-labs-code/design.md` spec repo + `@google/design.md` npm package
  (v0.3.0; bins `design.md` / `designmd`; commands `lint` / `diff` / `export` /
  `spec`) both verified to exist (2026-07). Alpha — re-verify the lint output
  shape before building Phase B.
