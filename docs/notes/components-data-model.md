---
title: Components data model
related:
  - src/renderer/lib/element.ts
  - src/renderer/store/canvasSlice.ts
  - src/renderer/src/canvas/ElementRenderer.tsx
  - src/renderer/src/components/DataPanel.tsx
  - src/renderer/lib/extractComponent.ts
  - src/renderer/lib/generateCode.ts
  - src/renderer/lib/parseCode.ts
---

# Components data model

This note covers the four pieces that together make components work:

1. The `component-instance` element type.
2. The `prop` field on text elements (component-side).
3. The `propOverrides` map on instances (page-side).
4. The `componentTrees` cache in the canvas store.

## `component-instance` element type

A component instance on a page is a single canvas element of type `'component-instance'`. It has:

- `componentName: string` — PascalCase folder name. Matches the JSX tag emitted in the page TSX and the folder under `components/`.
- `instanceId: string` — Per-page identifier emitted as `data-scamp-instance-id`. Distinct from the canvas-side `id` so the instance can survive component renames without changing identity. Convention: `inst_<canvas-id-hex>`.
- `propOverrides: Record<string, string>` — Per-instance text overrides keyed by prop name. Empty string is an explicit "render nothing" override, distinct from absent (which falls back to the component-side default).
- `childIds: []` — Always empty. The visible children come from the component definition's tree (looked up via `componentTrees[componentName]`), not the page's element map.

The instance has no class block in the page's CSS module — its visible styling lives entirely in the component file. Only `x` / `y` / position attributes are page-side.

## `prop` on text elements (component-side)

When a text element lives inside a component (active edit target is `activeComponent !== null`), it can carry an optional `prop?: string` — a JS identifier that flips the element from "locked literal" to "parameter".

- `prop` absent → element renders its `text` field verbatim. Locked.
- `prop` set → generator emits `{propName}` in JSX, declares `propName?: string` on the exported `[Name]Props` type, and puts the current `text` value as the default in the function destructure.

`prop` has no meaning on page text elements — the Data tab hides the toggle there.

### Generator behavior

`generateCode({ ..., isComponent: true })` flips three things on top of the page generator:

1. Emits a `type [Name]Props = { propA?: string; … };` declaration before the function.
2. Destructures with defaults on the signature: `function Foo({ propA = "default", … }: FooProps)`.
3. Emits `{propA}` in the JSX where the prop-text element sits, instead of the literal `text`.

Default-text strings are TypeScript-escaped via `tsStringLiteral` (backslash + double-quote + newline + CR).

### Parser round-trip

`parseCode` extracts the destructure into a `propName → defaultText` map (`parsePropsDestructure`), then post-processes every text element whose body matches `/^\s*\{name\}\s*$/`. If the captured name appears in the defaults map, the parser writes `prop = name, text = defaults[name]` onto the element.

