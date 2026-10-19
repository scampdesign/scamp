# Component variants

Status: **decided, in progress**, 2026-10-17. Option A (data attributes),
with the answers recorded at the end. Phase 0 is done: scampjs 0.3.2
fixes the `_scamp` reader and adds contract §1.3.1 with a Button fixture
(`contract-2/components/Button`). Phase 1 is done (see "What phase 1
built"). Phases 2 to 5 are built and waiting on a manual test (see
each "What phase N built"). Phases 6 and 7 were
**proposed** (2026-10-19); phase 6 is decided and in progress. See "Phase 6"
and "Phase 7" below. Branch
`plan/component-variants`.

## What we want

One component, several looks or states, designed side by side and picked
per instance:

| Component | Variants | Who picks |
|---|---|---|
| Button | default, outline, secondary (and sizes later) | The designer, per instance |
| Modal | closed, open | The running page: a click opens it |
| Menu popover | closed, open | The running page, or the browser itself |

These are two different things, and the plan treats them as one
mechanism with two uses:
- **A variant** is chosen when you place the instance (an outline
  button).
- **A state** is chosen at runtime (the modal is open now).

Both are "a named value on the component that changes how it looks".

The existing backlog story ("Component variants" in
`docs/backlog-open.md`) is the starting point. Its CSS design (a
`variant-…` class picked with `styles[…]`, and `if` branches for
different structures) is option B below, and this plan recommends a
different one.

## What's there today

### In Scamp

- **A component is one element tree on one artboard.**
  `componentTrees[name]` holds one `elements` map, and
  `componentCanvas[name]` holds one size. There's nowhere to keep a
  second look.
- **Classes are fixed.** Every element gets `className={styles.<id>}`.
  Only the component's root takes a passthrough:
  ``className={`${styles.root} ${className ?? ''}`}``. Nothing picks a
  class from a value.
- **Props an instance can set are strings.** Instance attributes are
  written quoted (`label="Save"`) into `propOverrides:
  Record<string, string>`. `{true}` would parse as a binding to a prop
  named `true`.
- **Element states exist**, but they're a fixed three: `hover`,
  `active` and `focus`. They're desktop only, emitted as `.x:hover`.
  Anything else in the CSS (`[data-x]`, compound selectors) is kept
  verbatim in `customSelectorBlocks`.
- **The instance panel is thin.** It shows text props and slots. The
  instance renderer (`renderComponentSubtree`) uses the component's own
  sample values for show and repeat, so an instance can't flip one.
- **The React import already sees variants and throws them away.** It
  captures props like `variant="outline"`. Copies that differ only in
  paint are merged into the most common look, with the finding "that's a
  state, and a Scamp instance has nowhere to keep one"
  (`lib/reactComponents.ts`).

### In the scampjs framework (contract 2)

- **Five binding kinds:** text, attribute, event, repeat and show. "Paths
  are prop names … there are no expressions" (`CONTRACT.md` §1.3). So
  ``styles[`variant-${variant}`]``, `variant === 'icon'` and `if`
  branches are all outside the grammar.
- **Attribute bindings are in the grammar:** `attr={name}` with a string
  prop. So `data-variant={variant}` on an element is legal today.
- **No client state is provided.** State lives in the route file
  (`useState`) and reaches a view or component as props. A route ships
  JavaScript when it's `client`, or when a view or component it reaches
  lists `events` in `_scamp`.
- **The framework doesn't inspect props.** Components are plain Preact,
  and CSS Modules pass through Vite untouched, so any selector works.
- **`/_views/<Name>` renders with default props only**, so it can't
  preview a variant.
- **A latent bug.** `src/build/plan.ts:92-93` matches `_scamp` with a
  regex that requires `}` right after `events: […]`. Adding any field
  makes it fail to match, and the build then **silently drops the
  route's JavaScript**. That contradicts the contract's "Fields may be
  added without a bump" (§2, line 294). Confirmed in the code; not yet
  shown with a failing build. Option A adds no `_scamp` field, so it
  doesn't trip this. Anything that does add one, from any feature,
  would.

## Four ways to do it

Option A was chosen on 2026-10-17. B, C and D are kept for the record.

### A. Variant axes as data attributes (chosen)

The component gets a string prop per axis, bound to a `data-` attribute
on its root. Each variant's styles are CSS rules keyed on that
attribute.

```tsx
type ButtonProps = {
  label?: string;
  variant?: "default" | "outline" | "secondary";
  onClick?: () => void;
  className?: string;
};

export default function Button({ label = "Save", variant = "default", onClick, className }: ButtonProps) {
  return (
    <button data-scamp-id="root" className={`${styles.root} ${className ?? ''}`} data-variant={variant} type="button" onClick={onClick}>
      <span data-scamp-id="label_a1b2" className={styles.label_a1b2}>{label}</span>
    </button>
  );
}
```

```css
.root {
  padding: 10px 20px;
  border-radius: 6px;
  background: var(--color-ink-950);
  color: var(--color-ink-50);
}

.root:hover {
  background: var(--color-ink-800);
}

.label_a1b2 {
  font-weight: 600;
}

.root[data-variant="outline"] {
  background: transparent;
  color: var(--color-ink-950);
  border: 1px solid var(--color-ink-950);
}

.root[data-variant="outline"]:hover {
  background: var(--color-ink-50);
}

.root[data-variant="secondary"] {
  background: var(--color-ink-100);
  color: var(--color-ink-950);
}
```

