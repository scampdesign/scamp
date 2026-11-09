# Embedded Scamp — gaps with the Scamp canvas

Status: **priorities set** (2026-11-09); see [Priorities](#priorities). A list of what the Scamp canvas
does that Embedded Scamp doesn't, or does differently, to choose which
gaps to close. Each has a possible approach and a rough size: **S** (a
day or so), **M** (a few days), **L** (a week or more, or a design
question first).

Embedded Scamp works differently on purpose. The canvas owns its files and
writes them itself, instantly. Embedded Scamp edits a project it doesn't
own: it previews on the running app and the agent writes the source. So
some gaps are the price of that, and some are just not built yet. The
**Why** line says which.

Related: [the plan](embedded-scamp-plan.md),
[agent connection](embedded-agent-connection-plan.md).

## How edits get written

### 1. Edits take seconds and cost tokens

- **Canvas:** an edit is written to the file at once, by code.
- **Embedded:** every edit goes through the agent: it reads the file,
  edits it, and the dev server reloads. Seconds per batch, and tokens.
- **Why:** the project's styles can be written any way (Tailwind, CSS
  Modules, styled-components), so a person or agent has to decide where.
- **Approach:** a fast path that writes without the agent where the
  answer is certain. For example, a CSS Module rule for a class the
  element has, in a file Scamp can parse, for properties that map one to
  one; or a move of two sibling JSX elements in one file. Everything else
  still goes to the agent. Start with CSS Modules and plain CSS. **M**

### 2. The panel shows only some of the element's real values

- **Canvas:** the panel shows exactly what the file says.
- **Embedded:** the page reports 50 computed properties
  (`EMBEDDED_COMPUTED_PROPERTIES`). Sections it doesn't read show their
  defaults whatever the element has: **Filters**, **Transitions**,
  **Animations**, background images and gradients, grid placement,
  `order`, `transform-origin`, text decoration and shadow, `white-space`,
  `cursor`, `object-fit`, `outline`, and visibility. Editing them still
  works, but the starting value shown is wrong.
- **Approach:** read the rest of the properties those sections use. Where
  computed values can't round-trip (animations), say "set in your code"
  rather than showing a default. **S**

### 3. Values read as computed pixels, not as written

- **Canvas:** `width: auto`, `50%`, `1.5rem`, `var(--space-md)` show as
  written.
- **Embedded:** everything is the computed value: an `auto` width shows
  as `312px`, a token as its color or size. Only what you change is sent,
  so this doesn't reach the source unless you edit that field, but the
  panel misleads, and a pixel can replace a token.
- **Approach:** read the authored value from the matching CSS rules in
  the page (CSSOM: rules that match the element, by specificity), and
  fall back to computed. Tailwind classes map back to their scale. **M**

### 4. No design tokens

- **Canvas:** token pickers for colors, spacing, type, radius, and
  shadows, from the project's `theme.css`.
- **Embedded:** the pickers are empty: the embedded window loads no
  design system. The agent is told to use the project's scale, but you
  can't pick a token.
- **Approach:** read the project's tokens from the running page (custom
  properties on `:root`) and Tailwind's theme (`tailwind.config` or
  `@theme` in v4), and load them as the panel's design system. A choice
  goes to the agent as the token name, not its value. The plan's phase 8
  (editing tokens themselves) builds on this. **M**

### 5. No undo

