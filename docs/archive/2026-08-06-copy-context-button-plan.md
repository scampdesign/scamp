# Copy context button — Plan

Backlog: `docs/ai-backlog.md` story 2 (the design brief; read `:142-209`).
Status: **proposed** — for review.
Builds on story 1 (`docs/archive/2026-08-05-live-context-file-plan.md`), which shipped
`lib/contextMarkdown.ts`.

## Goal

**Superseded in part:** the toolbar button was moved to the element
right-click menu, next to Export — it acts on a specific element, so it
belongs with the other per-element actions. `Cmd/Ctrl+Shift+C` is unchanged
and is now the only route to the page-level string (right-click always
selects an element first). The rest of this plan still describes what ships.

A toolbar button (and `Cmd/Ctrl+Shift+C`) that copies a compact one-liner
describing the selected element to the system clipboard, so the user can
paste it in front of a terminal question instead of describing the element.

---

## What already exists

- **Story 1 derives every fact this needs.** `lib/contextMarkdown.ts`
  already resolves the target's project-relative paths, the element's class
  and tag, its declarations (via `elementDeclarationLines`), its children,
  and its custom properties. This story is a second *rendering* of the same
  facts, not a second derivation. That's the central decision below.
- **The shortcut is already free.** The canvas `Cmd/Ctrl+C` handler
  explicitly guards `!e.shiftKey`
  (`useCanvasKeyboardShortcuts.ts:125`), so `Cmd+Shift+C` collides with
  nothing today.
- **The CodeMirror concern is already handled.** The brief asks us to check
  focus before intercepting; `isEditableTarget` (`:33-38`) already returns
  true for `isContentEditable`, which is exactly what CodeMirror's editor
  is. Reusing that guard covers the CSS panel, the inline text editor, and
  every panel input in one check.
- **The toolbar is a simple map over `TOOLS`** (`Toolbar.tsx:55-71`) with a
  shared `.button` class, `Tooltip` wrapper, and a `disabled` prop already
  wired to snapshot-preview mode.
- **Clipboard READ exists** — `IPC.ClipboardRead` → `clipboard.readText()`
  in `main/ipc/clipboard.ts`, using Electron's `clipboard` module.

---

## The central decision: one model, two renderers

Story 2 needs the same facts as story 1 in a different shape. Two ways to
get them:

**(A) A second formatter that reads the store directly.** Fast to write and
immediately wrong the first time either format changes — two places
deciding what "the element's styles" means will drift, and the drift is
silent because nothing compares them.

**(B) Extract a typed model, render it twice.** Split
`lib/contextMarkdown.ts` into:

```ts
// lib/contextModel.ts  (new — the facts)
export type ContextModel = {
  target: ContextTarget | null;
  element: {
    id: string; className: string; tag: string; name?: string;
    parentClassName?: string; chain: string[];
    declarations: string[];          // from elementDeclarationLines
    customProperties: Array<[string, string]>;
    children: Array<{ className: string; tag: string; summary: string }>;
  } | null;
  extraSelected: number;
  elementCount: number;              // new — story 2's no-selection line
  canvasWidth: number;
  breakpointLabel: string;
};
export const buildContextModel = (input: ContextInput): ContextModel;

// lib/contextMarkdown.ts  (existing — now just a renderer)
export const buildContextMarkdown = (input: ContextInput): string;

// lib/contextInline.ts   (new — story 2's one-liner)
export const buildContextInline = (input: ContextInput): string;
```

**Recommendation: (B).** The refactor is mechanical — story 1's section
helpers already compute exactly these fields — and it's the difference
between "the two context formats agree" being a property of the code and
being a thing someone has to remember.

It also pays for itself immediately: story 3 (the MCP server) is a *third*
consumer of the same facts.

---

## The inline format

Per the brief, with an element selected:

```
Context: app/dashboard/page.tsx → .rect_a1b2 (div, flex row, gap 16px,
padding 24px, 400×300px, background #f0f0f0). 2 children: .rect_c3d4 (div),
.text_e5f6 (p "Hello world"). Full styles in app/dashboard/page.module.css.
```

And with nothing selected:

```
Context: app/dashboard/page.tsx — 4 elements on canvas, desktop breakpoint
(1440px). Full page code in app/dashboard/page.tsx and
app/dashboard/page.module.css.
```

The style summary is a **prose projection** of the declarations, not the
raw list — `display: flex; flex-direction: row;` becomes `flex row`, and
`width: 400px; height: 300px;` becomes `400×300px`. That's a small
vocabulary of rewrites over the declaration list, in
`lib/contextInline.ts` and unit-tested against the same fixtures story 1
uses.

Two things the brief leaves open that I'd pin now:

- **Cap the children list.** A container with 40 children would produce an
  unusable paste. Recommendation: list the first 3, then `+N more`.
- **Cap the whole string.** Same reasoning at the top level — a long
  `background-image: url(data:…)` in customProperties could blow it up.
  Recommendation: truncate any single declaration value to ~40 chars.

---

## Clipboard write — new IPC, not `navigator.clipboard`

There's a read channel but no write. The renderer's `navigator.clipboard`
is the obvious reach, and it's the wrong one here: it requires a secure
context, and the packaged app loads the renderer from `file://`, where it's
not reliably available.

Add `IPC.ClipboardWrite = 'clipboard:write'` alongside the existing read, in
the same `main/ipc/clipboard.ts`, using Electron's `clipboard.writeText`.
Two lines, and it works identically in dev and packaged.

---

## Phases

### Phase 1 — extract the model

Split `buildContextModel` out of `contextMarkdown.ts`; `buildContextMarkdown`
becomes a renderer over it. **No behaviour change** — story 1's 32 tests
must pass untouched, which is the proof the refactor is clean.

### Phase 2 — the inline renderer

`lib/contextInline.ts` plus tests. Still nothing user-visible.

### Phase 3 — clipboard write + the button

`IPC.ClipboardWrite`, the toolbar button (dimmed with no selection, brief
"Copied" state), and the `Cmd/Ctrl+Shift+C` shortcut in
`useCanvasKeyboardShortcuts`.

---

## Files to touch

| Area | Files |
|---|---|
| Model | `lib/contextModel.ts` (new), `lib/contextMarkdown.ts` (becomes a renderer) |
| Inline | `lib/contextInline.ts` (new) |
| IPC | `shared/ipcChannels.ts`, `main/ipc/clipboard.ts`, `preload/index.ts` |
| UI | `src/components/Toolbar.tsx` + `.module.css` |
| Shortcut | `src/components/projectShell/useCanvasKeyboardShortcuts.ts` |

---

## Tests

- **Unit (`lib/`, mandatory)**: the inline string for a flex element with
  children; the no-selection variant with its element count; the style
  prose vocabulary (flex row, gap, padding, W×H, background); children
  capped at 3 with `+N more`; a long declaration value truncated; a text
  child's quoted preview; a component target rather than a page.
- **Refactor guard**: story 1's existing `contextMarkdown.test.ts` passes
  unchanged. That's the whole point of Phase 1.
- **E2E**: select an element, press `Cmd/Ctrl+Shift+C`, assert the OS
  clipboard (readable via the existing `readClipboard` IPC) contains the
  element's class; and that with the CSS panel focused the same keystroke
  does NOT overwrite the clipboard.

---

## Open questions for review

1. **Is the model extraction worth doing now, or should story 2 just write
   its own formatter?** Extracting costs a day and touches working code.
   Recommendation: **extract** — story 3 is a third consumer, and two
   silently-diverging descriptions of the same element is a bad bug to
   debug. But it is refactoring code that shipped yesterday, so say if
   you'd rather ship story 2 standalone and extract when story 3 lands. lets go with your recommendation to extract.

2. **Where does the button go in the toolbar?** The brief says "next to the
   existing tools". The strip is `[V R T I F]` on the left with a spacer
   pushing theme/settings right. This isn't a *tool* — it doesn't change
   the active mode — so grouping it with V/R/T/I/F would misread.
   Recommendation: put it after the spacer, with the other actions. that sounds good.

3. **What does the button do with nothing selected?** The brief says two
   contradictory things: "it is dimmed" when nothing is selected, and
   "when nothing is selected, clicking copies the page context only".
   Recommendation: **always enabled**, since the page-context string is
   genuinely useful — and dimming it would hide the feature exactly when a
   user is asking a whole-page question. lets go with your rec.

4. **Should the shortcut work with nothing selected?** Following from Q3,
   yes — same behaviour as the button. The risk is a user expecting
   `Cmd+Shift+C` to be a no-op and silently losing their clipboard.
   Recommendation: accept it; the copy is always meaningful. agreed.

5. **`Cmd+Shift+C` is Chrome's devtools shortcut.** Harmless in the packaged
   app, but in `npm run dev` with devtools open it may be intercepted
   before the renderer sees it. Recommendation: ship it as specified and
   note it in the shortcuts table; not worth a second binding. agreed

6. **Icon.** No obvious Tabler "copy context" glyph. `IconClipboardText`
   reads as "copy structured text"; `IconCopy` is more familiar but
   ambiguous next to the element-copy shortcut. Recommendation:
   `IconClipboardText`, with the tooltip carrying the meaning
   ("Copy context for agent (⇧⌘C)"). lets use "code-ai" icon from tabler for this