On a page, an instance picks one with a plain string, which instances
already write:

```tsx
<Button data-scamp-instance-id="inst_c3d4" variant="outline" label="Cancel" />
```

A route can also bind it (`variant={tone}`), which is already an
attribute binding.

**Different structure without branches.** An element that only one
variant shows (an icon in an icon button) is in the tree for every
variant. It's hidden with `display: none` in the others:

```css
.icon_e5f6 {
  display: none;
}

.root[data-variant="icon"] .icon_e5f6 {
  display: block;
}
```

Different element trees per variant are out of reach. That's the price
of staying inside the grammar, and it's rarely what a button, modal or
menu needs.

**States use the same mechanism, by convention as `data-state`.** That's
the Radix and shadcn convention, so it's familiar to developers. A modal
has a `state` axis with values `closed` and `open`:

```tsx
<div data-scamp-id="root" className={`${styles.root} ${className ?? ''}`} data-state={state}>
  …
  <button data-scamp-id="close_c9d0" className={styles.close_c9d0} type="button" onClick={onClose}>Close</button>
</div>
```

```css
.root[data-state="closed"] {
  display: none;
}
```

The route owns the open state and passes it down:

```tsx
const [open, setOpen] = useState(false);
// …
<Modal state={open ? "open" : "closed"} onClose={() => setOpen(false)} />
```

Routes may contain expressions; views and components may not. And
because `onClose` is an event, the route ships JavaScript automatically.

**Pros**
- **Inside contract 2.** The attribute binding, the string prop and
  the CSS are all legal today. The framework needs no change to run it.
- **Works with no JavaScript at all.** A static page with
  `variant="outline"` is pure CSS.
- **Fits Scamp's string-only instance props.** A variant is a string.
- **Composes with what exists.** Breakpoints wrap variant rules in
  `@media`, and element states become `[data-variant="x"] .el:hover`.
  Other components can be nested inside.
- **Familiar to developers.** It's the `data-state` and `data-variant`
  convention of Radix and shadcn.

**Cons**
- **Specificity.** `.root[data-variant="x"] .el` outranks `.el`, which
  is the intent. But a developer overriding a variant by hand needs the
  same weight.
- **One element tree per component.** Structure varies by hiding, not
  branching.
- **Typing.** The props type wants a union (`"default" | "outline"`).
  The contract today infers attribute props as plain `string`, so
  documenting the union is an additive contract change. No bump.

### B. Variant classes, from the backlog story

```tsx
<div className={`${styles.root} ${styles[`variant-${variant}`]} ${className ?? ''}`}>
```

Plus `if (variant === 'icon') return (…)` for structural variants.

**Pros**
- The CSS Modules idiom many developers expect.
- Real structural variants.

**Cons**
- **Breaks the root className rule and the "no expressions" rule.**
  That's a **contract bump to 3**:
  - a `fixtures/contract-3/` directory
  - the drift test
  - Scamp's `SUPPORTED_CONTRACT` widened, and old projects shown the
    upgrade banner
- **The parser must read a computed class lookup and conditional
  returns,** the riskiest kind of round trip.
- **Structural variants mean several element trees per component.**
  That reshapes `componentTrees`, the instance renderer, and every
  "element ids are unique in a file" assumption.

### C. One component per variant

`ButtonDefault`, `ButtonOutline`, `ButtonSecondary`, each its own
component.

**Pros:** works today with no code.
**Cons:**
- Every shared change is made three times, so the components drift.
- It's not a variant to the user, and nothing ties the components
  together.
- It's what people do now for lack of A.

### D. Boolean props with show and attribute bindings

`outline?: boolean`, with `{outline && (…)}` to swap whole elements.

**Pros:** works today.
**Cons:**
- It can't change a style, only swap elements in and out, so a
  three-way button is three copies of the button inside one component.
- It's unreadable past two flags.

### Comparison

| | A. Data attributes | B. Variant classes | C. Separate components | D. Booleans |
|---|---|---|---|---|
| Framework change | None required; small additive contract text | **Contract bump to 3** | None | None |
| Different structure per variant | Hide or show elements | Yes, with branches | Yes | Swap elements |
| Static pages (no JS) | Yes | Yes | Yes | Yes |
| Round-trip risk | Low: new selector forms | High: computed classes, branches | None | Low |
| Effort | Medium | High | None | Low, and doesn't solve it |

## Decision: A

Chosen 2026-10-17. Variants are phase 1 without structural variants:
an element that only some variants show is hidden with `display: none`
in the others.

Why: it's the only option that delivers variants and states without touching
the framework's grammar, and it keeps every exported page working with
or without JavaScript. Option B can come later as contract 3 if real
structural variants turn out to matter. A's model (named values on an
axis) carries over unchanged.

## Does the framework need to change?

To run option A: **no.** Every file Scamp would write is valid
contract 2.

Recommended anyway, all **additive, no bump**, in this order:

