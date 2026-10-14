# Framework phase 1 — the app writes contract-0 files

Status: **on branch `feat/framework-phase-1`.** Step 0 landed
(scampjs 0.0.3 publishes the fixture; the drift test is in). Step 1
landed (the `_scamp` export, `viewMeta` on the parse result, the
contract banner, `color` on containers; the fixture CSS for Home and
RoundTag was regenerated from the app and published as scampjs 0.0.4).
Step 2 landed: views on disk with the wrapper page and the scan; views
listed in the **Pages** section by route slug beside legacy pages, with
**+ Add Page** creating a view in Next.js projects; a view opens like a
page (no component banner, page badge, Preview at its route, Data tab
available); Convert to view with a snapshot first; `scamp_list_pages`
reporting `kind: 'view'`; and the agent.md section. There is no
separate Views section — a view is a page's design, and under the
framework a page is a view file, a styles file, and a route file. A
view is a `ComponentFile` with `kind: 'view'`, sharing the component
plumbing end to end.
Step 3 landed: the five binding kinds on the model (`bind`, `on`,
`repeat`, `showIf`, root `samples`), `lib/viewProps.ts` for the inferred
props type and `_scamp.events`, the generator's canonical forms, and a
parse pre-pass (`parseCode/bindings.ts`) that makes them readable by
the HTML tokenizer. All four fixture files pass the drift test byte for
byte (scampjs 0.0.5 carries the regenerated Lobby and LinkCard CSS).
Design in `docs/notes/view-bindings.md`.
Step 4 landed: `lib/bindingEval.ts` and both canvas render paths resolve
row-bound text and instance props, render a repeated element once per
sample row, and drop a hidden one; the parity fixture
`binding-repeat-and-show` proves it against a browser.
Step 5 landed: the Data tab's Repeat, Show, Attributes, and Events
sections, the right-click items that start a repeat or a show, and the
`bindings` store slice.
Step 6 landed: `ProjectFormat` gains `'scamp'` (detected from `views/`
plus a `scampjs` dependency, ahead of the Next.js test); a scamp project
reads with no pages, its theme and DESIGN.md under `design/`, assets
under `public/`, snapshots of views, components, design, and every
route file, and a scamp-flavoured `agent.md`. On open the installed
`scampjs` version and contract are read from `node_modules` and a banner
reports a missing install or a contract outside `SUPPORTED_CONTRACT`.
Preview stays disabled with a notice until contract 1. The published
contract fixture opens, renders the Lobby's bindings, and is left
byte-identical.
- Step 7 landed: `agent.md` gained a **Data bindings** section (the
  five canonical forms, props order, "compute in logic, bind in the
  view", the `_scamp` export, the portability promise, `LoadContext`
  from `scampjs/runtime`), the scamp variant's wrapper note is now a
  real replacement, and the MCP server answers `scamp_get_view_props`
  (name or route slug) with the exact props type, kinds, events, and
  samples. No separate `scamp_list_views`: views already list under
  `scamp_list_pages` with `kind: "view"`.
- Step 8 landed: `docs/user_docs/views.md`, the views and bindings
  additions to `components.md`, `code-output.md`, `preview.md`, and
  the index, and an Unreleased changelog entry to rename at release.
  Phase 1 is complete pending manual testing.

This is the app side of "start using the framework in Scamp projects",
given where the framework is today. `scampjs` 0.0.2 is on npm at
**contract 0**: `CONTRACT.md`, the `scampjs/runtime` types, and a
fixture project in the exact shape the app must emit. `scamp dev`
arrives with contract 1, so previews stay on `next dev` throughout
this phase and nothing here waits on the framework.

Source: phase 1 of `scamp-framework-tech-plan.md`, made concrete
against the published contract and the app's current generator,
parser, and Data tab. Where this plan differs from the tech plan, it
says so.

## The target, stated once

When phase 1 is done, `generateCode(parseCode(fixture))` reproduces
every file in `scampjs`'s `fixtures/contract-0/views/` and
`components/` **byte for byte**, and the app can open that fixture
folder as a project, list its views and components, render every
binding on the canvas from the sample data, and edit them from the
Data tab.

The fixture is the specification. The app's parser and generator are
already close for components: they emit `type <Name>Props`, defaults
in the destructure, the `className` passthrough, `@/components/`
imports, `data-scamp-instance-id`, and `React.ReactNode` slots. What
is missing, in order of size:

| Gap | Where |
|---|---|
| The `_scamp` export | generator, parser tolerance |
| Views as a thing: `views/<Name>/`, page-sized, with the same file shape as a component | discovery, sidebar, store, scaffold |
| Four binding kinds — attribute, event, repeat, show — plus boolean and array sample data | model, generator, parser, canvas, Data tab |
| Props-type inference for booleans, arrays, handlers, and the `events` list | new `lib/viewProps.ts` |
| `ProjectFormat 'scamp'` detection and the contract-range check | main process, config |
| `agent.md` and MCP guidance for the new grammar | templates, MCP tools |

## Decisions to settle before starting

1. **Where the fixture comes from.** The published package ships only
   `dist`, `CONTRACT.md`, and `LICENSE`. Recommendation: add
   `fixtures` to the `files` list in `packages/framework/package.json`
   in the scampjs repo and publish 0.0.3, so the app's drift test reads
   `node_modules/scampjs/fixtures/contract-0/` from a devDependency and
   can never drift from what's published. Until then, the test reads a
   copy under `test/fixtures/contract-0/` synced by a script from
   `../scampjs`. yes go with your rec
2. **Existing pages stay pages.** A Next project's `app/<name>/page.tsx`
   is untouched in phase 1. Views are a new folder beside `components/`.
   A **Convert to view** action (step 2) is opt-in per page and writes
   the view plus a one-line wrapper page. Recommendation: yes, opt-in,
   never automatic; that's the migration promise. yes opt in
3. **Props-type member order.** The contract leaves it to the app.
   Recommendation: text and attribute props in document order, then
   repeat, then show, then events, then slots, then `className` — the
   order the fixture uses. yes sounds good
4. **Views are visible from day one**, not behind a flag. The section is
   empty in existing projects until someone adds a view, so there's
   nothing to hide. yes 

## Steps

Each step ends with something testable and is a candidate commit
boundary. Steps 1 and 2 don't depend on each other; 3 needs 1; 4 and 5
need 3; 6 and 7 can go any time.

### Step 0 — the north star test

- Add `scampjs@^0.0.2` as a **devDependency** (types only; the app
  never bundles it), and `test/fixtures/contract-0/` per decision 1.
- `test/contract0Drift.test.ts`: for each view and component in the
  fixture, `parseCode` the TSX and CSS, `generateCode` them back, and
  `expect(out).toBe(original)`. Every case fails today; the phase is
  done when every case passes. Also assert `CONTRACT_VERSION` from
  `scampjs` equals the number the app declares as supported.
- `src/shared/projectConfig.ts` gains `SUPPORTED_CONTRACT = { min: 0, max: 0 }`.

### Step 1 — the `_scamp` export and the view file shape

Files: `src/renderer/lib/generateCode/tsx.ts`,
`src/renderer/lib/parseCode/tsx.ts`, tests.

- Generator: emit `export const _scamp = { contract: 0, events: [...] } as const;`
  as the last statement of every component and view, with `events`
  from step 3 (empty until then). Confirm string defaults are
  double-quoted and attributes are double-quoted; the fixture is the
  reference, and `tsStringLiteral` may need a quote change.
- Parser: accept a trailing `export const _scamp` (the generator rewrites
  the whole file, so nothing to preserve, but the parser must not treat
  it as unclassed JSX or fail). Read `contract` from it; a file from a
  newer contract than `SUPPORTED_CONTRACT.max` surfaces the same way a
  parse error does today, with a banner naming the version.
- Views get the component file shape: props type, `className`
  passthrough, `_scamp`. Pages under `app/` are unchanged.
- Fixture CSS: the app's emission is canonical for property order and
  the root's `width: 100%` / `position: relative`, so the fixture's
  `.module.css` files are regenerated from the app once the TSX
  round-trips. A view root drops `min-height: 100vh` (the framework's
  document shell owns full height); `color` on a container was a real
  round-trip loss and is fixed in the app instead.
- Exit: `Home.tsx` and `RoundTag.tsx` pass the drift test.

### Step 2 — views

Files: `src/main/ipc/projectScaffold.ts` (scan, like `components/`),
`src/main/ipc/pageOps.ts` / a new `viewOps.ts`,
`src/shared/types.ts` (`ViewFile`, `ProjectData.views`),
`src/renderer/src/components/projectShell/` (a **Views** section between
Pages and Components), `src/renderer/store/canvasSlice.ts`
(`loadView`, mirroring `loadComponent` with the page-width canvas
default), `src/shared/templates/` (view template), `agentMd.ts`.

