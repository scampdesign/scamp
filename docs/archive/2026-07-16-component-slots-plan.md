# Component Slots (children prop) — Plan

Backlog: `docs/backlog-6.md` story #4 (the design brief; read `:228-417`).
Status: **proposed** — for review. This is the largest story in the backlog;
proposed as 4 independently-shippable phases.

## Goal

Let a component define **slots** — container elements other elements can be
nested into — mapping to React's `children` prop and named-slot patterns
(`left`/`right`). Page instances fill slots with page-owned content, so a
`Card` with a `children` slot is composable instead of hardcoded.

---

## What already exists (the machinery slots mirror)

The **text-`prop` mechanism is the direct analog** — slots are the
container/`ReactNode` version of it. Reuse these patterns:

- **Model**: a component is an element tree rooted at `ROOT_ELEMENT_ID`
  (`components/<Name>/<Name>.tsx`+`.css`). An instance is a
  `component-instance` element with `componentName` / `instanceId` /
  `propOverrides`, and today `childIds` is **forced empty** — visible content
  comes from `componentTrees[componentName]` (`ElementRenderer` →
  `renderComponentSubtree`). (`element/types.ts:90,548-555`;
  `docs/notes/components-data-model.md`.)
- **Text props**: `prop?` on text elements; store actions `togglePropOnText`
  / `renamePropOnText` (`elementsEdit.ts:153-203`), `setPropOverride` /
  `clearPropOverride` (`:86-125`). Data tab lists them (`DataPanel.tsx`).
- **Codegen** (`generateCode/tsx.ts`): `collectTextProps` (`:255-277`) →
  `type <Name>Props = { p?: string }` (`:323-327`) + destructure-with-defaults
  signature (`:328-332`); a prop-text emits `{propName}` (`:165-183`);
  instances emit self-closing `<Card data-scamp-instance-id=… p="…"/>`
  (`:96-106`).
- **Parse** (`parseCode/tsx.ts`): instance recognized by imported PascalCase
  tag + `data-scamp-instance-id`, extra attrs → `propOverrides` (`:296-346`);
  `parsePropsDestructure` reads `{ p = "default" }` string pairs (`:154-168`);
  a text body matching `PROP_REF_TEXT_RE` `/^\s*\{(\w+)\}\s*$/` (`:131`) whose
  name is in the defaults map becomes a prop.
- **Cycle guard already exists**: `wouldCreateComponentCycle`
  (`@lib/componentUsage`) — reuse for "component can't slot into itself."

---

## Data model (the central decision)

**Component-side marker**: add `slot?: string` to `ScampElement` — a slot name
(default `'children'`) on a **rectangle** in a component definition. Sibling to
`prop`. Only meaningful when the active target is a component.

**Page-side content**: **populate the instance's `childIds`** with page-owned
slot-content elements (real entries in the page `elements` map, with their own
CSS classes), each carrying a new `slotName?: string` (which slot it fills;
absent ⇒ the default `'children'`). So a slotted instance both *references* its
component (`componentName`) *and* owns its slot children (`childIds`).
`generateCode` groups those children by `slotName`.

> Rejected alternative: a parallel `slotContent: Record<slot, id[]>` map on the
> instance. Reusing `childIds` + a `slotName` tag means the existing tree walk,
> selection, layers panel, move/reparent, and history all work on slot content
> for free. (Open question 1.)

This keeps the invariant "at most one default slot, N named slots" and the
story's "dropped elements belong to the page, not the component definition."

---

## Phases

### Phase 1 — Slot definitions (component-side only)

Make a component able to *declare* slots; no page-side filling yet.

- **`slot?` field** + store actions `toggleSlotOnRect` / `renameSlot` /
  `clearSlot`, modeled on `togglePropOnText` / `renamePropOnText`
  (`elementsEdit.ts`). Auto-name the first `children`, then require distinct
  names for more (only one unnamed/default).
- **"Make slot" / "Remove slot"** in `ElementContextMenu.tsx` (`:86-108`),
  gated on `activeComponent !== null && targetType === 'rectangle'`. No nested
  slots (disable on a rectangle that has a slot ancestor/descendant).
- **Canvas visual**: a slot rectangle renders with a dashed border + `✦ slot:
  <name>` label/placeholder (`ElementRenderer`), matching the mock.
- **Codegen** (`generateCode/tsx.ts`): a `collectSlots` pass adds
  `<name>?: React.ReactNode` entries to `<Name>Props`; the slot rectangle
  emits `{slotName}` in the JSX **instead of its own children** (mirrors the
  `propRef` path at `:165`).
- **Parse** (`parseCode/tsx.ts`): (a) scan the `<Name>Props` type body for
  `name?: React.ReactNode` entries (the existing destructure regex only
  captures string defaults, so a separate `React.ReactNode` scan is needed);
  (b) a **rectangle** whose sole JSX child is `{name}` where `name` is a
  ReactNode prop becomes a slot (`slot = name`).
- **Data tab**: a "Slots" section listing slots with rename (`DataPanel.tsx`).

### Phase 2 — Default (`children`) slot content on pages

Let a page instance hold and render default-slot content.

- **Un-force empty `childIds`** for instances that reference a slotted
  component; those children are page-owned elements with `slotName` absent
  (default slot).
- **Render** (`renderComponentSubtree`, `ElementRenderer.tsx:55-324`): pass the
  instance's page-side children in; at a slot marker, render the instance's
  slot children (or an empty **"Drop elements here"** drop zone) instead of the
  definition subtree.