1. **Fix the `_scamp` regex** (`packages/framework/src/build/plan.ts:92-93`).
   It's a real bug whatever we decide. A test should add a field to
   `_scamp` and assert that the route still ships its JavaScript.
2. **Document variant axes in `CONTRACT.md`.** A string prop bound to a
   `data-*` attribute on the root may be typed as a string-literal
   union, with the default being one of the members. Add a fixture
   (Button, with an outline variant) so the drift test holds Scamp to
   the exact shape.
3. **Optional:** `/_views/<Name>?variant=outline` renders a component
   with props from the query string, so a variant can be previewed on
   its own in the dev server. Useful, not required: Scamp's canvas
   previews variants itself.

Native HTML popovers (below) need nothing from the framework either:
they're plain attributes.

## The worked examples

### Button: default, outline, secondary

One axis, `variant`. Hover is an element state inside each variant.
Exactly the TSX and CSS in option A above.

### Modal: closed and open

One axis, `state`, with values `closed` and `open`.
- **On the canvas,** both are designed side by side.
- **In the running app,** the route holds `open` with `useState`, and
  passes `state` and an `onClose` event.
- **Static pages** can render it open or closed by passing a literal.

### Menu popover: closed and open

Same as the modal: `state` on the menu's root, and `onToggle` from the
trigger.

**Alternative worth offering: the browser's own popover**, with no
JavaScript at all:

```tsx
<button data-scamp-id="trigger_a1b2" className={styles.trigger_a1b2} type="button" popovertarget="menu">Options</button>
<div data-scamp-id="menu_c3d4" className={styles.menu_c3d4} id="menu" popover="">…</div>
```

The browser opens and closes it, closes it on Escape or a click
outside, and puts it in the top layer.
- **What Scamp needs:** to design it, the canvas has to show the
  `:popover-open` state. That's one more element state beside hover,
  active and focus, plus a way to keep `popovertarget` and `id`
  matched.
- **Supported in Chrome, Safari and Firefox** since 2024.
- **Limit:** the popover's `id` must be unique on the page, so two
  instances of one menu component need different ids. That's a prop.

I'd ship this as a second phase. The `state` axis covers every case;
the native popover is the zero-JavaScript shortcut for the common one.

## The exact file shape

Contract §1.3.1 fixes it, and the Button fixture in scampjs 0.3.2 is the
byte-for-byte target for phase 1's drift test:

- **TSX.** Axis props come first in the props type (they're on the root,
  which comes first in the document), as double-quoted unions. Defaults
  are in the destructure. On the root they're bound attributes after the
  static ones and before events: `type="button" data-variant={variant}
  data-size={size} onClick={onClick}`.
- **CSS.** Every element's own rules come first. Then the axis rules,
  grouped by axis in props order, then by value in union order:
  `.root[data-variant="outline"]`, its `:hover`,
  `.root[data-size="small"] .label_c1a1`.
- **The base rules** are already in Scamp's house style. Run through
  today's `parseCode` and `generateCode`, the fixture comes back
  identical except for two things phase 1 adds: the union types (today
  they come back as `string`), and the grouping of axis rules after
  every element (today they're kept verbatim after the root's rules).

## The Scamp side

### Model

- **The axes.** On a component's root:

  ```ts
  variantAxes?: Array<{
    prop: string;            // 'variant', 'state'
    values: string[];        // ['default', 'outline', 'secondary']
    defaultValue: string;    // one of values
  }>;
  ```

  The `data-` attribute is `data-<prop>`, always. Several axes are
  supported from phase 1 (decision 3).
- **Per-element styles.** Each element gets
  `variantOverrides?: Record<string, VariantOverride>`, keyed
  `"variant=outline"`. A `VariantOverride` is a `BreakpointOverride`
  (CSS only) plus `states?: Partial<Record<ElementStateName,
  BreakpointOverride>>`, for variant-and-hover.
- **The default value has no overrides.** Its styles are the base
  rules, so a component with no variants is byte-identical to today.

### Code

- **Generate** (`generateCode/`):
  - the union prop type and the default in the destructure
  - `data-<prop>={<prop>}` on the root
  - per variant, after the element's base and state rules:
    `.root[data-<prop>="v"]` for the root, and
    `.root[data-<prop>="v"] .<el>` for the others, with `:hover` and the
    other states appended
  - inside `@media` when a variant is set at a breakpoint
- **Parse** (`parseCode/`): read those selector forms into
  `variantOverrides`. Today they would land in `customSelectorBlocks`
  verbatim, so the parser takes them out of there only when they match
  a declared axis value. An undeclared value stays verbatim.
- **Round trip.** Every new form gets the generate → parse → same-tree
  test, and the contract fixture, once added, gets the drift test.

### Canvas and panels

- **A variant switcher** in the component editor, next to the state
  switcher: the axis's values as segments. The selected value is what
  you edit; patch routing gains a third axis beside breakpoint and
  state, in `patchRouting.ts`.
- **All variants side by side.** The artboard draws each value as its
  own frame, labelled, stacked as the backlog story describes. Only the
  selected frame is live; the others are read-only renders through
  `renderComponentSubtree` with that value applied. Clicking one
  selects it. This is the workspace plan's one-live-frame model in
  miniature, and it reuses its Viewport split if that's built first.
