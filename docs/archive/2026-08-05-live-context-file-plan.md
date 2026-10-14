# Live context file (`.scamp/context.md`) — Plan

Backlog: `docs/ai-backlog.md` story 1 (the design brief; read `:15-140`).
Status: **proposed** — for review.

## Goal

Scamp keeps a markdown file at `<project>/.scamp/context.md` describing the
open page and the selected element, so an agent running in the Scamp
terminal can answer "why does this element look wrong" without the user
describing the element first.

---

## What already exists

Almost all of the machinery. This story is mostly assembly.

- **`.scamp/` is an established runtime folder.** `snapshotOps.ts:21-27`
  keeps snapshots and their index there; `componentOps.ts:194` keeps
  thumbnails. The scaffolded `.gitignore` already ignores `.scamp/`, so the
  "never committed" requirement needs no new work.
- **The watcher already ignores it.** `watcher.ts:56` excludes every
  dotfile path from chokidar, and the auto-snapshot path adds a defensive
  second guard (`:225`). This is the failure mode worth naming: without it,
  Scamp writing a file inside the project it is watching would trip the
  agent-coexistence pause and make Scamp think an agent was editing — and
  it would auto-snapshot every selection change. **Already handled, so long
  as the file stays under `.scamp/`.**
- **The debounced-write driver exists.** `syncBridge/storeSubscription.ts`
  already subscribes to the canvas store, distinguishes a genuine edit from
  a load/echo, and re-arms a `WRITE_DEBOUNCE_MS` timer (`:216-218`). The
  context write is a second consumer of the same subscription.
- **The styles block is already a function.** `elementDeclarationLines`
  (`generateCode/declarations.ts:63`) is exported *specifically* so callers
  can render what would be written to disk for an element. That's exactly
  the "Current styles" section, and using it means the file can't drift
  from the real CSS.
- **`customProperties`** already holds the unmapped declarations the brief
  wants in their own section.
- **Fire-and-forget IPC with a silent catch** is an established pattern —
  `project.ts:169` does `await refreshAgentMdIfNeeded(...).catch(…)`.
- **The store has everything the file needs**: `activePage` /
  `activeComponent`, `selectedElementIds`, `elements`, `projectPath`,
  `activeBreakpointId`, `breakpoints`.

---

## The shape

One new pure function, one new IPC channel, one new subscriber.

```
canvas store  ──subscribe──▶  buildContextMarkdown(state)   [pure, lib/]
                                        │
                                   debounce 500ms
                                        │
                              IPC  context:write            [fire-and-forget]
                                        │
                          main: write .scamp/context.md     [mkdir -p, silent catch]
```

### `lib/contextMarkdown.ts` (new, pure)

```ts
export type ContextInput = {
  target: { kind: 'page' | 'component'; name: string; tsxPath: string; cssPath: string } | null;
  elements: Record<string, ScampElement>;
  selectedId: string | null;
  canvasWidth: number;
  breakpointLabel: string;
};

export const buildContextMarkdown = (input: ContextInput): string
```

Everything the brief specifies is derivable from that, and it's a string-in
/ string-out function — the most testable possible shape for the part most
likely to be wrong (paths, the no-selection branch, children summaries).

Sections, per the brief: header + do-not-edit note, Active page, Selected
element, Current styles, Children, Custom properties, Canvas size.

Details worth pinning now rather than discovering later:

- **Styles come from `elementDeclarationLines(el, parent)`**, not from
  re-deriving. It needs the parent element for flex/grid context, so the
  builder looks it up. Same lines the CSS file gets.
- **Children** are one line each: class, tag, and either a child count or a
  truncated text preview. Direct children only — the whole subtree would
  make the file unbounded on a large page.
- **Custom properties** section is omitted entirely when empty, rather than
  emitted with a "none" placeholder. An agent reading an empty section
  learns nothing; an absent one is unambiguous.
- **Paths are project-relative** (`app/dashboard/page.tsx`), matching the
  brief. Absolute paths would leak the user's home directory into a file
  agents quote back.

### IPC