Unresolved JSX expressions (e.g. `{whatever}` where `whatever` isn't in the destructure) stay as literal text so user-written / agent-written JSX round-trips byte-stably.

## `propOverrides` (page-side instance)

Set per-instance when the user edits a prop's value from the page Data tab or inline-on-canvas:

- `setPropOverride(instanceId, propName, value)` — writes the value.
- `clearPropOverride(instanceId, propName)` — removes the key entirely; rendering falls back to the component default.

Page TSX serialises overrides as JSX attributes on the instance tag: `<Foo data-scamp-instance-id="inst_a1b2" label="Click me!" />`. parseCode reads them back into the `propOverrides` map. Empty-string overrides round-trip because the JSX attribute is `label=""`, distinct from absence.

## `componentTrees` cache

The canvas store holds `componentTrees: Record<string, { elements, rootId }>` — every component's parsed element tree, keyed by `componentName`. Built once in `ProjectShell` from `project.components` on every project re-read.

When `ElementRenderer` hits a `component-instance` element, it looks up `componentTrees[el.componentName]` and renders the component's element subtree inline (via `renderComponentSubtree`). Instance wrapper owns the click / double-click / context-menu; inner subtree uses `pointer-events: none` so clicks bubble to the wrapper (except prop-text elements, which re-enable `pointer-events: auto` so they can be clicked / double-clicked for inline editing).

Missing-component placeholder: when `componentTrees[name]` is undefined (deleted, renamed externally), the renderer paints a labelled red box so the broken reference is visible on the canvas.

### What a page owns about an instance: its size and place

A page can set an instance's width and height, and where it places it, and nothing else. Everything else about how a component looks belongs to its definition, and the page has nowhere to write it — so `UiPanel` shows only Element + Size for a `component-instance`. Offering Background or Border there would offer edits that silently vanish on the next reload.

Both travel as one page CSS class forwarded through the component's `className` prop:

```tsx
// page.tsx                          // page.module.css
<Button data-scamp-instance-id="inst_c7d7"      .inst_c7d7.inst_c7d7 {
        className={styles.inst_c7d7} />           width: 158px;
                                                }
// Button.tsx
export default function Button({ className }: ButtonProps) {
  return <button className={`${styles.root} ${className ?? ''}`} …
```

Three things make that work, each with a reason that isn't obvious:

- **Every component accepts `className`, unconditionally** (`generateTsx`). Whether it's needed depends on how some *other* page uses the component, and a component's own file must not change because a page sized an instance.
- **The page selector is doubled** (`.inst_x.inst_x`). Both rules are single-class selectors in different CSS modules, so at equal specificity the winner is bundle order — and the component module, imported by the page, lands last. Doubling lifts the page rule to (0,2,0) so it reliably wins. `classifyClassSelector` reads `.x.x` back as a base rule.
- **The parser normalises the merged `className` away before the HTML parse** (`lib/classNamePassthrough.ts`). The template literal necessarily contains a space, which htmlparser2 would read as the end of an unquoted attribute value.

**Placement** is written only for an instance out of its parent's flow — `position: auto` in a parent that doesn't lay it out (a dropped or dragged instance), or an explicit `absolute` / `fixed` — as `position` + `left` / `top` after the size (`instanceRuleLines`). In a flex or grid parent, or a slot, the layout places it. The parser reads an instance whose rule has no `position` (or that has no rule) under a block parent as `static`, in the flow, so a file that lets instances flow keeps doing so on the canvas and on save. see docs/notes/parse-flow-children.md

An instance in the flow at its own size emits neither the rule nor the `className` attribute, so such pages stay free of empty rules.

Components written before the passthrough existed still parse — they just ignore a forwarded class until Scamp next regenerates the file.

### Instance wrapper sizing

The wrapper is a canvas-only box — the generated page has no element for it, the component root is the page's direct child there. So the wrapper, not the root, is what the page's layout sizes, and a `stretch` root has to be reproduced on the wrapper or `100%` resolves against a content-sized box and collapses. `lib/instanceStretch.ts` does that translation, mirroring the flex branch of `elementToStyle` (main axis → `flex: 1`, cross axis → the asymmetric per-axis rule) so an instance and a plain stretch rectangle in the same slot lay out the same way. A naive `width: 100%` here does NOT match: as a flex item it keeps a `100%` flex-basis and shrinks against its siblings, so an instance would take a share of the row where an equivalent rectangle takes the remainder.

`renderComponentSubtree` also applies `ElementRenderer.module.css`'s `.element` class, the same UA-chrome reset (`all: unset` on `button` / `a` / form tags) the page and component-editor renderers apply. Without it the same `<button>` renders with browser-default colour, font and border inside an instance but with the designed styles in the component editor.

## Slots (`children` / `React.ReactNode`)

Slots let a component accept page-supplied content, the layout analog of text
props. Two fields carry the model (`lib/element/types.ts`):

- `slot?: string` — **component-side**, on a rectangle. Marks it as a slot; its
  JSX body becomes `{slotName}` instead of its own children. The default slot
  is named `children`; additional slots get `slot1`, `slot2`, … until renamed.
- `slotName?: string` — **page-side**, on an instance's content element. Says
  which slot of the owning instance it fills. Absent = the default `children`
  slot.

#### Breakpoints inside an instance

The subtree renders the definition's elements **resolved at the active
breakpoint** (`resolveElementAtBreakpoint`, the same cascade the page's
own elements go through), not the raw fields. It used to render the raw
ones, so a component root with `width: fit-content` at desktop and a
`@media (max-width: 390px) { .root { width: 100% } }` rule kept an
inline `width: fit-content` at Mobile that masked the `@container` copy
of that rule — the canvas showed the desktop width while the preview
filled. The wrapper's `instanceStretchStyle` reads the resolved root
too, so a root that is `stretch` only at Mobile stretches the wrapper
there.

#### A page-sized axis fills the wrapper

On disk the page's size lands on the component ROOT — the forwarded
`className`, doubled selector. On the canvas that size is on the
wrapper, so for each axis the (resolved) instance sizes, the inner root
is rendered as `stretch` and fills the wrapper; a hugging root inside a
300px wrapper would otherwise stay at its content width while the
browser showed 300px. Axes the page leaves `auto` keep the root's own
mode. `test/e2e/components/instance-breakpoint-size.spec.ts` pins all
three cases: the component's own media rule, a per-breakpoint page size,
and a desktop page size.

### Codegen (`generateCode/tsx.ts`)

- `collectSlots` walks a component in document order; the props type unions text
  props (`name?: string`) with slots (`name?: React.ReactNode`), and the
  destructure lists both.
- A slot rectangle emits `{slotName}` as its only child.
- An instance groups its `childIds` by `slotName`: default-slot children emit as
  JSX children between the tags; named-slot children emit as
  `slotName={<child/>}` attributes (wrapped in a `<>…</>` fragment when a named
  slot holds more than one element).
- Slot content flows rather than positions absolutely — `declarations.ts`
  treats a `component-instance` parent as a layout parent (`inInstanceParent`),
  so a slot child's CSS matches the on-canvas flow render.

### Parse (`parseCode/`)

Named-slot props (`name={<…>}`) can't be read by the HTML parser, so a pre-pass
`hoistNamedSlots` (`parseCode/namedSlots.ts`) rewrites each into a marker-tagged
JSX child (`data-scamp-slot="name"`) moved inside the instance tag. After
structural parse, `index.ts` hydrates a childless rectangle whose sole body is
`{slotName}` (matched against the component's `React.ReactNode` prop names) into
a slot, and lifts each `data-scamp-slot` marker onto the child's `slotName`.

### Render + drop (`ElementRenderer.tsx`, interactions)

`renderComponentSubtree` renders each slot rectangle's own box with the
instance's matching content inside, tagged `data-scamp-slot` +
`data-slot-owner-id` and `pointer-events: auto` so it's a drop target and its
content is selectable. `renderSlot(slotName)` filters the instance's `childIds`
to that slot. The create tools (`slotZoneAt` in `canvasHitTest.ts`) and the drag
paths (`resolveDropContainer`) both route into a slot zone by reading those
data attributes, then tag new/moved content via `setElementSlotName`.

### Constraints (Phase 4)

- A slot rectangle can't have its own children (its JSX is `{slotName}`), so
  "Make slot" is gated on a childless rect — this also forbids nested slots.
- Dropping a component-instance into a slot is refused when it would form a
  component cycle (`slotDropCreatesCycle` → `wouldCreateComponentCycle`), only
  reachable while editing a component.
- Removing a slot that instances on other pages fill routes through
  `REQUEST_REMOVE_SLOT_EVENT` → a ConfirmDialog listing affected pages
  (`findInstancesWithSlotContent`). The content is never deleted — it stays in
  the page file and simply stops rendering until re-placed.

## Dropping a component from the sidebar

`useComponentDrop` (canvas interaction layer) owns the drag from the sidebar. It resolves the target with `resolveComponentDrop`, which reuses the same `resolveDropContainer` walk as the canvas reparent drag, so the instance lands inside whatever container is under the cursor and the hover indicator looks identical to moving an existing element.

Two rules from `resolveReparentDrop` deliberately don't carry over, because nothing is being moved: there's no element to exclude from the hit-test (hence `NO_DRAGGED_ID`), and there's no current parent to reject as a same-parent no-op — dropping onto the container you're hovering IS the drop.

- **Flow target** (flex/grid): gap line, and the instance inserts at that index — `insertComponentInstance` takes an optional `index` so the drop lands where the line promised rather than always appending.
- **Anything else**: container outline, instance placed at the cursor in the container's local space, clamped inside it. A new instance has no size yet (the component's root defines its box), so the cursor point is the top-left with no dimension to offset against.
- **No container resolved**: falls back to the page root, so a drop anywhere on the canvas always produces an instance.

`resolveDropContainer` only accepts rectangles, so hovering a text / image / instance routes the drop to its nearest rectangle ancestor. A component-instance is only enterable through a slot zone.

## Extraction (convert-to-component)

`extractSubtreeAsComponent` builds a new element map from a subtree of the page's elements:

- Subtree root → renamed to `ROOT_ELEMENT_ID`, `parentId: null`, `name: undefined` (component identity is its file name).
- Direct children → `parentId` remapped from the old subtree-root id to `ROOT_ELEMENT_ID`.
- Deeper descendants → kept verbatim.

The old subtree-root id is NOT preserved in the new map; descendants keep their original ids (4-char hex). After extraction, `replaceSubtreeWithInstance` strips the source subtree from the page and splices in a new instance at the same `childIds` position.

## `isScaffoldRoot` empty-placeholder detection

A "brand-new component" (the `defaultComponentTsx` scaffold) parses to a root with no children, no inline fragments, and all `DEFAULT_ROOT_STYLES` values. The renderer paints a "Component (empty — double-click to edit)" pill in that case so the user has something visible to click.

The check is style-aware (not just `childIds.length === 0`) so a converted leaf rectangle — which has no children but DOES carry visible styling (background, width, height) — renders as a real instance, not the placeholder.