- **Manage values.** **+ Add variant** duplicates the selected value's
  look; values can be renamed and removed. Removing one asks first,
  and names the instances that use it.
- **Instances.** The instance panel gets a **Variant** select per axis,
  writing `variant="outline"` as a prop override. The instance renderer
  applies that value's overrides. Today it ignores instance values for
  anything but text, so this is new.
- **Element visibility per variant.** "Hide in this variant" is just
  `display: none` set while that value is selected, so no special UI is
  needed. It gets a shortcut later if it's common.

### Agents, checks, and import

- **The agent.** Teach variants in the `agent.md` template, list the
  axes in `scamp_get_view_props`, and add an MCP edit for "set this
  element's style in variant X".
- **Checks.** An instance with a value that's not one of the axis's
  values is a problem. A variant rule for an undeclared value is a
  note.
- **The React import, later.** Copies that differ only in paint, which
  are merged and reported as `style-varies` today, become values on a
  `variant` axis, named from the captured `variant` prop when there is
  one. This is a natural phase once the model exists.

## Phases

| Phase | What it delivers |
|---|---|
| 0. Framework (scampjs) — **done, scampjs 0.3.2** | The `_scamp` reader fix with its test. Contract §1.3.1, "Variant axes", and a Button fixture with `variant` and `size` axes in `contract-2`. Additive, no bump. |
| 1. Model and code — **done** | `variantAxes`, `variantOverrides`, generate and parse, round-trip tests, the drift test against the new fixture. No UI yet, so files written by hand or by an agent already round-trip. |
| 2. Design variants — **built, manual test pending** | The variant switcher, editing per variant (including hover within a variant), and the side-by-side artboard. |
| 3. Use variants — **built, manual test pending** | The instance **Variant** select, instance rendering, checks, and the agent's tools. |
| 4. Starter components and states — **built, manual test pending** | Demo **Button** (`variant`, `size`), **Modal** and **Menu** (`state`) components, and a walkthrough in the user docs: the `state` axis, the route's `useState`, and the event props. |
| 5. React import — **built, manual test pending** | `style-varies` copies become variants. |
| 6. The variant set — **decided, in progress** | The component editor shows every variant as a frame in a labelled grid, Figma's component set. Click any frame to edit it in place; a frame that combines two axes edits that combination. Variant properties move to a panel section. |
| 7. Interactive variants — **proposed** | An instance changes to another variant while hovered, while pressed, while focused, or on click. Hover, press, and focus are CSS; click needs a small framework runtime. |

Native popovers were planned as a phase and are dropped for now (decision 4).

## Tests

### Unit tests (`src/renderer/lib/`, as CLAUDE.md requires)

- Generate and parse every selector form, alone and combined with a
  breakpoint and with a state.
- A component with no variants is byte-identical to today.
- An undeclared value stays verbatim.
- Removing a value removes its rules.
- The union type round-trips.

### Contract

The framework's drift test runs against the new Button fixture, and
Scamp's `contract0Drift`-style test runs against it too.

### End to end

1. Add an outline variant to a button.
2. Change its border in outline only.
3. Place two instances, and set one to outline.
4. The page CSS has nothing new; the component CSS has the
   `[data-variant="outline"]` rules.
5. The preview shows both looks.

Plus: the modal opens and closes in the preview through a route's
`useState`.

## Risks

- **Specificity surprises** for developers who hand-edit, because a
  variant rule outranks a base rule. Documented in the contract text
  and in `agent.md`.
- **The style matrix grows:** breakpoint × state × variant. Phase 2
  edits variant × state at desktop, and variant at a breakpoint.
  Variant × state × breakpoint stays verbatim, as state × breakpoint
  does today.
- **The side-by-side artboard** is a second render path for component
  frames. Sharing it with the workspace plan's read-only frames keeps it
  to one.
- **The React import** has to name values well. A captured
  `variant="outline"` is easy; unnamed differences get `variant-2` and
  a note.

## Phase 6: the variant set

**The story.** Editing variants should feel like Figma's component sets:
every variant is on the canvas at once, in a grid you can read by
property, and you edit any of them by clicking it. Today one value is
live at the top and the others are a read-only list below it that
reorders as you switch.

### How Figma does it

