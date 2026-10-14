# Scamp — Feature Backlog v8

User stories ordered easiest to hardest within each feature.
Both features are major and depend on the components feature
(feature-components.md) being complete first.

---

# Feature 1: Component Variants

## Overview

Component variants let a single component have multiple visual
configurations — for example a Button component with `solid`,
`outline`, and `ghost` variants. Each variant is a fully designed
version of the component sharing the same element tree, but with
different visual styles or structure.

Variants are designed side by side on the component artboard — each
variant is its own canvas stacked vertically below the previous one,
so you can always see the comparison without switching tabs or losing
context. This mirrors how designers actually work when exploring
alternatives.

**Depends on:** feature-components.md (components) must be complete.

---

## 1.1 Define variants on a component artboard

**User story**

As a user building a design system, I want to add named variants to
a component directly on the artboard so I can design and compare
multiple visual configurations side by side without switching between
views.

**Behaviour — the artboard**

The component editor artboard renders each variant as its own canvas,
stacked vertically with a gap between them. Each canvas has a label
in the top-left corner showing the variant name.

Initial state — one canvas, labeled with the default variant name:

```
┌─────────────────────────────────────┐
│ solid                               │
│                                     │
│   [ Button canvas ]                 │
│                                     │
└─────────────────────────────────────┘

                [ + New variant ]
```

After adding a second variant:

```
┌─────────────────────────────────────┐
│ solid                               │
│                                     │
│   [ Button canvas ]                 │
│                                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ outline                             │
│                                     │
│   [ Button canvas — duplicate ]     │
│                                     │
└─────────────────────────────────────┘

                [ + New variant ]
```

**Adding a variant**

- A "+ New variant" button sits below the last canvas on the artboard
- Clicking it duplicates the current bottom canvas and appends it
  below with a default name: `variant-2`, `variant-3` etc.
- The new canvas is an exact copy of the canvas it was duplicated from
  — the user edits from there rather than starting from scratch
- The artboard scrolls vertically to show the new canvas and focuses
  its name label for immediate renaming

**Naming and renaming variants**

- The label in the top-left of each canvas is editable — click to
  enter edit mode, Enter or click away to commit
- The first variant (created when the component is created) defaults
  to `default` but is editable
- Variant names become the prop values — they must be valid JavaScript
  identifiers: lowercase, no spaces, no hyphens (use underscores if
  needed)
- Renaming a variant triggers the smart warning flow (see story 1.4)
  if instances already exist on pages

**Editing a variant**

- Click any element on any variant canvas to select it — the properties
  panel shows that element's styles for that variant
- Edits made on one variant canvas do not affect other variant canvases
- Both style changes and structural changes (adding, removing, or
  reordering elements) are allowed on any variant canvas
- A subtle indicator on the variant label shows when it has been
  edited: `● outline` vs `outline`

**Variant limit**

- At 8 variants a warning banner appears above the "+ New variant"
  button:
  ```
  ⚠ You have 8 variants. Large variant sets are harder to maintain.
  Consider splitting into separate components.
  ```
- The button remains enabled — the warning is advisory, not blocking

**Deleting a variant**

- Right-click a variant label → "Delete variant"
- Shows the smart warning if instances use this variant (story 1.4)
- The `default` variant cannot be deleted — it is the fallback for
  all instances

**Done when:** Clicking "+ New variant" appends a new duplicate canvas
to the artboard, the label is editable, and edits on one canvas are
isolated from all others.

---

## 1.2 CSS output for variants

**User story**

As a developer receiving a Scamp project, I want variant styles to
output as clean, readable CSS so I can understand and extend the
component without wrestling with generated code.

**Style-only variants (same element tree)**

Each variant adds a modifier CSS class to the component root. The CSS
module contains a base class for shared styles and one class per
variant for overrides:

```css
/* Base styles — shared across all variants */
.root {
  display: inline-flex;
  align-items: center;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}

/* solid variant */
.variant-solid {
  background: #111111;
  color: #ffffff;
  border: 2px solid #111111;
}

/* outline variant */
.variant-outline {
  background: transparent;
  color: #111111;
  border: 2px solid #111111;
}

/* ghost variant */
.variant-ghost {
  background: transparent;
  color: #111111;
  border: 2px solid transparent;
}
```

The component TSX applies both the base class and the variant class:

```tsx
type ButtonVariant = 'solid' | 'outline' | 'ghost';

type ButtonProps = {
  label?: string;
  variant?: ButtonVariant;
};

export default function Button({
  label = 'Click me',
  variant = 'solid',
}: ButtonProps) {
  return (
    <div className={`${styles.root} ${styles[`variant-${variant}`]}`}>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
```

**Structural variants (different element tree)**

When a variant canvas has a different element structure from the
default, Scamp generates a conditional render branch:

```tsx
export default function Button({
  label = 'Click me',
  variant = 'solid',
}: ButtonProps) {
  if (variant === 'icon') {
    return (
      <div className={`${styles.root} ${styles['variant-icon']}`}>
        <span className={styles.iconWrap}>
          <svg viewBox="0 0 16 16">...</svg>
        </span>
        <span className={styles.label}>{label}</span>
      </div>
    );
  }

  return (
    <div className={`${styles.root} ${styles[`variant-${variant}`]}`}>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
```

**`parseCode` updates**

- Recognise the `` styles[`variant-${variant}`] `` pattern as a
  variant class application
- Parse each `.variant-[name]` CSS block back into its variant's
  style overrides in Zustand state
- Recognise conditional render branches as structural variants and
  map them back to the correct variant canvas in the artboard

**Done when:** Generated code compiles, is readable, and round-trips
through `parseCode` correctly.

---

## 1.3 Placing instances with variant selection

**User story**

As a user placing a component on a page, I want instances to always
start as the default variant and then easily switch variant from the
properties panel.

**Behaviour — drag to place**

- Dragging a component from the components list onto a page canvas
  always places it in the `default` variant (the first variant defined,
  regardless of its name)
- No variant picker on drag — just drop and it appears as default

**Behaviour — switching variant on an instance**

- When a component instance is selected on a page, a "Component"
  section appears at the top of the WYSIWYG properties panel:
  ```
  ┌──────────────────────────────────┐
  │  Component                       │
  │  Button                          │
  │                                  │
  │  Variant   [ solid ▾ ]           │
  │                                  │
  └──────────────────────────────────┘
  ```
- The Variant dropdown lists all available variants for that component
- Selecting a variant updates the instance on the canvas immediately
  and writes the new variant prop value to the page TSX
- Below the Component section the normal WYSIWYG sections continue —
  position, size, etc. — since the instance still participates in
  the page layout

**Generated page TSX:**

```tsx
<Button data-scamp-instance-id="inst_a1b2" variant="solid" label="Get started" />
<Button data-scamp-instance-id="inst_c3d4" variant="outline" label="Learn more" />
```

**Done when:** Dragging a component places the default variant. The
Component section in the WYSIWYG panel lets users switch variants.
Two instances of the same component on a page can show different
variants independently.

---

## 1.4 Smart warnings for variant changes

**User story**

As a user managing variants, I want to be warned before I make changes
that could break existing instances so I never silently lose work.

**Renaming a variant:**
```
Rename "outline" to "bordered"?

This variant is used by 6 instances across 3 pages.
The prop value will be updated on all instances.

[ Rename ]   [ Cancel ]
```
On confirm: updates `variant="outline"` to `variant="bordered"` on
every instance in every page TSX — atomic multi-file write.

**Deleting a variant:**
```
Delete "ghost" variant?

3 instances use this variant:
· home (1 instance) — will fall back to "solid"
· dashboard (2 instances) — will fall back to "solid"

[ Delete ]   [ Cancel ]
```
On confirm: removes the variant CSS block and updates affected
instances to use the default variant.

**Deleting the default variant:**

The default variant cannot be deleted. The delete option is disabled
in the right-click menu with a tooltip:

```
The default variant cannot be deleted.
Rename another variant to "default" first to change which one is default.
```

**Done when:** All destructive variant operations show a specific,
accurate warning before proceeding and execute atomically.

---

## 1.5 Variant preview in component list

**User story**

As a user browsing the components panel, I want to see all variants
of a component so I can understand what is available before placing
one.

**Behaviour**

- In the components list, components with more than one variant show
  a small expand arrow next to the component name
- Expanding shows a stacked list of variant thumbnails, each labeled
  with the variant name
- Dragging any variant thumbnail onto the canvas places an instance
  with that variant pre-selected — the one exception to the "always
  place as default" rule
- The component's thumbnail in the collapsed list always shows the
  default variant

**Done when:** The component list shows all variants as thumbnails
and dragging a variant thumbnail places a correctly configured instance.



---

# Feature 2: Data Fetching

## Overview