One channel, `IPC.ContextWrite = 'context:write'`, with
`{ projectPath: string; content: string }`. Handler in a new
`src/main/ipc/contextOps.ts`: `mkdir` the `.scamp/` dir, write the file,
swallow errors. Mirrors `writeComponentThumbnail`'s shape.

### The subscriber

A new `syncBridge/contextFile.ts`, wired next to the existing subscription.
It watches a narrow slice — `activePage`, `activeComponent`,
`selectedElementIds[0]`, and the selected element's own object identity —
and debounces 500ms.

Keying on the **selected element's identity** rather than the whole
`elements` map is what makes "styles change" work without rewriting the
file on every unrelated edit: the store's spreads give the edited element a
new identity and leave its siblings alone.

---

## Phases

### Phase 1 — the pure builder

`lib/contextMarkdown.ts` plus its tests. No wiring; nothing user-visible.
Fully testable, and it's where the format is decided.

### Phase 2 — write it

IPC channel, main handler, the debounced subscriber. After this the file
exists and stays current.

### Phase 3 — tell agents it's there

The `agent.md` "Active context" section from the brief. See the open
question below — this is the phase with a real decision in it.

---

## Files to touch

| Area | Files |
|---|---|
| Builder | `lib/contextMarkdown.ts` (new) |
| IPC | `shared/ipcChannels.ts`, `shared/types.ts`, `main/ipc/contextOps.ts` (new), main index registration, `preload` |
| Renderer | `src/syncBridge/contextFile.ts` (new), wired where `storeSubscription` is installed |
| Template | `shared/templates/agentMd.ts` (+ the legacy variant) |

---

## Tests

- **Unit (`lib/`, mandatory)**: a selected rectangle with children and
  custom properties; the no-selection branch; a component target vs a page
  target; an element whose parent is flex (the declaration lines differ);
  empty custom properties omitting the section; a text element's preview
  truncation; a selected element that no longer exists in the map.
- **Integration**: write to a temp dir and assert the file lands at
  `.scamp/context.md` and that a second write replaces rather than appends.
- **E2E**: select an element, assert the file content names that element's
  class within the debounce window. This is the only level that proves the
  subscription is actually wired.

---

## Open questions for review

1. **Does `agent.md` actually reach existing projects?**
   Yes — `refreshManagedFile` (`projectScaffold.ts:359-370`) skips only
   when the on-disk file byte-matches the template, and otherwise
   overwrites. So the new section reaches every project on next open, and
   it will also blow away any hand-edits. That's the file's stated contract
   ("managed by Scamp and refreshed on every project open"), so it's safe —
   but it does mean this story rewrites `agent.md` in every existing
   project, which is worth knowing before it ships. thats okay we do this often.

2. **Should components get a context file too?** The brief says "active
   page". The component editor is an equally valid target and the store
   models them the same way. Recommendation: **include components**, with
   the Active page section saying `Component: Button` instead — it's nearly
   free and the omission would be surprising. yeah components should too

3. **How much of the tree?** The brief shows direct children only.
   For an agent asking "why does this look wrong", the *ancestor* chain is
   often more useful than the children (a flex parent explains a stretched
   child). Recommendation: keep direct children as specified, and add a
   one-line `Parent chain: .root › .body_a1b2 › .card_c3d4`. Cheap, and it
   answers the most common layout question. sounds good.

4. **Write on every selection, or only when the file would change?**
   Selecting the same element twice, or clicking around a page, produces
   identical content. Recommendation: **keep the last written string in
   memory and skip the IPC when unchanged** — a no-op write still touches
   mtime, and anything watching the file (an agent's own tooling) would see
   spurious activity. no it should write on every selection, a user might just be thinking about something then select it and ask the agent a question.

5. **Multi-select.** The brief only describes one selected element. Scamp
   supports multi-select. Recommendation: show the primary selection (what
   the panel shows) and note `+N more selected`, rather than dumping N
   style blocks. agreed.

6. **Does this belong behind a setting?** It writes a file into the user's
   project on every selection. It's gitignored and small, but it's still
   Scamp writing unprompted. Recommendation: **no setting** — it's inert,
   ignored by git, and a toggle nobody finds is worse than a file nobody
   notices. Flagging it because it's the kind of thing that's annoying to
   add later if you disagree. agreed.