From Figma's help ([Create and use variants](https://help.figma.com/hc/en-us/articles/360056440594-Create-and-use-variants),
[Create and manage component properties](https://help.figma.com/hc/en-us/articles/8883756012823-Create-and-manage-component-properties)):

- **The set.** Variants sit inside a component set drawn with "a
  dashed-purple stroke and no fill". You arrange them in rows, columns,
  or a grid, and the variant in the top-left corner is the default.
- **Every variant is a combination.** Each one has a value for every
  property (`Size=Small, Type=Outline`). Two variants with the same
  combination is a conflict Figma flags.
- **The Properties section.** With the set selected, the right sidebar
  lists its variant properties: **Add property**, double-click to
  rename, manage and reorder values.
- **One variant selected.** The sidebar shows "fields underneath the
  component name to configure the properties and values": dropdowns
  that set this variant's combination.
- **Instances** pick a combination with the same dropdowns. Phase 3
  built that already.

### What changes in Scamp

**1. The set on the artboard.**
- The component editor draws one frame per variant inside a set: a
  dashed accent border, the component's name above it, and each frame's
  values above the frame (`variant: outline · size: small`).
- **A grid by property.** With one axis, the values in a row. With two,
  the first axis down the rows and the second across the columns, so a
  row reads as one look in every size. With three or more, one grid per
  value of the third axis, stacked, each with its value as a heading.
- **Fixed places.** A frame stays where it is when you edit it. Order
  follows each axis's value order, and the default is the top-left
  frame, as in Figma.
- **Each frame hugs its content** (decision 1 below). A root that fills
  its container takes the component's artboard width.

**2. Edit any frame in place.**
- Clicking an element in any frame makes that frame the live one and
  selects the element, in one gesture. This is the workspace plan's
  decision 1 ("one live frame; the rest are read-only renders") within
  one component. It's cheaper here: every frame is the same element
  tree, so switching is `setActiveVariant` plus a selection, with no
  file load.
- Clicking a frame's label selects the frame itself. The panel then
  shows its values (see 4).

**3. Combinations.** This is the one real model change.
- A frame's **key** is its non-default values. That decides where an
  edit in it goes:

  | Frame | Key | An edit writes |
  |---|---|---|
  | `default · medium` | none | the elements' own rules |
  | `outline · medium` | `variant=outline` | `.root[data-variant="outline"] …`, as today |
  | `outline · small` | `variant=outline` and `size=small` | `.root[data-variant="outline"][data-size="small"] …` |

- So the frames along the top row and left column edit one value for
  every combination, and only a frame inside the grid writes a rule
  just for that combination. CSS stays as small as what you designed,
  and nothing has to ask which axis you meant.
- **The model:** `variantOverrides` keys may name several values,
  sorted by axis order: `variant=outline&size=small`.
- **The cascade:** single-value rules first, then combinations, which
  outrank them in CSS (one more attribute). The canvas layers them in
  that order, for instances too.
- **The contract:** §1.3.1 says a rule that combines two axes "is
  outside this grammar". It joins the grammar: the root part may carry
  one attribute per axis, in axis order. Like phase 0, that's a scampjs
  release with the contract text and a fixture (a Button combination
  rule), and no framework code.
- **Figma's conflicts can't happen.** Frames are derived from the axes,
  so no two share a combination.

**4. Variant properties in the panel.** The variant bar above the
artboard (phase 2) is replaced by a **Variants** section in the
properties panel.
- **With the root or nothing selected** (Figma's set selected): each
  axis with its values, **+ Add property**, double-click to rename,
  drag to reorder values (which reorders the grid and the CSS),
  **Remove**, and **Make default** on a value.
- **With a frame selected** (Figma's one variant): a list per axis with
  that frame's values. Changing one selects the frame with that
  combination, since frames in Scamp are combinations, not
  free-standing nodes.
- **Make default** is new. Today the default can't change because the
  base rules are the default's look. Making `outline` the default moves
  its overrides into the base rules, and gives the old default an
  override holding the values it replaced. Pure, tested like the other
  axis edits in `lib/variantAxes.ts`.

**5. What stays.** Hover and the other element states, variants at
desktop only, and the instance's lists (phase 3).

### What it builds on

- **The workspace plan's phase 1, the Viewport split.** The live frame
  has to sit anywhere in a grid, not only at the top-left of the
  artboard, and `toFrame` and `measureElementInFrame` have to measure
  against the frame's container. That's exactly the split. Build it
  first, as its own change: the existing canvas end-to-end specs guard
  it.
- **The read-only frames** are `VariantFrames` from phase 2, laid out
  as a grid, and the workspace's `WorkspaceFrame` later.

### Tests

- **Unit:** combination keys (parse, generate, round trip, the
  cascade order, instances layering combinations); "Make default"
  (moves overrides into the base rules and back, byte-identical after a
  round trip); the grid layout as a pure function (axes in, rows,
  columns and blocks out).
- **Contract:** the new Button fixture through the drift tests, in
  scampjs and in Scamp.
- **End to end:** click a label in a frame, edit it, and the right rule
  is written for a top-row, a left-column, and an inner frame; Make
  default; reorder values.

### Decisions for phase 6

Answered 2026-10-19.

1. **Each frame hugs its content,** as in Figma: you think about the
   component, not its frame. A root that fills its container (width
   `100%`) has nothing to hug across, so it takes the component's
   artboard width; its height still hugs.
2. **Every combination is shown,** up to 36. Adding a value or an axis
   that would make more than 36 is refused, with a message saying so.
3. **The variant bar is removed** when the panel section lands.

## Phase 7: interactive variants (proposed)

**The story.** An instance changes to another variant by itself: a
button shows its `hover` look while the pointer is on it and its
`pressed` look while pressed; a menu opens when its trigger is clicked.
This is Figma's interactive components
([Create interactive components with variants](https://help.figma.com/hc/en-us/articles/360061175334-Create-interactive-components-with-variants)):
a **Change to** interaction between two variants of the same set, with a
trigger. Figma's own button tutorial uses **While hovering**, **Mouse
down**, **Mouse leave**, and **Mouse up**
([Design an interactive button component](https://help.figma.com/hc/en-us/articles/20953528101783-Design-an-interactive-button-component)).
Every instance gets the component's interactions.

### How it differs from element states

Element states (`:hover` on one element) already exist. An interaction
changes the **whole component** to another variant: the label, the
icon, and the background change together when you hover anywhere on
the button. And it reuses a look you designed as a variant, rather than
restyling each element in a state.

### The model

On the component's root, beside `variantAxes`:

```ts
variantInteractions?: Array<{
  axis: string;          // 'state'
  from: string | null;   // 'default', or null for any value
  trigger: 'hover' | 'press' | 'focus' | 'click';
  to: string;            // 'hover'
  /** Click only: the element that's clicked. The root when absent. */
  target?: string;
}>;
```

### Hover, press, and focus: CSS, with no JavaScript

Each rule for the `to` value gains a second selector: the `from` value
with the trigger's pseudo-class on the root.

```css
.root[data-state="hover"] .label_c1a1,
.root[data-state="default"]:hover .label_c1a1 {
  color: #1d4ed8;
}
```

| Trigger | Figma | CSS on the root |
|---|---|---|
| hover | While hovering | `:hover` |
| press | While pressing / Mouse down | `:active` |
| focus | (keyboard) | `:focus-visible`, or `:focus-within` when a child takes focus |

- It works in every project format, static pages included, because
  it's only CSS. A selector list is plain CSS, so this is a contract
  addition (§1.3.2, "Variant interactions"), released with a fixture
  like phase 0.
- **Press wins over hover** because both match while pressing, and the
  later rule wins a tie. Scamp writes interaction rules in value order,
  so `pressed` must come after `hover`; a check says so when it
  doesn't.
- **Parse:** a rule whose extra selectors are exactly the interactions
  for its value reads back into `variantInteractions`; anything else
  stays verbatim, as today.
- **Transitions** you set on the elements animate the change, as they
  do for element states.

### Click: a small runtime in the framework

Hover is a CSS state; a click that opens a menu has to be remembered.
Views and components have no expressions, so no state (contract §1.3:
"anything a view cannot say with these is computed in the route file").
CSS can't remember a click, so today only a route can (phase 4's
`useState` walkthrough).

**Proposed:**
- The clicked element carries the interaction as a literal attribute,
  which the contract allows today:
  `data-scamp-click="state:closed=open,open=closed"`.
- scampjs adds a tiny delegated click handler (about 20 lines, no
  framework code in the component). On a click inside an element with
  that attribute, it sets `data-state` on the component's root to the
  next value, and keeps `aria-expanded` in step when the clicked element
  has it.
- **The build ships it** to any route whose views use a component with
  a click interaction, static routes included, the same way event props
  ship JavaScript today (`shipsJavaScript` in `build/plan.ts`).
- **The route still wins.** A route that passes `state` sets the value
  whenever it renders; the runtime changes it in between. Using both on
  one instance is a check note.

This is a framework change (contract §1.3.2, the runtime, and a build
test), released before the Scamp side, like phase 0.

### In the editor

- **Add an interaction:** in the Variants panel section (phase 6), on a
  frame: **+ Interaction**, then the trigger and the value to change to.
  For click, the element it's on is the selected element, or the root.
- **See it:** the frames show an arrow from each `from` frame to its
  `to` frame, labelled with the trigger, like Figma's prototype
  connections. If arrows are too much for this phase, a list under each
  frame's values does the job first.
- **Try it:** a **Preview interactions** toggle in the component editor
  makes the live frame react to the pointer: hover, press, and click
  swap the drawn value. The canvas draws with inline styles, so CSS
  `:hover` can't do it there; the renderer swaps `activeVariantKey`
  instead. The Preview window needs nothing: it's a real browser.
- **Instances on a page** get the same toggle on the page canvas,
  through the instance renderer's picked keys (phase 3).

### Agents and checks

- `agent.md`: the selector list form and the click attribute.
  `scamp_list_components` lists each component's interactions.
- **Checks:** an interaction to a value the axis lacks; `pressed`
  written before `hover`; a click interaction on an element that can't
  take focus (it needs to be a `button`, or get `role` and
  `tabindex`); a click interaction in a project format with no runtime
  (see the open questions).

### Tests

- **Unit:** generating and parsing the selector lists, each trigger,
  `from` any, the press-after-hover order, verbatim fallbacks, and the
  click attribute round trip.
- **Framework:** the runtime toggles the root's attribute and
  `aria-expanded`, and a static route with a click interaction ships
  the script and one without doesn't.
- **End to end:** add a hover interaction to the Button starter; the
  Preview window shows the hover look while hovered; a Menu instance
  opens on click in a static page.

### Open questions for phase 7

1. **Click in Next.js projects.** The runtime lives in scampjs. A
   Next.js project has no place for it today. Options: Scamp writes a
   small client component it owns into the app layout, or click
   interactions are a Scamp framework feature and Next.js projects use
   the route `useState` pattern from phase 4. I'd start with the
   second.
2. **Close on Escape and on a click outside**, as a menu should. That's
   more runtime and more model (a trigger without a target). In this
   phase, or after?
3. **Which comes first, 6 or 7?** You listed interactions first. The
   CSS half of phase 7 (hover, press, focus, and the panel list) can
   ship before phase 6. The arrows between frames and the preview
   toggle read best on phase 6's grid. I'd build 6 first, then 7; the
   alternative is 7's CSS half first, with the arrows waiting for 6.

## What phase 1 built

- **Types** (`lib/element/types.ts`):
  - `VariantAxis` (`prop`, `values`, `defaultValue`), on the root as
    `variantAxes`.
  - `VariantOverride` (a breakpoint-shaped override plus `states`), on
    any element as `variantOverrides`, keyed by
    `variantKey(axis, value)`.
  - Neither field can appear inside a breakpoint or state override.
- **Parse.**
  - `readVariantAxes` (`parseCode/tsx.ts`) reads each prop typed as a
    union of string literals that the root binds as
    `data-<prop>={<prop>}`.
  - `matchAxisSelector` (`parseCode/css.ts`) recognises
    `.root[data-<axis>="<value>"]`, with an optional descendant class
    and a state on whichever comes last.
  - A post-pass in `parseCode` puts each rule for a declared axis and
    value on its element. Everything else goes back to the anchor class
    verbatim:
    - an undeclared axis or value
    - the default value's own rule
    - two axes in one selector
    - a state before a descendant
  - Axis rules inside `@media` stay in the verbatim media bucket.
- **Generate.**
  - `collectViewProps` types an axis prop as its union, with the axis
    default.
  - `variantAxisBlocks` (`generateCode/css.ts`) writes the axis rules
    after every element's own rules, grouped by axis, then value, then
    element, base before states.
- **`_scamp` reader.** `parseScampMeta` now reads the export by field,
  the same fix as the framework's.
- **Tests** (`test/variantAxes.test.ts`):
  - the contract-2 Button fixture round-trips byte for byte, with both
    axes and the overrides on the right elements
  - each verbatim case
  - generating from the model, including removing a value
  - a component without axes unchanged
  - `_scamp` with extra fields

## What phase 2 built

- **The variant bar** (`VariantBar`, `VariantAxisRow`), above the
  component artboard rather than in the properties panel, because a
  value is component-wide, not per element.
  - **+ Add variant** adds a `variant` axis with `default` and a new
    value; **+ Add axis** adds the next one (`size`, then `variant2`).
  - **+** on an axis adds a value that starts as a copy of the look
    being edited, and opens its name for editing.
  - Double-click a value or an axis name to rename it. Names are checked
    (`variantValueError`, `variantAxisError`): lowercase with hyphens for
    values, a free identifier for axes.
  - **Remove value** and **Remove axis** ask inline first.
  - Disabled at other breakpoints, and a selected value falls back to
    the base look there, as states do.
- **One value edited at a time.** `activeVariantKey` (`variant=outline`)
  in the store. Picking a value on one axis leaves the others at their
  defaults, since an override is keyed by one axis value (decision 3).
- **Routing.** `applyPatchWithAxisRouting` takes the key: style edits go
  to `variantOverrides[key]`, or its `states[state]` with a state
  selected. Moves and resizes go there too. At another breakpoint the
  style edit is dropped.
- **Drawing.** `resolveElementAtState` layers breakpoint, base state,
  value, then the value's state: the same order CSS specificity gives.
  The live frame draws every element in the selected value; the root
  carries `data-<axis>` so the injected sheet matches.
- **Side by side.** `VariantFrames` draws the base look and every other
  value below the live frame, read only (`VariantFrameContext` turns off
  ids, refs, selection and text editing). Clicking one edits it.
- **Overrides in the panel.** A section's override dot and right-click
  reset follow the selected value (`resetElementFieldsAtVariant`).
- **Undo.** Axis edits are one history step (`variants`); undoing past a
  value's creation leaves it.
- **Not built:** naming the instances that use a value before removing
  it (instances can't pick a value until phase 3), changing which value
  is the default, removing an animation inside a value, and variants at
  a breakpoint.
- **Tests:** `test/variantEditing.test.ts` (28: every axis edit with a
  generate-and-parse round trip, routing, the cascade order, resetting),
  `test/e2e/components/variants.spec.ts` (2).

## What phase 3 built

- **The instance's select.** The instance's panel section (titled with
  the component's name) has one select per axis. Picking a value writes
  it as a prop, `variant="outline"`, which the page file already reads
  and writes like any other. Picking the default removes the prop. A
  value the component lacks still shows, so the select can display it.
- **Drawing an instance.** The canvas layers each picked value onto the
  component's elements in axis order (`instanceVariantKeys`,
  `layerVariants`), which is the order of their rules, so a later axis
  wins a tie as in the browser. The inner root carries `data-<axis>`.
  The HTML export already filled bound attributes from the instance, so
  it needed nothing.
- **Checks.** `unknown-variant-value`: an instance sets a value its
  component doesn't declare. `undeclared-variant-rule`: a component
  rule names a value its union lacks. **Both are problems, not notes**,
  a change from this plan: notes tell an agent to leave the CSS alone,
  and a rule no instance can reach is worth fixing. Lint now takes each
  component's root (`componentRoots`) instead of its tag, to read the
  axes.
- **The agent.**
  - The built-in agent's `scamp_set_styles` takes `variant` (`outline`
    or `size=small`) and writes that value's rule. The MCP server is
    read-only, so this is the only edit tool.
  - `scamp_list_components` lists each component's `variants` (prop,
    values, default), and its description says how an instance picks
    one. The test that kept variants out of it is flipped.
  - The components section of `agent.md` (nextjs and scamp formats)
    has a **Variants** section: the union prop, the `data-` binding,
    the rule shapes, and what stays verbatim.
- **Not built:** naming the instances that use a value before it's
  removed. Pages aren't loaded in the component editor, so this needs a
  disk scan; the check reports the instances afterwards instead.
- **Tests:** `test/variantInstances.test.ts` (14),
  `test/e2e/components/instance-variants.spec.ts` (1).

## What phase 4 built

- **Starters** (`lib/starterComponents.ts`): **Button** (`variant`,
  `size`, `onClick`), **Modal** (`state`, `onClose`), and **Menu**
  (`state`, `onToggle`). They're added from a **Starters** row under
  **+ Add Component**, named `Button`, then `Button2` and so on
  (case-insensitive, for macOS disks), and opened in the editor.
- **Canonical files.** Each template is Scamp's own generated output,
  so adding one causes no rewrite on load. The tests round-trip each
  starter byte for byte under its own name and a new one, and check
  that it lints clean.
- **`state` defaults to `open`.** The component's own rules are the
  open look, so editing it edits what you see; `closed` only hides
  (`display: none` on the Modal's root, or on the Menu's panel). An
  instance with no `state` therefore shows open on the canvas; the
  docs say to set `closed` there.
- **Plain colors, not theme tokens.** An imported project may not
  declare `--color-primary`, and a missing token draws as nothing.
- **The Button has a fixed height per size** (32, 40, 48px). A
  content-height component root fills the editor's artboard, which
  made a stretched blue column of the button.
- **The route walkthrough** renders the Modal beside the view, in the
  route, rather than inside the view. A view prop bound to an
  instance's `state` would be typed `string` and fail the Modal's union,
  so the route, which can hold `useState`, passes the value directly.
- **User docs:** `components.md` gains "From a starter" and a
  "Variants" section (add, design, remove, pick per instance, open a
  modal from a route, the file shape). The index and changelog
  (Unreleased) list variants and starters.
- **Tests:** `test/starterComponents.test.ts` (15), and a third test in
  `test/e2e/components/variants.spec.ts`.
- **Found while writing the docs:** removing a Prop-mode text element
  already lists the pages that use it. That scan could name the
  instances that use a variant value before it's removed, the one
  phase 3 item left open.

## What phase 5 built

- **`lib/reactVariants.ts`** (pure). Given a component's copies and the
  common look the import settled at each position, each copy's paint
  difference (`paintOverride`: the paint fields and paint CSS that
  differ) is its look. Copies with none are the base look.
- **Naming, first that works:**
  1. A captured React prop that tells the looks apart exactly. A string
     prop names the axis and its values (`variant="Outline"` →
     `variant: outline`); a boolean names the look it turns on
     (`isActive` → `active`).
  2. One look per page: each value is named after its view (`home`,
     `pricing-plans`). This is the selected nav item.
  3. Numbers: `variant-2`, `variant-3`, said in the finding.
- **Up to four looks.** More is a component painted per page, not a set
  of variants, and it keeps the common look with `style-varies`.
- **In the plan** (`planReactComponents`): the definition gets the axis
  (`addVariantAxis`, under `variant` or `variant2` if its name is taken)
  and an override on each element that differs; each instance gets its
  value as a prop; the finding is `variants`, described as "each look is
  a variant … and each instance picks its own".
- **Limit:** a paint only the common look has (a shadow the variant's
  copy lacks) can't be unset by an override, so it stays on every value.
  Marked as a shortcut in the code.
- **Docs:** the React import section of `website-import.md`, the React
  import plan's open problem (now solved), and the changelog.
- **Tests:** `test/reactVariants.test.ts` (10); the nav-highlight test in
  `test/reactComponents.test.ts` now expects variants named by page, each
  view's instance picking its own, and files that read back the same.

## Decisions

Recorded 2026-10-17.

1. **Option A,** data-attribute axes. No structural variants: an element
   only some values show is hidden with `display: none` in the others.
2. **The framework goes first.** Phase 0 is fixed, tested and released as
   its own scampjs version before the Scamp work starts.
3. **Several axes from the start.** `variant` and `size` together, so the
   model, code, and UI handle any number of axes from phase 1. Each
   override is keyed by one axis value; a rule that combines two axes
   (`[data-variant="outline"][data-size="small"]`) stays verbatim.
4. **The `state` axis for modals and menus. Native popovers are not
   planned for now.** Phase 5 is dropped.
5. **Starter components ship as demos:** Button (`variant`, `size`),
   Modal (`state`) and Menu (`state`), for users to reuse or learn from.