- **Canvas:** **Cmd+Z** and the History panel, per page.
- **Embedded:** nothing undoes a panel edit. Before the agent runs you can
  remove a queued item, which drops its preview; after, it's **Discard**
  (all of the agent's changes) or **Revert** (a whole commit).
- **Approach:** **Cmd+Z** in the window undoes the last edit: before it's
  sent, it reverts the preview and the queue item; after the agent wrote
  it, it restores that file's previous content (the agent's queue knows
  each run's files). **M**

## Layout and structure

### 6. No breakpoints

- **Canvas:** a breakpoint switcher, with edits scoped to it as
  `@media` rules.
- **Embedded:** the app fills the window at whatever width it is. There's
  no width control, and every edit applies at all widths.
- **Approach:** a width control above the app (phone, tablet, desktop,
  custom) that sizes the webview, and an edit made at a narrow width
  queued with that breakpoint, so the agent writes a media query or
  Tailwind's `sm:`/`md:` prefix. The project's breakpoints come from its
  CSS or Tailwind config. **M**

### 7. Can't add, delete, duplicate, or wrap elements

- **Canvas:** draw rectangles, text, images, and inputs; delete;
  duplicate; group into a flex container.
- **Embedded:** none. An instruction can ask the agent ("add a subtitle
  under this"), but there's no direct action.
- **Approach:** start with **Delete** and **Duplicate** on the selection,
  and **Wrap in a container**, each as a queued structural edit like a
  move, previewed by hiding or cloning on the page. Adding new elements
  is bigger: what to add (a tag, a component from the project?) is a
  design question. **M** for delete, duplicate, and wrap; **L** for adding.

### 8. Moves only within the same parent

- **Canvas:** the Layers panel moves an element into another parent.
- **Embedded:** reorder among siblings only.
- **Approach:** allow dropping into another element, in the tree first.
  The source edit is harder (the JSX may cross components), so the agent
  writes it, with a marker until it does. **M**

### 9. One element at a time

- **Canvas:** multi-select with Cmd-click and Shift-click, and edits to
  all of them.
- **Embedded:** one selection. **All N** covers instances of one JSX line,
  not a hand-picked set.
- **Approach:** multi-select in the page and tree, with the panel showing
  shared values; the queue item lists every element. **M**

## Content

### 10. Text isn't editable in place

- **Canvas:** double-click text to edit it.
- **Embedded:** an instruction only.
- **Approach:** double-click text in the page to edit it there (a
  `contenteditable` overlay on a copy, so React's DOM isn't touched), and
  queue the change. Text from data (props, an API) is detected the way
  lists are, and the agent says when it can't. **M**

### 11. Images, links, and attributes

- **Canvas:** the **Element** section changes the tag, a link's target,
  an image's source and alt text, and input attributes.
- **Embedded:** none of these.
- **Approach:** show the element's attributes and queue changes to them;
  an image replaced from disk is copied into the project's assets by the
  agent. **M**

### 12. No component editing

- **Canvas:** a component editor, variants, props, and per-instance
  overrides.
- **Embedded:** **This one** and **All** stand in for "this instance" or
  "the component". There's no view of a component on its own, its props,
  or its variants.
- **Why:** a project's components can take any shape: props, variants
  through `cva` or class maps, children.
- **Approach:** start small: show the component an element belongs to,
  its props as the page's React tree has them, and "edit the component"
  as a scope beside This one and All. A real component editor is **L**.

## Around the editing

### 13. A chat with the agent

- **Canvas:** the Agent panel: a conversation, with each turn's changes
  reviewable and undoable.
- **Embedded:** one instruction box and a log; no back-and-forth, no
  per-turn undo.
- **Approach:** reuse the Agent panel's conversation UI against the
  embedded agent, with each turn's files shown, and per-turn undo once
  item 5 exists. **M**

### 14. No code view of the selection

- **Canvas:** the code panel shows the element's TSX and CSS live.
- **Embedded:** the source location only, and diffs after the agent
  writes.
- **Approach:** a read-only code view of the selection's source lines and
  the matching CSS rule, opened from its file and line. **S**

### 15. Export, preview, history, terminal

- **Export (PNG, SVG, HTML):** not in Embedded. Low value: the app is
  already real. A PNG of the selection would be **S** if wanted.
- **Preview:** not needed: the running app is the preview.
- **History and snapshots:** git does this job (Accept, Revert, branches).
  A list of Scamp's commits exists on the Changes tab.
- **Terminal:** the dev server's output shows only on the setup screen.
  Showing it after start (for build errors after an agent edit) would be
  **S**.

### 16. No MCP for outside agents

- **Canvas:** the MCP server, so Claude Code and others can read and
  change the canvas.
- **Embedded:** none yet. This is plan A1 in
  [agent connection](embedded-agent-connection-plan.md).

## Where Embedded is ahead

Worth keeping in mind when closing gaps the other way:

- **The real app:** live data, real routes, and real behavior, not a
  static page.
- **Hover, focus, and active, forced on the page,** and freeze for menus
  and CSS hover. The canvas has a state switcher, but not the live app.
- **Git built in:** a branch per session, diffs, accept, revert, push.
- **Any React project, written in its own idiom**, Tailwind and Next.js
  included.
- **Design checks** across the whole project.

## Priorities

Decided 2026-11-09. Everything else above waits.

### P1: Reorder improvements (in progress)

Built on `feat/embedded-reorder`: drag on the page and in the tree, the
`order` preview, the block-flow marker, lifting an only child to its
parent with siblings, and the notes. Next, from manual testing:

- Try it on real projects with the real agent: a plain move, a component
  root, a `.map()` list, and a Next.js page.
- Then decide whether moving into another parent (gap 8) joins it.

### P2: Cmd+Z undo (gap 5)

- **Before the agent writes:** **Cmd+Z** undoes the last panel edit or
  move: it restores the page's preview, as the panel's own reset does
  (`restore`, the move's saved `order` or its marker), and takes the item
  out of the queue. **Cmd+Shift+Z** redoes it.
- **After the agent writes:** the queue records each run's files and
  their content before the run (it already tracks which files it
  touched). Undo puts that run's files back, as **Discard** does for all of
  them, and the page reloads. Only the last run, and only while its files
  haven't changed since, so undo never throws away a change made outside
  Scamp.
- **After Accept:** that's **Revert**, which exists. Undo doesn't reach
  past a commit.
- The **Changes** tab lists the undo stack, so it's clear what the next
  undo does.

### P3: A history of Scamp's changes, like the canvas's History panel

Today the **Changes** tab ends with **Scamp's commits**: each commit's
subject and a **Revert** button. The subject is the commit message
(`Scamp: update src/Card.module.css` unless the user typed one), which
says which file, not what changed. **Revert** adds a commit that undoes
one commit (`git revert`): it leaves a second entry behind, and it fails
outright when a later change touched the same lines.

Make it work like the canvas's History panel (`docs/user_docs/undo-redo.md`):

- **A timeline.** Newest first, every entry with a relative time ("3 min
  ago", the exact time on hover). An entry is one **Accept**, and it lists
  what changed in plain words from the queue items it carried: "Card:
  padding 16px → 24px (every card)", "Moved the hint above the title",
  "Header: hover background", not file names. The files and the diff open
  from the entry.
- **Clearer text.** Each queue item's description (`describeQueueItem`'s
  short form, the one the queue list shows) is saved with the commit: in
  the commit message body, so it survives in git, and Scamp reads it
  back for the timeline. A commit Scamp didn't make on the branch shows
  its own subject.
- **Click to go back.** Clicking an entry returns the project to how it
  was right after that change, the way the History panel jumps the
  canvas. Entries after it dim, below an "undone" divider, and clicking
  one goes forward again. A new edit or Accept drops the dimmed ones, as
  the History panel does: history is linear.
- **How, in git.** On the session's `scamp/` branch, going back moves the
  branch to that commit with `git reset --keep`, which keeps the user's
  own uncommitted changes and refuses rather than overwrite them. Going
  forward moves it to a later commit the same way: Scamp keeps the
  timeline's commit ids, so a "dimmed" entry is still reachable. No revert
  commits pile up, and nothing conflicts, because it's a whole state, not
  a patch. The app reloads after each jump.
- **When it can't move the branch.** If the branch was pushed past the
  point (moving it would need a force push), or the user has uncommitted
  changes in the files the jump would touch, Scamp says so and offers
  **Revert** as today, which adds a commit instead.
- **With undo (P2).** **Cmd+Z** past the last Accept steps back through
  this timeline, one entry at a time, so undo and history are one model,
  as on the canvas.
- **Agent changes not yet accepted** stay in the review above the
  timeline: the timeline is only what's committed.

### P4: Breakpoint switcher (gap 6)

- A width control above the app: **Desktop**, **Tablet** (768), **Mobile**
  (390), and a custom width. It resizes the webview, so the app's own
  media queries apply, as in a real browser.
- The project's own breakpoints, when Scamp can read them (Tailwind's
  screens, or the `min-width`/`max-width` values in its CSS), replace the
  defaults, so a width lines up with a breakpoint the code uses.
- An edit made below **Desktop** is queued with that breakpoint. The agent
  writes it as a media query, or Tailwind's `md:`/`sm:` prefix, in the
  project's mobile-first or desktop-first direction, and leaves other
  widths alone. The preview applies it inside the same media query, so
  resizing back shows the desktop styles unchanged.

### P5: Edit text, images, and links, and show what comes from data (gaps 10, 11)

- **Text:** double-click to edit in place on the page (on an overlay, not
  React's own DOM). **Images:** replace the source and edit the alt text.
  **Links:** edit the target. Each is queued for the agent like a style
  edit.
- **Hard-coded or data.** Only content written in the code is editable.
  Content that comes from data (props filled from an API, state, a CMS,
  a `.map()` over fetched items) isn't. Scamp shows which, before you try:
  - **Written in the JSX:** the text, `src`, or `href` is a literal at the
    element's source line. Editable.
  - **Passed in as a literal prop:** a component's `<Card name="Ada" />`.
    Editable, at the place the component is used, which the edit names.
  - **From data:** an expression with no literal behind it, or one of
    several items drawn by one JSX line. Not editable, with a short note
    ("This text comes from data"); styling stays editable.
- **How Scamp tells.** Main reads the element's source line (it already
  reads files for Next.js) and parses the JSX around it with a JSX parser
  (`@babel/parser` is in the tree today only as a transitive dependency,
  and TypeScript only as a dev dependency, so one becomes a real
  dependency; `@babel/parser` is the smaller). It checks whether the content is a literal there, and
  follows a prop to the call site through React's props in the page. When
  the parse can't decide, the element is treated as data. The agent still
  checks before writing, and says so if a "literal" turns out not to be.

### P6: Component edits from the page, without a component editor (gap 12)

This mostly works today: every element a component draws carries the
component file's source line, so a `Card` used three times shows **This
one** and **All 3**. **All** asks the agent to change the component's
definition; **This one** asks it to override that instance where it's
used. What's left:

- **Check it** on real projects: a border on a component's root, on an
  element inside it, and on an instance inside a `.map()`. There, "this
  one" has no call site of its own, so the agent needs a condition (by
  index or key) or says it can't.
- **Say it's a component.** The scope buttons read **This Card** and
  **Every Card**, with how many are on this page, when the element is
  drawn by a component. **Every** reaches the component's other pages
  too, which the label should say.
- **Instances on other pages.** The count is per page. Scamp can't count
  other pages without visiting them, so the label says "on this page".
- A component editor (props, variants, the component on its own) waits.
