# Cross-project paste and the system clipboard — Plan

Backlog: `docs/backlog-9.md` story 3 (read `:160-198`) — the half carved
out of `docs/archive/2026-08-12-copy-cut-paste-plan.md` on review.
Status: **proposed** — for review.

## Context

Two pieces that were split out of the copy/cut/paste story because each
is about as large as that whole plan, and neither is needed for the
same-project and cross-page cases:

1. **Cross-project paste** — copy in project A, open project B, paste.
   The structure comes across for free; the *styling* doesn't, because
   token references (`var(--color-brand)`) point at tokens the target
   project may not have.
2. **The system clipboard** — a text (TSX + CSS) representation of the
   copied elements, and parsing Scamp TSX back in from a text editor.

Depends on `../archive/2026-08-12-copy-cut-paste-plan.md` landing first — this extends the
clipboard payload that plan introduces.

---

## What already exists

- **The clipboard already survives project switches.** Nothing clears it,
  `setProjectPath` only writes a string, and opening a project doesn't
  reload the renderer — so the Zustand store lives for the whole session.
  Structure and literal styles already cross projects today. **Only the
  token half is broken.**
- **`ClipboardWrite` (plain text) IPC is plumbed** — added for Copy
  context.
- **`ClipboardRead` already reads OS text** — it just discards anything
  that isn't SVG markup (`main/ipc/clipboard.ts:33`), so adding a text
  case is an extension, not new plumbing.
- **`parseVarTokenOrNull`** (`lib/parsers/common.ts:116`) already
  recognises `var(--name)` and `var(--name, fallback)` and preserves the
  source string byte-for-byte.
- **`missingComponent`** is already on the element model — the parser
  sets it when an instance tag has no component on disk, so a pasted
  instance has a defined way to degrade.
- **`SvgReloadBanner`** is the precedent for a dismissible
  "something changed, here's what" banner.

---

## Decisions

### 1. Token values are captured at COPY time, not resolved at paste time

For a cross-project paste, the source project's theme is gone by the time
you paste — the store holds one project's `themeTokens` at a time. So the
copy has to carry the resolved values with it:

```ts
clipboard: {
  elements: Record<string, ScampElement>;
  rootIds: string[];
  sourceProjectPath: string;      // detects a cross-project paste
  tokens: Record<string, string>; // token name → resolved value at copy time
} | null
```

The fallback is only as good as the copy: an element copied before the
user edited the source theme carries the older value. That's the right
trade — the alternative is losing the styling entirely.

### 2. Only *missing* tokens fall back

A token that exists in the target keeps its `var()` reference, untouched,
so the pasted element picks up the target project's theme — which is
almost always what you want when both projects share a token vocabulary.
Substitution is the exception, not the rule.

### 3. A pasted component instance with no matching component becomes a placeholder

The model already has `missingComponent` for exactly this. Pasting as a
placeholder is recoverable — create the component and the instance links
up. The alternative, detaching into plain elements on paste, always
renders but silently discards the link, and there's no way back.

### 4. The system clipboard gets an explicit "Copy as code" action, not Cmd+C

The story asks for Cmd+C to also write TSX/CSS to the OS clipboard.
Rejected on review: copying an element in Scamp would destroy whatever
the user had on their system clipboard — a URL, a password, a paragraph —
as a side effect of a canvas action they didn't think of as touching it.

So the text representation goes on an explicit menu item instead, next to
"Copy context for agent", which is the same shape of action and already
sets the precedent.

### 5. Paste-from-system-TSX only fires when the internal clipboard is empty

Already the rule for SVG/image. Internal always wins.

---

## Phases

### Phase 1 — token capture and fallback
New pure lib `src/renderer/lib/clipboardTokens.ts`:

- `collectTokenRefs(elements)` → the `var(--x)` names used in a subtree
- `applyTokenFallbacks(elements, captured, targetTokens)` → the
  substituted elements plus the list of tokens that were swapped

Extend the clipboard payload (decision 1) and call the fallback from
`pasteElement` when `sourceProjectPath` differs from the current project.

### Phase 2 — the warning
A dismissible banner naming the tokens that fell back, following
`SvgReloadBanner`. The story asks for "a subtle warning"; naming the
tokens is what makes it actionable — "some styles changed" isn't.

### Phase 3 — component instances
Mark a pasted instance `missingComponent` when the target project has no
component of that name (decision 3).

### Phase 4 — "Copy as code"
Add the menu item; write `generateCode` output for the copied subtree via
the existing `ClipboardWrite` IPC.

### Phase 5 — paste Scamp TSX from a text editor
Extend `ClipboardReadResult` with a `kind: 'text'` case, and parse it
with `parseCode` on paste — inserting only when it yields at least one
element, ignoring it otherwise. **Both** sides of the IPC boundary
change, so **both** shim regens are required
(`tsconfig.web.json` *and* `tsconfig.node.json`).

---

## Files to touch

**New:** `src/renderer/lib/clipboardTokens.ts`,
`src/renderer/src/components/projectShell/ClipboardTokenBanner.tsx`,
`test/clipboardTokens.test.ts`,
`test/e2e/clipboard/cross-project.spec.ts`.

**Modified:** `store/canvas/slices/elementsCreate.ts`,
`store/canvasSlice.ts`, `ElementContextMenu.tsx`,
`main/ipc/clipboard.ts`, `shared/types.ts`, `preload/index.ts`,
`useCanvasKeyboardShortcuts.ts`.

**Shim regen:** renderer for phases 1–4; **both** projects for phase 5.
Dev server stopped.

---

## Tests

**`test/clipboardTokens.test.ts`** — the new pure logic, fully covered as
`lib/` requires:
- collects refs from every field that can hold one (colour, spacing,
  typography), including inside `customProperties`
- a token present in the target is left as a `var()` reference, untouched
- a token missing from the target is replaced by its captured value
- a token missing from *both* the capture and the target is left alone —
  never invent a value — and reported
- `var(--x, fallback)` round-trips unchanged: the parser preserves those
  verbatim and we must not rewrite them
- an empty subtree, and a subtree with no token refs at all, are no-ops

**e2e (`test/e2e/clipboard/cross-project.spec.ts`):**
- copy a token-styled element in project A, open project B, paste: the
  element keeps its colour and the banner names the token
- the same when B *has* the token: the reference survives as `var()` and
  no banner appears
- a pasted instance with no matching component shows as missing rather
  than vanishing

Only the spec files touched get run — per the standing rule, no directory
sweeps.

---

## Open questions

1. **Does a cross-project paste need the source project's *name* in the
   banner?** "`--color-brand` isn't in this project, using `#3b82f6`"
   reads fine without it, and the clipboard already stores
   `sourceProjectPath` for the comparison. I'd leave the name out unless
   you want it.

2. **Should "Copy as code" put the TSX and CSS in one blob, or offer
   them separately?** One blob (TSX then CSS, as `generateCode` returns
   them) is simplest and matches what an agent wants to receive. Two
   items doubles the menu for a case I don't think comes up.

3. **How much of a page can a text paste create?** Parsing arbitrary
   pasted TSX means anything from one div to a whole page. Worth a cap,
   or trust `parseCode` and let the user undo? I lean **no cap** — undo
   already covers it, and a cap would fail confusingly on the legitimate
   "paste a whole nav" case.