Data fetching lets users connect pages and components to real data
sources — a JSON API, a local JSON file, or a mock data file — so
designs can show real content rather than placeholder text. The design
philosophy follows what React developers actually do: fetch data in a
page component, pass it down as props.

This is the foundation for Scamp becoming a tool for designing real,
data-driven interfaces rather than static mockups. Everything saves as
real, runnable Next.js code — including the fetch calls.

**Depends on:** components (feature-components.md) and preview mode
(features-v3 story 5) must be complete. Data fetching is only
meaningful when the preview runs real React.

---

## 2.1 Page-level data fetching

**User story**

As a user designing a data-driven page, I want to define a fetch call
for my page that retrieves real data from a URL so the page renders
with actual content rather than hardcoded placeholder text.

**Behaviour — adding a fetch to a page**

- A "Data" tab appears in the left sidebar for the active page,
  alongside Pages and Components
- The Data tab for a page contains a "Fetch" section with a form:
  ```
  Endpoint URL:  [ https://api.example.com/users ]
  Method:        [ GET ▾ ]
  Headers:       [ + Add header ]
  ```
- A "Test fetch" button sends the request and shows the response
  preview inline — the first 5 items if the response is an array,
  the full object if it is a single item
- A "Save" button commits the fetch configuration to the page

**Generated page code**

Scamp generates a Next.js `async` server component with a `fetch`
call at the top — the standard Next.js data fetching pattern:

```tsx
import styles from './page.module.css';

export default async function Home() {
  const res = await fetch('https://api.example.com/users');
  const users = await res.json();

  return (
    <div className={styles.root}>
      {users.map((user: User) => (
        <div key={user.id} className={styles.rect_a1b2}>
          <p className={styles.text_c3d4}>{user.name}</p>
        </div>
      ))}
    </div>
  );
}
```

**Done when:** A page can have a fetch URL defined, the request is
tested successfully in the Data tab, and the generated page TSX
includes the async fetch call.

---

## 2.2 Mock data file (design-time data)

**User story**

As a user designing a page with a fetch call, I want to define mock
data that Scamp uses on the canvas and in the Data tab preview so I
can see realistic content while designing without requiring a live API.

**Behaviour**

- Each page with a fetch defined gets an optional `[page].data.json`
  file in the same folder as the page:
  ```
  app/
  ├── page.tsx
  └── page.data.json     ← mock data for canvas and preview
  ```
- The Data tab shows a JSON editor for the mock data file alongside
  the fetch configuration
- When mock data is present, Scamp uses it to render the canvas —
  the real fetch call is not made during design
- In preview mode (`next dev`), the mock data file is injected as the
  fetch response so the preview also shows realistic content without
  hitting a live API
- When a user clicks "Test fetch" the real API response can optionally
  be saved as the mock data file with one click

**Mock data format:**

The mock data file is plain JSON matching the shape of the API response:

```json
[
  { "id": 1, "name": "Angie Hemans", "role": "Designer" },
  { "id": 2, "name": "Alex Chen", "role": "Developer" }
]
```

**Canvas rendering with mock data:**

When mock data is present and the page has a `.map()` over the data,
Scamp renders the first item from the array on the canvas — enough to
show what the design looks like with real data without rendering a
full list that might overflow the canvas.

**Done when:** Adding a `page.data.json` file causes the canvas to
render with that data. Editing the JSON in the Data tab updates the
canvas in real time.

---

## 2.3 Binding data to elements

**User story**

As a user designing a data-driven layout, I want to bind specific
data fields to specific text elements on the canvas so the canvas
shows real field values rather than placeholder text, and the
generated code references the data correctly.

**Behaviour — binding a text element**

- When a text element is selected on a page that has mock data defined,
  the Data tab in the properties panel shows a "Bind to data" section
- A field picker shows the available fields from the mock data:
  ```
  Bind to field:
  ○ None (static text)
  ● user.name
  ○ user.role
  ○ user.email
  ```
- Selecting a field updates the text element to show the mock data
  value on the canvas
- The text element is visually marked as data-bound with a small
  database icon in the layers panel
- Bound text cannot be edited directly on the canvas — double-clicking
  shows a tooltip: "This text is bound to user.name. Edit the mock
  data to change the preview."

**Behaviour — list rendering**

When the mock data is an array and a rectangle on the canvas is
designated as the list item:

- Right-click a rectangle on a page with array data → "Set as list
  item"
- The rectangle becomes the repeating item template — it shows once
  on the canvas (using the first item from the mock data array)