- `views/<Name>/<Name>.tsx` + `.module.css` are discovered and listed
  under **Pages** by route slug, beside legacy pages. A view is a page's
  design, so there is no separate section. Opening one is the page
  editor: page-sized artboard, page badge, Preview at its route, and the
  Data tab. `scamp_list_pages` reports it with `kind: 'view'`.
- **+ Add Page** (in a Next project) scaffolds the empty view from the
  contract's section 3 shape and writes `app/<slug>/page.tsx` as a
  one-line wrapper so `next dev` still previews it:

  ```tsx
  import Lobby from '@/views/Lobby/Lobby';
  export default function LobbyPage() { return <Lobby />; }
  ```

  The wrapper is app-owned and regenerated; the parser recognises it
  by shape and never lists it as a page. This is the tech plan's
  "`routes/`-less project still works through the wrapper".
- **Convert to view** on a page's right-click menu: writes the view from
  the page's elements, replaces the page file with the wrapper, and
  takes a snapshot first. Opt-in only (decision 2).
- Exit: the fixture's `views/` folder appears under Views when the
  fixture is opened as a project; an e2e spec adds a view, previews it
  through Next, and converts a page.

### Step 3 — the binding grammar in the model, generator, and parser

Files: `src/renderer/lib/element/types.ts`,
`src/renderer/lib/generateCode/tsx.ts`,
`src/renderer/lib/parseCode/tsx.ts` (and `namedSlots.ts` for the
`{…}` pre-pass), new `src/renderer/lib/viewProps.ts`,
`src/renderer/lib/element/defaults.ts`, tests for all of it.

- Model, on `ScampElement`:
  `bind?: Record<string, string>` (attribute → prop, value `!name` for
  the inverted boolean form), `on?: Record<string, string>`
  (event → prop), `repeat?: { over: string; as: string; key?: string }`,
  `showIf?: string`. Component instances take the same `bind` for their
  props (`label={joinedLabel}`, `label={player.label}`).
- Sample data on the view root: `samples: Record<string, SampleValue>`
  where `SampleValue = string | boolean | Array<Record<string, string>>`.
  Text props keep using the element's `text` as today; boolean and
  array samples live here because they have no element to live on.
- `lib/viewProps.ts` (pure, fully tested): walks the tree and produces
  the ordered props list with inferred types per the contract's table
  — `string`, `boolean`, `Array<{ … }>` with `number` fields when every
  sample row parses, `() => void` or `(key: string) => void` — plus the
  `events` list for `_scamp`.
- Generator: the five canonical forms, exactly as the contract quotes
  them: `attr={name}`, `attr={!name}`, `onX={name}`,
  `onX={() => name?.(row.key)}` inside a repeat, `{list.map((row) => (…))}`
  with `key={row.key}` on the repeated element, `{flag && (…)}`, and
  `{row.field}` text inside a repeat.
- Parser: reads exactly those forms back into the fields above. The
  `{…}` pre-pass that already handles named-slot JSX learns the
  `.map(` and `&&` wrappers; attribute values of the form `{name}` and
  `{!name}` become `bind`; `onX={…}` becomes `on`. Anything else stays
  in the verbatim `attributes` bag, as today.
- Round-trip invariant: one case per binding kind, plus nested show
  inside repeat.
- Exit: `Lobby.tsx` and `LinkCard.tsx` pass the drift test.

### Step 4 — the canvas renders bindings from samples

Files: `src/renderer/src/canvas/ElementRenderer.tsx`, new
`src/renderer/lib/bindingEval.ts` (pure), `test/e2e/parity/fixtures.ts`.

- `bindingEval.ts`: resolve a path (`code`, `player.label`,
  `players.length`) against the samples and, inside a repeat, the
  current row. Prop names and member paths only. No expressions.
- `ElementRenderer`: text and bound attributes resolve before render;
  a `repeat` subtree renders once per sample row with the row in
  scope; a `showIf` subtree renders only when its sample is true;
  `bind` on an instance feeds the instance's existing `propOverrides`
  path. Event bindings render nothing.
- Parity fixtures for repeat, show, attribute, and inverted boolean,
  so the canvas is proven against a browser render of the generated
  file through `next dev`.
- Exit: the fixture's `Lobby` renders two `LinkCard`s, the waiting
  note, and a disabled Start button.

### Step 5 — the Data tab

