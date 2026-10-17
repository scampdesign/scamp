# Component variants

Status: **approach decided** (option A, data attributes), 2026-10-17.
The remaining questions are at the end. Nothing is built. Branch
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

  The `data-` attribute is `data-<prop>`, always. Phase 1 supports one
  axis per component; the model holds several, so variant and size can
  come later without a migration.
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
| 0. Framework (scampjs) | The `_scamp` regex fix with its test. The contract text and a Button fixture for variant axes. Additive, no bump. Released as a patch. |
| 1. Model and code | `variantAxes`, `variantOverrides`, generate and parse, round-trip tests, the drift test against the new fixture. No UI yet, so files written by hand or by an agent already round-trip. |
| 2. Design variants | The variant switcher, editing per variant (including hover within a variant), and the side-by-side artboard. |
| 3. Use variants | The instance **Variant** select, instance rendering, checks, and the agent's tools. |
| 4. States for interactive components | A Modal and a menu walkthrough in the user docs: the `state` axis, the route's `useState`, and the event props. Starter **Modal** and **Menu** components. |
| 5. Native popovers | The `:popover-open` state on the canvas, and keeping `popovertarget` and `id` matched. |
| 6. React import | `style-varies` copies become variants. |

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

## Questions for you

Option A is decided. Still open:

1. **Should the framework changes go first** (phase 0)? The regex fix is
   a bug either way; the contract text could wait until phase 1.
2. **One axis per component to start,** or variant and size together
   from the beginning? The model holds several; the UI is the cost.
3. **Native popovers:** worth a phase, or is the `state` axis enough?
4. **Starter components:** should Scamp ship ready-made Button, Modal and
   Menu components with their variants and states, or document the
   pattern only?
