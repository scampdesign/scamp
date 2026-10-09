# Release prep — 0.9.0

What has to happen between `main` today and tagging the next release.
Tick items as they're done; anything still open on the day goes under
**Known issues** in the changelog or blocks the tag.

`main` is 48 commits past `v0.8.8` (2026-09-30), merged from
`feat/builtin-agent` on 2026-10-09. Big enough for a minor bump:
**0.8.8 → 0.9.0**.

## What's in it

| Area | What shipped |
|---|---|
| **Scamp Agent (beta)** | Agent panel on your own Claude API key; a conversation per page, kept on disk; edits through Scamp's own round trip, one Cmd+Z per turn, **Undo AI changes**; asks before deletes, components, theme changes, and big batches; edits any view or component, not only the open one; Markdown replies and a copy button; `scamp_find_overflow` |
| **Skills** | **Clean up with AI** after a website import; the React import tidy that reads the app's source |
| **Import a React app** | Run the app from its folder, pick routes, import many at once into a new project; the app's components, `.map()` lists as repeats, and theme tokens carried over |
| **Tables** | Table tags with columns defined once on the table; row and cell styling set on the table; captured tables arrive as grid tables |
| **Website import** | Per-side values folded, gaps written once, named grid areas, control sizes, hidden text dropped |
| **Canvas** | Double-click an instance to open its component; the component editor lays a component out as its instances do (media rules, nested text, percentage heights) |
| **Checks** | A **Checks** section in the panel, so a person can see what an agent got wrong |
| **MCP** | Tables taught through agent.md and the tools; `view` on the element reads; `scamp_get_react_source` and `scamp_find_overflow` |

New dependency: `@anthropic-ai/sdk`.

## 1. Automated checks

- [x] `npm run typecheck` — clean on merged `main`
- [x] `npm run test:unit` + `test:integration` — 279 files, 4,344 tests.
      Port-binding tests (`devServerPortAlloc`, `authService`) failed once
      each in a full run and passed alone; see Known issues
- [x] `npm run build && npx playwright test` — the full e2e suite
      (549 tests). First run on merged `main`, 2026-10-09: **544 passed,
      4 failed, 1 skipped** (32 min). All four fixed, and those four spec
      files re-run green (30 passed, 2 skipped):
  - `breakpoints/override-routing`, `breakpoints/custom-breakpoint` — a
    real regression from the tables work (`5bd0801`): the incremental CSS
    writer closed a newly created `@media` block as `  }}` on one line.
    Fixed in `cssRuleEdits.ts`, with a unit test.
  - `mcp-server` — the live tool list didn't know the two new MCP tools.
  - `parity/framework` `component-root-fills-grid-row` — that harness
    renders a component alone, so a root sized by its grid row can't be
    compared there; the fixture now opts out with a reason
    (`frameworkSkip`). The static parity harness still checks it.
- [x] Shims match sources: regenerated and committed with the fixes,
      2026-10-09

## 2. Manual test pass

Per standing practice, nothing canvas-related is called shippable until
it has been driven by hand. On at least macOS (the most common user
platform) and one of Windows / Linux, from a **packaged** build
(`npm run package`), not the dev server — PATH, signing, and the import
window's partition only show up there.

**Scamp Agent**
- [ ] Connect a key; a bad key is rejected with a clear message
- [ ] Chat on a page; edits land, one Cmd+Z undoes the turn
- [ ] Ask for a change across several pages; other views change on disk
      and show it when opened; **Undo AI changes** puts everything back
- [ ] Delete / extract component / theme change ask first; declining works
- [ ] Switch pages mid-run; the original page is finished in its files
- [ ] Close and reopen the project; conversations come back
- [ ] An existing conversation from an older build still continues
      (stale thinking blocks are dropped, not a 400)
- [ ] `scamp_find_overflow` names real overflow on an imported page
- [ ] Errors read plainly: no key, out of credit, overloaded, offline

**Imports**
- [ ] Website import → **Clean up with AI**: plan, approve, apply; then a
      follow-up message gets the full toolset back
- [ ] Import a React app (riq_frontend_demo): routes listed, several
      imported into a new project, undo removes the batch
- [ ] React tidy reads the source and sets conditions and list names
- [ ] The app's dev server is stopped when the import window closes

**Canvas and components**
- [ ] Double-click an instance → its editor; breadcrumb and Esc return to
      the view it came from
- [ ] Imported sidebar: editor and page match; background fills the row
- [ ] Tables: add a table, style rows and cells, export HTML

**MCP**
- [ ] From Claude Code: `scamp_get_element_tree` with `view`,
      `scamp_find_overflow`, `scamp_get_react_source`

## 3. Docs

- [ ] **Changelog**: a `0.9.0` entry in `docs/CHANGELOG.md` (Google style:
      bold lead sentence, then why), and the feature inventory updated
- [ ] **User doc for the Scamp Agent** — there isn't one. Setup (key,
      sign-in), what it can and can't do, confirmations, undo, cost, and
      what data leaves the machine
- [ ] **User doc for tables** — there isn't one
- [ ] **User doc for Import a React app** — today it's a section in
      `website-import.md`; check it covers running the app, routes, and
      the tidy
- [ ] `docs/user_docs/index.md` links the new pages
- [ ] `ai-agents.md` says how the built-in agent and MCP differ (link or
      summarise `docs/notes/agent-vs-mcp.md`)

## 4. Decisions to make before tagging

- [ ] **Beta labelling.** Is the Agent panel marked beta in the UI, and
      is it on for everyone signed in?
- [ ] **Data and privacy.** The agent sends page content (and, for React
      imports, app source) to Anthropic on the user's key. Say so in the
      docs and at connect time.
- [ ] **`.scamp/agent-history/`** is written into projects. Should new
      projects' `.gitignore` exclude it?
- [ ] **Component editor breakpoint.** It follows the breakpoint last
      picked on a page, with no control of its own. Ship as is, or add the
      control first (see Known issues)?

## 5. Release mechanics

- [ ] Bump `version` in `package.json` to `0.9.0`, commit with the
      changelog
- [ ] Push `main`; CI (`ci.yml`) green
- [ ] Tag `v0.9.0` and push the tag — `release.yml` runs the checks, builds
      all three platforms, signs and notarises, publishes to GitHub
      Releases, and copies to the R2 update feed
- [ ] `npm run verify:feed` — the feed serves 0.9.0 (see
      `docs/notes/auto-update.md`)
- [ ] An installed 0.8.8 picks up the update on next launch

## Known issues to carry (or fix first)

- **Component editor breakpoint control.** No control; it inherits the
  page's last breakpoint, so a component opened while on Tablet shows and
  edits Tablet without saying so.
- **Inherited text styles in the component editor.** A component that
  relies on its page for font, size, or colour shows browser defaults in
  its editor.
- **First open rewrites a hand-written component** whose root isn't a flex
  layout: children become absolutely positioned.
- **MCP is read-only.** External agents edit files directly and skip the
  built-in agent's confirmations and one-step undo.
- **Flaky port tests** (`devServerPortAlloc`, `authService`) under a full
  local run; pass alone. Worth a look before they flake CI.
- **Agent cost.** API-key usage is billed per token and large pages are
  expensive; see `docs/plans/agent-cost-and-progress-plan.md`.