- **Codegen**: an instance with default-slot children emits JSX children:
  `<Card data-scamp-instance-id=…>{child JSX}</Card>` (no longer always
  self-closing).
- **Parse**: parse an instance tag's JSX **children** into page-owned elements
  with `parentId = instanceId`, default slot.
- **Drop** — the hard part (`resolveDropContainer`,
  `useCanvasGeometry.ts:141-165`): today only rectangles are drop parents and
  instances are opaque. Teach the resolver to hit-test a slotted instance's
  slot drop-zone region and return a routing token `(instanceId, slotName)`;
  `useDropInsert` writes the dropped element into that slot (as an instance
  child) instead of a normal reparent.

### Phase 3 — Named slots

- **Multiple named slots**; content elements carry the matching `slotName`.
- **Codegen**: named-slot content → `slotName={<child JSX>}` attribute
  (wrap multiple in a `<>…</>` fragment). Default slot stays JSX children.
- **Parse**: parse `slotName={<div>…</div>}` JSX-expression attributes
  (distinguish a `{…}`-expression attr from a string `propOverride`) into slot
  content elements.
- **Slot selector**: when dragging over an instance with multiple named slots,
  show a small picker so the user chooses the target slot.
- **Data tab**: on a page instance, show which slots have content vs empty
  (`children ● 2 elements` / `header ○ Empty`).

### Phase 4 — Constraints & polish

- **No nested slots** (enforced in Phase 1 gating) and **no circular slot deps**
  (reuse `wouldCreateComponentCycle` when dropping an instance into a slot).
- **Removing a slot with page content**: warn listing affected instances; the
  content is **not deleted** — it becomes detached page elements the user must
  re-place (mirrors the detach flow in `components-multi-file-ops.md`).
- Docs: update `docs/notes/components-data-model.md` + `user_docs/components.md`.

---

## Files to touch (by area)

| Area | Files |
|---|---|
| Model | `lib/element/types.ts` (`slot?`, `slotName?`), `lib/defaults.ts` |
| Store | `store/canvas/slices/elementsEdit.ts` (`toggleSlotOnRect`/`renameSlot`/`clearSlot`, slot-content writes), `canvasSlice.ts` (interface), `slices/document.ts` |
| Codegen | `lib/generateCode/tsx.ts` (`collectSlots`, `{slotName}`, instance children/named-slot attrs) |
| Parse | `lib/parseCode/tsx.ts` + `index.ts` (ReactNode props scan, slot-marker rectangles, instance JSX children, named-slot expr attrs) |
| Render | `src/canvas/ElementRenderer.tsx` (`renderComponentSubtree` slot sites + drop zone + slot visual) |
| Interactions | `src/canvas/interactions/useCanvasGeometry.ts` (`resolveDropContainer` slot routing), `useDropInsert.ts`, reorder/reparent |
| UI | `src/components/ElementContextMenu.tsx` (Make slot), `src/components/DataPanel.tsx` (Slots section) |

Round-trip is the tightest constraint: every new emitted syntax (`{children}`,
`React.ReactNode`, instance JSX children, `slot={<…>}`) must
generate→parse→generate byte-stably (`component-scaffold-roundtrip.md`).

---

## Tests

- **Unit (`lib/`, mandatory)**: `generateCode`/`parseCode` round-trips for —
  a component with a default slot (`{children}` + `React.ReactNode`); a
  component with two named slots; a page instance with default-slot children;
  a page instance with named-slot `slot={<…>}` content; the "no slot content →
  self-closing" case. Slot-name auto-assignment + uniqueness. `collectSlots`.
- **Integration**: write a slotted component + a page using it to a temp dir,
  `parseCode` both, assert the slot content lands on the instance.
- **E2E** (`test/e2e/components/`): make a slot in the component editor →
  `{children}` + `React.ReactNode` appear in the written TSX; drop an element
  into a slot on a page → it nests in the instance and the page TSX shows JSX
  children; named-slot drop → `slot={<…>}`; remove-slot warning.

---

## Open questions for review

1. **Slot content storage** — reuse instance `childIds` + a `slotName` tag on
   each child (recommended: existing tree/selection/history machinery works for
   free), or a separate `slotContent` map on the instance?  go with your rec.
2. **A slot rectangle's own definition children** — making a rectangle a slot
   means its JSX becomes `{slotName}`. Do we (a) forbid "Make slot" on a
   rectangle that already has children, (b) silently drop them on emit, or (c)
   keep them as fallback content (`{slotName ?? <default/>}` — more codegen)?
   Recommendation: **(a)** forbid when it has children (simplest, clearest). yes lets go with A
3. **Multiple elements in a named slot** — wrap in a `<>…</>` fragment
   (recommended), or restrict named slots to a single element and default
   (`children`) to many? lets go with recommended
4. **Phase scope** — ship Phase 1 (definitions) first for review, then 2
   (default slot + drop), then 3 (named) + 4 (constraints)? Or design 1–2
   together since the drop interaction is the crux? Recommendation: **1 then 2**
   — Phase 1 is pure model+codegen (fully testable), and the drop UX in Phase 2
   is where the real risk is, so isolate it. lets go with your rec.
5. **Drop-zone hit-testing** — the drop zone lives inside the *rendered
   definition subtree* (which has `pointer-events: none`). Confirm the approach:
   the slot site re-enables `pointer-events` (like prop-text does at
   `ElementRenderer:225-229`) and carries `data-scamp-slot` +
   `data-scamp-instance-id` so `resolveDropContainer` can read the routing token
   off the DOM — consistent with the existing prop-text hit-testing trick. yeah that sounds correct.