Files: `src/renderer/src/components/DataPanel.tsx` and its CSS,
`src/renderer/store/canvas/slices/elementsEdit.ts` (new actions
beside `togglePropOnText`), `ElementContextMenu.tsx`.

- Four new row groups under the existing Text and Slots: **Attributes**
  (Locked / Prop per typed attribute, an *inverted* checkbox for
  booleans), **Events** (`onClick` on buttons and links, `onChange` on
  inputs; always a prop), **Repeat** (the container or instance, the
  list prop, the `as` name, the key, and the sample rows as a small
  editable table with add and remove), **Show** (the boolean prop and
  its sample toggle).
- Right-click gains **Repeat this…** and **Show only when…** beside
  **Make slot**.
- Exit: an e2e spec builds the Lobby's bindings from an empty view
  through the Data tab alone and the generated file matches the
  fixture.

### Step 6 — project format and compatibility

Files: `src/shared/types.ts` (`ProjectFormat` adds `'scamp'`),
`src/main/ipc/projectFormat.ts`, `src/main/ipc/project.ts`
(`readProjectScamp`), `src/main/ipc/projectScaffold.ts` (theme path:
`design/theme.css` for `scamp`), `src/shared/projectConfig.ts`, a new
`src/main/ipc/frameworkVersion.ts`, a banner component.

- Detection: `views/` present and `scampjs` in `package.json`
  dependencies → `'scamp'`. Checked before the `app/page.tsx` test.
- `readProjectScamp`: views and components as above, no pages,
  `design/theme.css` as the theme file, `design/DESIGN.md` as the
  design doc. Preview is disabled with a one-line notice ("Previews for
  this project need scampjs contract 1"), because `scamp dev` doesn't
  exist yet. This is deliberately read-and-edit only.
- On open, read `node_modules/scampjs/package.json` → `scampjs.contract`
  and compare with `SUPPORTED_CONTRACT`; outside the range, show the
  banner. Missing `node_modules` is not an error (the project may never
  have been installed); the banner then says which version to install.
- **No `scamp`-format scaffold in this phase.** New project keeps
  producing Next projects until `scamp dev` exists (tech plan phase 5).
- Exit: opening `fixtures/contract-0/` as a project lists two views and
  two components, edits them, and writes them back unchanged.

### Step 7 — agents

Files: `src/shared/templates/agentMd.ts`, `src/main/mcp/tools.ts`,
`src/main/mcp/protocol.ts`.

- `agent.md`: one new section — the three-file contract, the five
  binding kinds with the canonical forms, "compute in logic, bind in the
  view", that `routes/` and wrapper pages are never regenerated, the
  `_scamp` export, and the portability promise. Types are named as
  `scampjs/runtime` exports.
- MCP: `scamp_list_views`, and `scamp_get_view_props` returning the
  inferred props type and the samples for a view, so an agent writing a
  route file gets the exact shape to satisfy.

### Step 8 — docs and the changelog

- `docs/user_docs/views.md` (what a view is, add, convert, the Data
  tab's new rows), updates to `components.md` and `code-output.md`,
  and a changelog entry when it ships.
- `docs/notes/view-bindings.md` for the model-to-file mapping, replacing
  scattered inline comments.

## Cross-cutting rules for this branch

- Everything new under `src/renderer/lib/` has full unit tests, and
  the round-trip invariant grows one case per binding kind. The drift
  test from step 0 is the exit criterion and runs in `npm test`.
- Shim regen after every `.ts` edit, never with the dev server running
  (`npm run shims`, gated on the process check).
- E2E: only the spec files touched, plus the parity spec for step 4.
- Nothing merges without you driving it: add a view, bind a repeat,
  convert a page, open the fixture.
- Each step lands as its own commit on this branch with a one-line
  changelog note collected for the release entry.

## What waits for the framework

| Needs | From | App phase |
|---|---|---|
| `scamp dev` preview, `/_views/<Name>`, the readiness line | contract 1 | tech plan phase 3 (landed; see `2026-09-16-framework-phase-3-plan.md`) |
| Scaffolding `scamp`-format projects, the Next → Scamp migration | contract 1 plus `scampjs/templates` implementations | phase 5 |
| Routes list, Generate route, API routes | contract 2 | phase 7 (landed; see `2026-09-16-framework-phase-7-plan.md`) |

Phase 1 leaves the app able to open, list, render, and edit a
contract-0 project and to write every file in the contract's shape,
which is the prerequisite for all three.