- A list indicator appears above the element in the canvas:
  ```
  ↻ Repeating — users (3 items in mock data)
  ```
- Scamp generates a `.map()` in the TSX wrapping that element with
  each data-bound text element referencing the loop variable

**Generated code with data binding:**

```tsx
export default async function Home() {
  const res = await fetch('https://api.example.com/users');
  const users = await res.json();

  return (
    <div className={styles.root}>
      {users.map((user: User) => (
        <div key={user.id} className={styles.rect_a1b2}>
          <p className={styles.text_c3d4}>{user.name}</p>
          <p className={styles.text_e5f6}>{user.role}</p>
        </div>
      ))}
    </div>
  );
}
```

**`parseCode` updates**

- Recognise JSX expressions (`{user.name}`, `{item.title}`) in text
  positions and map them back to data bindings in Zustand state
- Recognise `.map()` patterns and mark the mapped element as a list
  item in the canvas state
- Data bindings are preserved verbatim through `customProperties` if
  they cannot be parsed — never discarded

**Done when:** A text element on the canvas shows a real field value
from mock data, the list repeater works with the first mock data item,
and the generated TSX is valid, runnable React code.

---

## 2.4 Component-level data props

**User story**

As a user passing data to components from a page, I want to bind a
component instance's props to fields from the page's data so components
render with real content when the page fetches data.

**Behaviour**

- When a component instance is selected on a page that has mock data,
  the Data tab in the properties panel shows prop bindings alongside
  text overrides:
  ```
  Props

  label     [ Static: "Click me" ]  or  [ Bind: user.name ▾ ]
  variant   [ Static: "default" ]
  ```
- A toggle per prop switches between static value and data binding
- Selecting a binding shows the resolved value from mock data in the
  canvas immediately
- The generated TSX passes the data field as the prop value:
  ```tsx
  <UserCard
    data-scamp-instance-id="inst_a1b2"
    name={user.name}
    role={user.role}
  />
  ```

**Done when:** A component instance on a page can have its props bound
to data fields, the canvas shows the resolved mock values, and the
generated TSX passes data correctly to the component.

---

## 2.5 Local JSON file as data source

**User story**

As a user designing with local data, I want to point a page at a local
JSON file in my project rather than a remote URL so I can design with
structured data that does not require an internet connection or a
running API.

**Behaviour**

- In the Data tab fetch form, an alternative to entering a URL is
  selecting "Local file" as the source type
- A file picker opens the project folder — the user can select any
  `.json` file in the project
- The selected file path is relative to the project root:
  `./data/users.json`
- The generated code uses `fs.readFileSync` for local file reads in
  a Next.js server component:
  ```tsx
  import fs from 'fs';
  import path from 'path';

  export default async function Home() {
    const filePath = path.join(process.cwd(), 'data/users.json');
    const users = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    return (
      <div className={styles.root}>
        {users.map((user: User) => (
          <div key={user.id} className={styles.rect_a1b2}>
            <p className={styles.text_c3d4}>{user.name}</p>
          </div>
        ))}
      </div>
    );
  }
  ```
- The local JSON file is also used as the mock data for the canvas
  and preview — no separate `page.data.json` needed when a local
  file is the source
- chokidar watches the local data file — changes to the file update
  the canvas in real time

**Done when:** A page can use a local JSON file as its data source,
the canvas renders with that data, and the generated code reads the
file correctly in a Next.js server component.

---

## Notes

**On variants and data together:**
A variant-aware component that also accepts data props is the full
design system story — a `UserCard` component with `compact` and
`expanded` variants where each instance can be bound to a different
user record from a list. Both features are designed to compose
naturally because they both operate through the same props system.

**On TypeScript types:**
The generated fetch code uses inline type annotations (`user: User`)
but does not generate a full TypeScript type definition automatically
in the first version. The type is inferred from the mock data shape
by the user or their coding agent. A future story could generate
TypeScript types from the mock data JSON automatically.

**On authentication:**
Fetching from authenticated APIs (Bearer tokens, API keys in headers)
is supported via the Headers section of the fetch form. The header
values are stored in the page's data configuration and written into
the fetch call. Sensitive values like API keys should be moved to
environment variables by the user — Scamp generates a `process.env`
reference and documents this in `agent.md`.

**On error states:**
Data fetching error and loading states are out of scope for this
initial story. The generated code does not include `try/catch`,
loading skeletons, or error boundaries. These are the user's
responsibility to add and are well-documented Next.js patterns
a coding agent can help with.