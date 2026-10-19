# Components

A component is a reusable piece of UI that lives in its own folder and
can be dropped onto any page. Edit it once, and every instance across
every page updates.

Components are the answer to "I'm copying and pasting this same card on
five pages". Promote the card to a component, drop instances where you
need them, and changes in the component editor propagate everywhere.

## Where components live

Each component is two files inside `components/[Name]/`:

```
my-project/
├── app/
│   ├── page.tsx
│   └── about/
│       └── page.tsx
├── components/
│   └── Card/
│       ├── Card.tsx
│       └── Card.module.css
└── views/
    └── About/
```

A [view](views.md) is a page's design in the same two-file shape. Views
list under Pages, not Components.

The component's name becomes the folder name, the TSX filename, the
React function name, and the JSX tag used to instantiate it on a page.
Names are PascalCase. Scamp converts whatever you type (`my card`,
`my-card`, or `MyCard`) into a valid PascalCase identifier.

Components appear in the **Components** section of the left sidebar,
below Pages.

## Create a component

### From an existing element

1. Right-click any element on the canvas (a rectangle, a text node, or
   a group) and select **Create component**.
2. Type a name and confirm.

Scamp does the following:

- Writes `components/[Name]/[Name].tsx` and `[Name].module.css` with the
  element's structure and styles.
- Replaces the element on the page with an instance of the new
  component.
- Adds the component to the sidebar list.

The page's `.tsx` gets an import
(`import [Name] from '@/components/[Name]/[Name]'`), and the JSX swaps
from the original element to `<[Name] />`.

### From scratch

At the bottom of the Components list, click **+ Add component**, and
then type a name. Scamp scaffolds an empty component and opens the
component editor so you can start designing.

### From a starter

Below **+ Add component**, click one of the **Starters**: **Button**,
**Modal**, or **Menu**. Scamp adds a ready-made component and opens it
in the component editor. Each one shows [variants](#variants) at work,
so you can use it as it is, restyle it, or read it to learn how to
build your own.

| Starter | Variants | Event |
|---|---|---|
| Button | `variant`: `default`, `outline`, `secondary`; `size`: `small`, `medium`, `large` | `onClick` |
| Modal | `state`: `open`, `closed` | `onClose` |
| Menu | `state`: `open`, `closed` | `onToggle` |

If the project already has a component with that name, Scamp numbers
the new one: `Button2`, `Button3`, and so on. The starters use plain
colors rather than your theme's tokens; swap in tokens once you've added
one.

### From an agent

An [AI agent](ai-agents.md) working in your project can create
components too. It writes the same two files, and Scamp lists the
component the moment they appear. The agent's instructions in `agent.md`
explain the format, and the MCP server's `scamp_get_component_scaffold`
tool hands it the exact starter files for any name.

If an agent builds you a page full of "components" instead of real
component folders, say so—"make these Scamp components, not a page"—and
check that the Scamp MCP server is connected. See
[Is it working?](ai-agents.md#is-it-working). Without it, the agent has
less telling it that the format exists.

## The component editor

Double-click a component in the sidebar, or double-click any instance on
a page canvas, to open the component editor. It's the same canvas,
properties panel, and code panel you already know, scoped to one
component.

A banner across the top of the canvas reminds you that you're editing a
component:

```
Editing component: Card. Changes affect all instances.
```

When you open a component by double-clicking an instance, a breadcrumb
above the canvas (`home › Card`) names the page or view you came from.
Click it, or press **Esc**, to go back there.

### Component canvas size

The component editor has its own artboard, sized independently of the
component's CSS. The canvas is a workspace size, not a style, so your
root can still be `width: 100%`.

- **Matches the source on creation**: When you create a component from
  an element on a page, the artboard opens at that element's rendered
  size, even if the element stretches full width. A full-bleed hero
  converts to a full-width component canvas, and a 320×200 card opens at
  320×200.
- **Resize handles**: Drag any of the four corner handles to resize the
  artboard. The size is saved per component in `scamp.config.json`, so
  it's there the next time you open it.
- **Double-click to fit**: Double-click a handle to shrink or grow the
  artboard to hug its content, including the root's padding. If a
  top-level child stretches full width, that axis can't shrink below the
  canvas, because a stretched box is by definition as wide as its
  canvas.

Content taller than the artboard still shows. The canvas height is a
minimum that grows with content, and double-click to fit commits the
grown height as the new size.

### Component breakpoints

A component can style itself differently at each breakpoint, for example
a sidebar that collapses to icons at Tablet. To see and edit that, click
the size control above the canvas and select a breakpoint. The component
is shown at that screen size, and your edits go to that breakpoint's
styles. The canvas keeps its size. The editor always opens at Desktop.
See [Breakpoints](breakpoints.md#breakpoints-in-the-component-editor).

### The Data tab

Inside the component editor, the properties panel gains a third tab:

```
[ UI ]  [ CSS ]  [ Data ]
```

The Data tab lists every text element in the component and lets you
decide whether each one is dynamic (becomes a React prop) or locked
(hardcoded into the component).

| State | What happens |
|---|---|
| **Prop** | The text becomes a `?: string` prop on the component. Each instance can override it. The Data tab shows an editable prop name, such as `label` or `title`. Rename it from the default `prop-1`. |
| **Locked** | The text is hardcoded into the component. Every instance renders the same string. Editing the text here updates it everywhere. |

The default for new text elements added to a component is **Prop**.
Switch individual text rows to **Locked** when the text should never
vary between instances, such as footer copyright lines and fixed labels.

Below Text and Slots, the Data tab has sections for **Repeat**,
**Show**, **Attributes**, and **Events**, which bind a list, a flag, an
attribute, or a handler to a prop. They work the same in a component as
in a view. See [Bind data in the Data tab](views.md#bind-data-in-the-data-tab).

## Place an instance on a page

Drag a component from the sidebar onto any page canvas. Scamp does the
following:

- Adds the import to the page's `.tsx`.
- Inserts `<[Name] />` at the drop location.
- Selects the new instance so you can position it.

An instance behaves like a single element on the page: click to select,
drag to move, and change its layout-related properties like any other
rectangle. The instance's internal structure is read-only from the page.
To edit what's inside, double-click to open the component editor.

### Per-instance text overrides

When you select an instance and the component has any Prop-mode text
elements, the properties panel shows an **Instance** section with one
input per prop. Type a value to override it for this instance, or leave
it blank to use the component's default.

The generated JSX picks up overrides as JSX attributes:

```tsx
<Card title="Pricing" cta="Get started" />
```

Locked text in the component renders the same across every instance and
never appears in the Instance section.

## Variants

A variant is one look of a component: an outline button, a small one, a
modal that's open or closed. You design every look in one component, and
each instance picks the one it shows.

Variants are grouped into **axes**. An axis is a prop with a fixed list
of values, such as `variant` with `default`, `outline`, and `secondary`.
A component can have several axes; a button might have `variant` and
`size`. Each axis has a default value, which is the component's own look.

### Add a variant

1. Open the component in the component editor.
1. Above the artboard, click **+ Add variant**. Scamp adds a `variant`
   axis with a `default` value and a new value, and selects the new one.
1. Type a name for the value, such as `outline`, and press **Enter**.

To add another value to an axis, click **+** at the end of its row. The
new value starts as a copy of the look you're editing. To add a second
axis, such as a size, click **+ Add axis**.

Value names use lowercase letters, digits, and hyphens. To rename a
value or an axis, double-click its name.

### Design a variant

Select a value in the variant bar. Anything you change now applies to
that value only: colors, borders, sizes, and the position of elements.
The other values keep their own look.

- The selected value is drawn on the artboard, where you edit it.
- The other values are drawn below it, read-only, so you can compare
  them. Click one to edit it.
- To change how a value looks on hover, select the value, and then
  select **Hover** in the state switcher. See
  [Element states](element-states.md).
- To hide an element in one value, select the value and the element,
  and then, in the **Visibility** section, set **Display** to **None**.
- A section title shows the override dot when the selected value changes
  one of its fields. Right-click the title to reset those fields to the
  default look.

Variants are designed at the desktop breakpoint. At other breakpoints,
the variant bar is turned off and the canvas shows the default look.

### Remove a variant

Select the value, click **Remove value**, and then click **Remove** to
confirm. Scamp deletes the value and its styles. **Remove axis** removes
a whole axis, with all its values. The default value of an axis can't be
removed.

An instance still set to a removed value shows the default look, and the
[Checks](views.md#find-problems-in-a-view) section lists it.

### Pick a variant for an instance

Select an instance on a page. In the properties panel, the section named
after the component has one list for each axis. Select a value, and the
instance shows that look.

The page's file names the value as a plain attribute:

```tsx
<Button data-scamp-instance-id="inst_a1b2" variant="outline" size="small" />
```

Selecting the default value removes the attribute.

### Open a modal from a route

A modal or menu changes its look while the page runs: it opens on a
click and closes again. The page's route holds whether it's open, and
passes it to the component's `state` axis. This works in a
[Scamp framework project](scamp-framework.md).

1. Under **Starters**, click **Modal**.
1. Open the view the modal belongs to, select the button that opens it,
   and then, in the **Data** tab, bind the button's `onClick` to a new
   event, such as `onOpenModal`.
1. With nothing selected, under **Routes**, click **Generate route**.
   Because the view has an event, the route renders in the browser.
1. Edit the route so it keeps the modal's state and renders the modal
   beside the view:

   ```tsx
   import { useState } from 'preact/hooks';
   import Lobby from '@/views/Lobby/Lobby';
   import Modal from '@/components/Modal/Modal';

   export const render = 'client';

   export default function LobbyRoute() {
     const [open, setOpen] = useState(false);
     return (
       <>
         <Lobby onOpenModal={() => setOpen(true)} />
         <Modal state={open ? 'open' : 'closed'} onClose={() => setOpen(false)} />
       </>
     );
   }
   ```

The modal's root is fixed to the window, so it covers the page wherever
the route places it. The **Menu** starter works the same way, with
`onToggle` on its trigger: `onToggle={() => setOpen(!open)}`.

**Note:** On the canvas, a Modal instance with no `state` shows open,
because `open` is its default. To design the page under it, set the
instance's **state** to `closed`.

### How variants are written

Each axis is a prop typed as a union of its values, and the component's
root carries it as a `data-` attribute:

```tsx
type ButtonProps = {
  variant?: "default" | "outline" | "secondary";
  className?: string;
};

export default function Button({ variant = "default", className }: ButtonProps) {
  return (
    <button data-scamp-id="root" className={`${styles.root} ${className ?? ''}`} type="button" data-variant={variant}>
```

Each value's styles are a rule after every element's own rules:

```css
.root[data-variant="outline"] {
  background: transparent;
}

.root[data-variant="outline"] .label_c1a1 {
  color: #2563eb;
}
```

A variant rule outranks the element's own rule, and its own `:hover`
rule. Rules Scamp can't place on one value, such as one that combines
two axes (`[data-variant="outline"][data-size="small"]`), are kept as
they are, and you edit them in the CSS panel.

## Slots

Props let an instance customize text. Slots let an instance pass in
whole elements. They're Scamp's version of React's `children` prop. A
`Card` with a slot can hold different content on every page while
sharing one frame, border, and padding.

### Define a slot

1. Inside the component editor, right-click any empty rectangle.
2. Select **Make slot**.

The rectangle turns into a labeled drop target:

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
   ✦ slot: children
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

- The first slot is named `children` (the default slot). Add more, and
  they come up as `slot1`, `slot2`, and so on. Rename them in the Data
  tab's Slots list to something meaningful, such as `header`, `footer`,
  or `icon`. Names must be unique.
- A component can have one default slot plus any number of named slots.
- Only a childless rectangle can become a slot. A slot's job is to hold
  page content, so it can't have its own children, and a slot can't be
  placed inside another slot.

Behind the scenes, this becomes a real `children` or `React.ReactNode`
prop:

```tsx
type CardProps = {
  children?: React.ReactNode;   // the default slot
  header?: React.ReactNode;     // a named slot
};
```

### Fill a slot on a page

Place the component on a page, and each slot shows as a drop zone:

```
┌──────────────────────────────┐
│  Card                        │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│     Drop elements here      │ │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
└──────────────────────────────┘
```

There are two ways to put content in:

- **Drag** an existing element from the canvas or the
  [layers panel](layers-panel.md), and drop it onto the slot box.
- **Draw or type directly**: With the slot box under your pointer, use
  the rectangle, text, or image tool to create an element right inside
  it.

Drop multiple elements, and they stack as siblings in the slot. With
several named slots, each box fills its own slot; the content routes to
whichever box you dropped on.

Slot content belongs to the page, not the component. It's the instance's
children, so it can differ on every page and doesn't change the
component definition. In the generated page TSX, the default slot
becomes JSX children, and named slots become props:

```tsx
<Card>
  <p className={styles.body}>Anything you like.</p>
</Card>

<SplitLayout
  left={<p className={styles.heading}>Hello</p>}
  right={<img src="/assets/hero.png" />}
/>
```

### Slots in the Data tab

- **In the component editor**, the Data tab lists each slot with a
  rename field and a **Remove** button. Click a slot's badge to select
  its box on the canvas.
- **On a page instance**, the Data tab shows which slots have content
  and which are empty (`✦ header  ● 2 elements` or `○ Empty`).

**Note:** If a component defines slots but an instance's content doesn't
match any of them—for example, plain children on a component that has
only named slots—that content doesn't render, exactly as it wouldn't in
React. It's still in your page file. Give it a matching slot, or move it
into one, to bring it back.

## Edit a component

Changes you make in the component editor—adding elements, moving them,
changing colors, or adjusting layout—write to the component's own files.
The file watcher picks up the change, and every instance on every page
re-renders to reflect the update. There's no recompile step.

If you delete an element that was a Prop, every instance loses access to
that prop. Scamp warns you before the delete lands if any page currently
uses that override.

## Smart warnings

Scamp shows specific warnings before destructive operations that could
silently break instances or pages. The warnings name the affected pages
and instance counts, never a generic message.

- **Deleting a component**: Lists every page that uses it and the number
  of instances on each. You can choose to detach instances (replace them
  with the component's frozen contents inline on each page) or cancel.
- **Renaming a component**: Updates every instance's JSX tag and the
  import path in every consuming page. The History panel shows one entry
  per page touched.
- **Removing a Prop-mode text element**: Lists every page with instances
  that override that prop.
- **Removing a slot**: If instances on other pages have content in that
  slot, lists the affected pages. The content isn't deleted. It stays in
  each page file and stops rendering until you re-place it.
- **Nesting a component into its own slot**: A drop that would make a
  component contain itself (a circular slot dependency) is refused, with
  a note in the app log.

## When not to use a component

- **One-off layouts**: If a layout appears only once on one page, it
  doesn't need to be a component. Keep it inline; you can always promote
  it later.
- **Single-element wrappers**: A component that wraps one rectangle with
  no extra structure is usually noise. Promote when multiple elements
  move together.
- **Page-specific copy**: If a card's text varies per page and there's
  no shared structure to extract, keep it inline. Components are about
  structural reuse; per-page variation belongs on the page.

## Tips

- The component editor's canvas has no page root. The component's
  outermost element is the root. See
  [Component canvas size](#component-canvas-size) for how the artboard
  is sized.
- Instances render their CSS Modules from the component's own
  `[Name].module.css`. Page-level styles don't leak in.
- Renaming an instance on a page changes only its `data-scamp-id` on
  that page. The component definition is untouched.
- An AI agent can edit `components/[Name]/[Name].tsx` directly, like a
  page file. The canvas reloads as expected.
- Every component file ends with an `export const _scamp` line that
  records the file format version and the component's event props.
  Scamp writes it on every save. See
  [Views and components](code-output.md#views-and-components).
