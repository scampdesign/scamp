// templates/agentMd.ts — CLAUDE.md stub + the agent.md guidance templates (legacy + nextjs).
// Split out of src/shared/agentMd.ts (4.6); re-exported via the barrel.

/**
 * Stub `CLAUDE.md` written alongside `agent.md`. Claude Code reads
 * `CLAUDE.md` automatically at session start, and its `@./agent.md`
 * import syntax pulls the full agent.md content into context — so
 * sessions land with the Scamp guidance already loaded instead of
 * relying on the agent to remember to read `agent.md` first. The
 * stub itself stays tiny so the on-disk story is "agent.md is the
 * source of truth, CLAUDE.md just routes the loader to it".
 *
 * Same managed-file disclaimer + refresh-on-open behaviour as
 * agent.md — there's nothing in here for a user to customise.
 */
export const CLAUDE_MD_CONTENT = `<!-- This file is managed by Scamp and refreshed on every project open. Edits made by hand will be overwritten. -->

# Scamp Project — Claude Code Loader

This file exists so Claude Code auto-loads the Scamp agent
instructions on session start. The real content lives in
\`agent.md\`; the import below pulls it in.

@./agent.md
`;


/**
 * Legacy `agent.md` — written into projects using the flat file layout
 * (`<page>.tsx` + `<page>.module.css` at the project root, assets in
 * `assets/`). Kept as the canonical instructions for legacy projects
 * that haven't yet been migrated to the Next.js App Router layout.
 *
 * Do NOT edit this without bumping the migration tooling — agents
 * working in legacy projects depend on it being accurate for that
 * layout.
 */
export const AGENT_MD_CONTENT_LEGACY = `<!-- This file is managed by Scamp and refreshed on every project open. Edits made by hand will be overwritten. -->

# Scamp Project — Agent Instructions

You are editing files in a Scamp project. Scamp is a local design tool
that bidirectionally syncs canvas state with real \`.tsx\` + CSS module
files. Anything you write here is parsed and re-rendered on the canvas.

## TL;DR

- Edit CSS first, then TSX. Always. Same file write should look like:
  CSS save → wait → TSX save.
- Every Scamp element is a JSX node with both \`data-scamp-id="…"\` AND
  \`className={styles.…}\` matching the same string.
- The \`_XXXX\` suffix is real hex (\`0-9 a-f\`), e.g. \`_a1b2\`. Not
  \`_n001\`, not \`_s002\`, not your own counter.
- Before referencing a token, check it exists in \`theme.css\`. Add
  missing tokens to \`theme.css\` first; never inline raw hex / rgba
  in module CSS.
- Prefer typed property values (px / rem, single \`font-size\` +
  breakpoint overrides) over \`clamp()\`, \`ch\`, or \`flex\` shorthand
  — those render fine but lock the user out of Scamp's panel
  controls. See "Editability — prefer typed properties."
- One CSS class = one rule block. No combined selectors, no nested
  \`@media\`.
- **Use flexbox for layout.** \`display: flex\` + \`flex-direction\` +
  \`gap\` is the default container pattern. Reach for grid only when
  you genuinely need a 2D template, and for absolute positioning
  only for overlays / fixed nav / decorative pseudo-elements. Never
  use absolute positioning as your primary layout strategy.
- If a class block already has rules in CSS, Scamp will leave it
  alone. Scamp only auto-creates EMPTY blocks for classes that
  appear in the TSX but aren't in the CSS yet.
- Anything Scamp doesn't model in its UI controls
  (\`clip-path\`, \`mask\`, \`@keyframes\`, comments, etc.)
  round-trips through your file unchanged and renders on the canvas.

## What Scamp does and doesn't touch

| You write | Scamp's response |
|---|---|
| A new element in TSX with \`data-scamp-id="hero_x1y2"\` and a className that doesn't exist yet in the CSS | Scaffolds an empty \`.hero_x1y2 {}\` block in the CSS module. |
| A new element in TSX whose class IS already in the CSS module | Leaves your CSS rule alone. Renders the element with your styles. |
| Any CSS property — \`position: fixed\`, \`box-shadow\`, \`backdrop-filter\`, \`@keyframes\`, gradients, animations | Parsed if Scamp has a typed control for it; otherwise stored verbatim and emitted byte-equivalent. The canvas renders the real CSS either way. |
| \`var(--token)\` anywhere — including inside \`padding\`, \`margin\`, \`gap\` shorthands | Preserved verbatim. The canvas resolves the variable through the project's \`theme.css\` and renders the resulting value. |
| A \`@media (max-width: Npx)\` block whose \`Npx\` matches a project breakpoint | Parsed into the breakpoint cascade and editable from the panel at that breakpoint. |
| A \`@media\` block with \`min-width\`, non-pixel units, or a width that doesn't match a project breakpoint | Preserved verbatim at the bottom of the file but not interpreted by the canvas. |
| Comments and blank lines inside CSS class blocks | Preserved on round-trips so long as the class block isn't being rewritten by a canvas edit. |
| Loose text fragments and unclassed JSX (\`<br>\`, \`<strong>\`, raw text) inside a Scamp element | Preserved in source order in the TSX and rendered. NOT manipulable from the canvas — they appear as a "Raw" group in the layers panel. |

## Editing alongside Scamp (safe to do)

Scamp's bidirectional sync is designed for an agent and the canvas
to coexist. When you (or any external editor — Claude Code, vim, an
IDE) write to a project file while Scamp is open, Scamp pauses its
own canvas-driven writes until your edits settle. You don't need to
close Scamp to make a change.

Concretely:

- The moment Scamp's file watcher sees an external write, the sync
  engine enters a paused state. The toolbar indicator turns blue
  and reads "Paused."
- Subsequent writes from the same agent (typical: 2-5 in a row as
  the agent iterates) extend the pause window. Scamp waits until
  ~2.5s after the last external write before resuming.
- If the user kept editing the canvas during the pause, Scamp shows
  a "Diverged" state when the pause clears. The user picks Save
  canvas (force overwrite disk) or Discard canvas (reload from
  disk). The agent's writes are NEVER silently overwritten.
- If Scamp's integrated terminal hosts the agent process (Linux /
  macOS), Scamp also pauses as soon as the agent process starts —
  even before the first write — so the first write never races.

What this means for the agent: write naturally, save when you're
done with a logical change, and don't worry about Scamp's canvas
state. Scamp will catch up.

## Active context

Scamp maintains a live context file at \`.scamp/context.md\`.
It always reflects the currently open page (or component) and the
selected element — its class, tag, current styles, children, and
ancestor chain.

Read it at the start of every session, and re-read it whenever the
user refers to "this element", "the selected one", or asks why
something looks the way it does. It saves the user describing what
they just clicked.

It is written by Scamp and regenerated on every selection. Never
edit it, and never commit it — \`.scamp/\` is gitignored.

## MCP server (preferred over the context file)

While Scamp is open it runs a local MCP server, already registered in
this project's agent config — you should have \`scamp_*\` tools
available with no setup. If this is the first time, your agent may ask
you to approve the project's MCP server before the tools appear.

Prefer these tools over \`.scamp/context.md\`: the file is a snapshot
written on selection, the tools read the canvas at the moment you ask.

- \`scamp_get_selected_element\` — what the user means by "this" or "it"
- \`scamp_get_element_by_id\` — any element, selected or not
- \`scamp_get_element_tree\` — structure only; cheap, start here
- \`scamp_get_active_page\` — which page or component is open
- \`scamp_list_pages\` / \`scamp_list_components\` — what else exists
- \`scamp_get_view_props\` — a view's or component's exact props type and
  sample data; call before writing the route or page that renders it
- \`scamp_get_recent_edits\` — what the user has changed since you last
  looked; call it before editing a file you read earlier
- \`scamp_get_theme_tokens\` — call before writing any colour, spacing,
  or typography value so you use a token instead of a literal
- \`scamp_get_canvas_state\` — everything at once; large, and capped

If the tools are missing, Scamp is closed or no project is open — fall
back to \`.scamp/context.md\`, and read \`.scamp/mcp.json\` for the
server's URL and token. Never commit that file: the token is local to
this machine.

## Critical rules
- Never remove \`data-scamp-id\` attributes from any element.
- Never change the 4-char hex suffix of a class name (e.g. the \`a1b2\`
  in \`hero_card_a1b2\`) — it's the element's unique identifier.
- **Every \`data-scamp-id\` MUST be unique within the page.** When you
  duplicate or copy an element, generate a fresh random 4-char hex
  for the new one — never reuse an existing id. Each id ⇒ exactly
  one JSX element ⇒ exactly one CSS class block. Duplicate ids
  produce an invalid file: Scamp's parser keeps only the last
  occurrence of each id and silently drops the earlier ones, so the
  canvas and the file will visibly disagree.
- Never combine multiple selectors into one rule block
  (\`.a, .b { … }\` will be misread).
- Never nest \`@media\` inside a class rule — only the top-level form
  is parsed (see "Responsive breakpoints").
- One class = one rule block, always.
- \`data-scamp-id\` must always match the CSS class name exactly.
- Renaming an element? Change its class name in BOTH files in the SAME
  edit — the \`.tsx\` (\`className\` AND \`data-scamp-id\`) and the
  \`.module.css\` selector. (Scamp can recover a one-sided rename via the
  shared 4-char hex id, but only while that id is unchanged on both sides.)
- Put element states on the element's OWN class —
  \`.card_a1b2:hover { … }\` — which Scamp parses into an editable state. A
  cross-element interaction (\`.card_a1b2:hover .arrow_c3d4 { … }\`) is kept
  verbatim but is NOT editable on the canvas; keep any such block
  self-contained and valid (every declaration ends in \`;\`).

### Each rendered element needs its OWN unique class

A common mistake is to treat a className like a reusable "type"
or "component class" — defining \`.card\` once and reusing it on
ten sibling \`<div>\`s. **That does not work in Scamp.**

Every JSX element you render is a separate element on the
canvas, and every element needs its own unique
\`data-scamp-id\` + className pair, where the class name ends in
its own fresh 4-char hex suffix.

❌ WRONG — reusing one class across siblings, omitting
\`data-scamp-id\` on duplicates, and skipping the hex suffix:

\`\`\`tsx
<ul className={styles.card_list}>
  <li data-scamp-id="card_row" className={styles.card_row}>Scamp</li>
  <li className={styles.card_row}>Figma</li>
  <li className={styles.card_row}>Framer</li>
</ul>
\`\`\`

Scamp's parser sees one element here (the first \`<li>\`), drops
the rest, and the canvas will not match the file.

✅ RIGHT — every visible element gets its own id+class with a
unique hex suffix. If the rows share styles, write the rule
ONCE in CSS keyed off the parent (e.g. \`.card_list_x1y2 > li\`)
or just repeat the declarations in each block:

\`\`\`tsx
<ul data-scamp-id="card_list_x1y2" className={styles.card_list_x1y2}>
  <li data-scamp-id="card_row_a1b2" className={styles.card_row_a1b2}>Scamp</li>
  <li data-scamp-id="card_row_c3d4" className={styles.card_row_c3d4}>Figma</li>
  <li data-scamp-id="card_row_e5f6" className={styles.card_row_e5f6}>Framer</li>
</ul>
\`\`\`

The same applies to every level of nesting — buttons, list
items, repeated cards, table rows. If you'd render N copies on
the page, you need N unique class names, each with its own hex
suffix and its own \`data-scamp-id\`.

## File editing order — CSS first, then TSX

Scamp watches for file changes. When the TSX file is saved, Scamp
parses it and auto-scaffolds empty CSS class blocks for any new
\`data-scamp-id\` it finds whose class is NOT already in the CSS
module. If you write the TSX first, the auto-scaffold will land
*before* you write the matching styles.

**Always write or edit the CSS module file before the TSX file.**

1. Add / update styles in \`[page].module.css\`.
2. Then add / update markup in \`[page].tsx\`.

When the TSX lands, every class is already present in the CSS so
the scaffolder is a no-op and your styles are untouched.

If you are making changes to both files, re-read the CSS file
after writing the TSX in case Scamp added a scaffold for an
element whose class wasn't in the CSS yet.

## Worked example — a sticky navbar

You want a navbar fixed to the top of the page with token-driven
colours and a circular brand badge.

Step 1: write the CSS (\`home.module.css\`):

\`\`\`css
.root {
}

.site_nav_n123 {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: blur(8px);
}

.brand_b001 {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-primary);
}
\`\`\`

Step 2: write the TSX (\`home.tsx\`):

\`\`\`tsx
import styles from './home.module.css';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <nav data-scamp-id="site_nav_n123" className={styles.site_nav_n123}>
        <div data-scamp-id="brand_b001" className={styles.brand_b001} />
      </nav>
    </div>
  );
}
\`\`\`

What Scamp does on save:
- Parses both files.
- Sees \`.site_nav_n123\` and \`.brand_b001\` already in the CSS — leaves
  them alone.
- Renders the navbar with \`position: fixed\`, the token-driven colours,
  the \`backdrop-filter\`, and the circular brand badge — all preserved
  byte-equivalent.

If you later change the brand background colour from the canvas
panel, Scamp surgically rewrites just the \`background\` line inside
\`.brand_b001\`. Everything else in the file stays put.

## Project structure
Each page is two files: \`[page-name].tsx\` and \`[page-name].module.css\`.
Do not rename, move, or split these files.

Images live in the \`assets/\` folder. Reference them with relative paths:
- \`<img>\` elements: \`src="./assets/hero.png"\`
- Background images: \`background-image: url("./assets/hero.png")\`

Do not delete files from \`assets/\` unless the user asks.

## Component conventions
- Each page exports a single default React component.
- The root element uses \`styles.root\` and \`data-scamp-id="root"\`.
- Every other element needs both:
  - a \`data-scamp-id\` attribute matching the full CSS class name
  - a className following \`[prefix]_[4-char-hex-id]\`

### Element naming
The class name prefix identifies the element:

- **Default names:** \`rect_a1b2\` (container), \`text_c3d4\` (text)
- **Custom names:** \`hero_card_a1b2\`, \`sidebar_ff12\`, \`nav_links_e5f6\`

Custom names make the generated code more readable and help the user
identify elements in the layers panel. Use them when the element has
a clear semantic role. Rules:

- The prefix is lowercase, words separated by underscores.
- Only alphanumeric characters and underscores (no hyphens, no spaces).
- The last \`_XXXX\` segment is always a 4-character hex id — digits
  \`0-9\` and lowercase letters \`a-f\` only. Never \`g-z\`, never
  uppercase, never an incrementing counter. Never change an
  existing id.
  - ✅ \`_a1b2\`, \`_c3d4\`, \`_ff12\`, \`_e5f6\`, \`_b001\`, \`_c101\`
  - ❌ \`_n001\` (\`n\` not hex), \`_h003\`, \`_s002\`, \`_w005\`, \`_x004\`
- If the prefix is \`rect\` or \`text\`, scamp treats it as unnamed and
  infers the element type from the prefix. Any other prefix is a custom
  name, and scamp infers the type from the HTML tag instead.
- Custom names don't need to be unique — the hex suffix handles that.

When creating new elements, prefer descriptive names:

| Instead of        | Use                    |
|-------------------|------------------------|
| \`rect_a1b2\`       | \`hero_section_a1b2\`    |
| \`rect_c3d4\`       | \`sidebar_c3d4\`         |
| \`text_e5f6\`       | \`page_title_e5f6\`      |
| \`rect_g7h8\`       | \`nav_links_g7h8\`       |

- Do not add inline styles — all styles live in the CSS module.

## HTML tags
Use semantic HTML. Scamp captures the actual tag name and renders it
on the canvas, so the design preview matches what ships.

There are four element types, identified by the class-name prefix:

- **Text** (\`text_\` prefix or custom name) — any text-bearing tag:
  \`p\`, \`h1\`–\`h6\`, \`span\`, \`a\`, \`label\`, \`blockquote\`, \`pre\`,
  \`code\`, \`strong\`, \`em\`, \`small\`, \`time\`, \`figcaption\`, \`legend\`,
  \`li\`, \`button\`, \`th\`, \`td\`, \`caption\`. Default: \`p\`.
- **Container** (\`rect_\` prefix or custom name) — block-level tags:
  \`div\`, \`section\`, \`article\`, \`aside\`, \`main\`, \`header\`,
  \`footer\`, \`nav\`, \`figure\`, \`form\`, \`fieldset\`, \`ul\`, \`ol\`,
  \`li\`, \`details\`, \`summary\`, \`dialog\`, \`button\`, \`a\`, \`table\`,
  \`thead\`, \`tbody\`, \`tfoot\`, \`tr\`, \`th\`, \`td\`. Default: \`div\`.
- **Image / media** (\`img_\` prefix or custom name) — \`img\`, \`video\`,
  \`iframe\`, \`svg\`. Default: \`img\`.
- **Input / form control** (\`input_\` prefix or custom name) — \`input\`,
  \`textarea\`, \`select\`. Default: \`input\`.

\`<button>\`, \`<a>\`, \`<li>\`, \`<th>\`, and \`<td>\` are **dual-natured**.
A leaf holding only a text label (\`<button>Sign up</button>\`,
\`<a href="/">Home</a>\`) is a TEXT element: Scamp reads and edits its
label on the canvas like any other text. The SAME tag holding element
children (\`<button><svg …/><span …>Go</span></button>\`) is a
CONTAINER. Scamp decides automatically from the contents, so:

- A button or link that is just a label needs NO nested \`<span>\` —
  put the text directly inside (\`<button data-scamp-id="cta_a1b2"
  className={styles.cta_a1b2}>Sign up</button>\`) and it's
  canvas-editable. Give it a \`text_\` or custom prefix (not \`rect_\`).
- Only reach for children inside a button/link when it genuinely
  contains more than text (an icon plus a label). Then it's a
  container, and the label goes in its own text child.

Pick the tag that best describes the content. A page hero is a
\`<header>\`. A page title is an \`<h1>\`. A paragraph of body copy is
a \`<p>\`. The user will thank you (and so will their accessibility
audit).

### Text ALWAYS goes in a text element — never bare in a container

This is the single most common mistake, and it produces broken,
uneditable designs. **Read this carefully.**

A container (\`<div>\`, \`<section>\`, a \`rect_\` element) is for
layout. It is NOT a text element. If you write words directly
inside a container, Scamp cannot model them as an editable text
element — they collapse into a loose "Raw" fragment attached to the
parent. That fragment renders on the canvas but is NOT selectable,
NOT editable from the properties panel, and clutters the layers
panel. This is exactly the "fragment" problem that makes a design
unmanageable.

**Every run of visible text must be the CONTENT of a text element**
— a text-bearing tag (\`p\`, \`h1\`–\`h6\`, \`span\`, \`a\`, \`label\`,
\`blockquote\`, \`li\`, …) with its own \`data-scamp-id\` and its own
matching \`text_\`-prefixed (or custom-named) CSS class.

❌ WRONG — raw text sitting directly in a container. Scamp turns
"Welcome to Scamp" and "Draw, and it becomes code." into
uneditable Raw fragments:

\`\`\`tsx
<div data-scamp-id="hero_h1a2" className={styles.hero_h1a2}>
  Welcome to Scamp
  <div data-scamp-id="rect_c3d4" className={styles.rect_c3d4}>
    Draw, and it becomes code.
  </div>
</div>
\`\`\`

✅ RIGHT — the container holds text CHILDREN, each its own text
element with an id + class. Now every line is selectable and
editable on the canvas:

\`\`\`tsx
<div data-scamp-id="hero_h1a2" className={styles.hero_h1a2}>
  <h1 data-scamp-id="hero_title_t1a2" className={styles.hero_title_t1a2}>Welcome to Scamp</h1>
  <p data-scamp-id="hero_body_t3b4" className={styles.hero_body_t3b4}>Draw, and it becomes code.</p>
</div>
\`\`\`

Rules of thumb:

- A container's job is layout; it should contain child ELEMENTS,
  not bare words. If a \`<div>\` / \`<section>\` has text in it,
  that text belongs in a \`<p>\`, heading, or \`<span>\` child.
- A button or link that is just a text label IS itself a text-
  capable element — put the label directly inside the
  \`<button>\` / \`<a>\` (\`<button …>Sign up</button>\`). You don't
  need to nest a \`<span>\` for a plain label. But if a card is a
  \`<div>\` with a heading and a paragraph, those are two separate
  text children, never bare text in the div.
- The ONLY text you may leave bare inside an element is inline
  formatting WITHIN a text element — \`<strong>\`, \`<em>\`, \`<br>\`,
  \`<code>\` interleaved with the words of a \`<p>\` (see "Loose text
  and unclassed JSX" below). That is a text element containing
  inline markup, not a container containing raw text — the
  distinction that matters is whether the DIRECT parent of the
  words is a text element or a container.
- When in doubt: if you're about to type words as the direct child
  of a \`<div>\`, stop and wrap them in a \`<p>\` (or the right
  heading) with its own \`data-scamp-id\` + class first.

### Tag-specific attributes

Scamp preserves every attribute you write on an element verbatim through
round-trips, so feel free to add the attributes a real HTML tag needs:

- \`<a>\` — \`href\`, \`target\`
- \`<button>\` — \`type\` (\`button\` / \`submit\` / \`reset\`)
- \`<form>\` — \`method\` (\`get\` / \`post\`), \`action\`
- \`<label>\` — \`htmlFor\` (React's spelling of HTML's \`for\`)
- \`<time>\` — \`datetime\`
- \`<blockquote>\` — \`cite\`
- \`<dialog>\` — \`open\` (bare, no value)
- \`<video>\` — \`src\`, \`controls\`, \`autoplay\`, \`loop\`, \`muted\`
  (bare for booleans)
- \`<iframe>\` — \`src\`, \`title\`
- \`<input>\` — \`type\` (text/email/password/number/checkbox/radio/
  range/date/file), \`placeholder\`
- \`<textarea>\` — \`rows\`, \`placeholder\`

### Two tags with dedicated syntax

- **\`<select>\`** children must be \`<option value="x">Label</option>\`
  elements only — don't nest other canvas elements inside. Scamp
  manages options through a typed list rather than as nested children.
- **\`<svg>\`** inner markup is preserved byte-for-byte but NOT rendered
  on the canvas (svg shows as a placeholder rectangle). Edit the raw
  source through the Element section in the properties panel, or in
  the TSX file directly — either way round-trips cleanly.

Example:

\`\`\`tsx
<div data-scamp-id="root" className={styles.root}>
  <header data-scamp-id="page_header_hdr0" className={styles.page_header_hdr0}>
    <h1 data-scamp-id="page_title_t1a2" className={styles.page_title_t1a2}>About</h1>
    <p data-scamp-id="bio_t3b4" className={styles.bio_t3b4}>I'm Angie...</p>
  </header>
  <nav data-scamp-id="nav_nav0" className={styles.rect_nav0}>
    <a data-scamp-id="link_l1n2" className={styles.text_l1n2} href="/about" target="_self">About</a>
  </nav>
  <form data-scamp-id="signup_f1a2" className={styles.rect_f1a2} method="post" action="/signup">
    <label data-scamp-id="email_lbl1" className={styles.text_lbl1} htmlFor="email">Email</label>
    <input data-scamp-id="email_in01" className={styles.input_in01} type="email" placeholder="you@example.com" />
  </form>
</div>
\`\`\`

### Loose text and unclassed JSX inside an element

You can interleave plain text and unclassed JSX (\`<br>\`, \`<strong>\`,
\`<em>\`, raw inline spans) with Scamp elements. They round-trip in
source order and render correctly. They appear in the layers panel
as a "Raw" group attached to the parent so the user can see them
exists, but they're not editable from the canvas — only by editing
the TSX file directly.

\`\`\`tsx
<div data-scamp-id="meta_m001" className={styles.meta_m001}>
  Role: <strong>Founder, Designer, Developer</strong>
</div>
\`\`\`

If you want any of those text fragments to be canvas-editable, wrap
each one in its own classed element with a \`data-scamp-id\` and a
matching CSS class.

## Tables

Tabular data — rows of records with aligned columns — is a real
\`<table>\`, never flex rows that imitate one. Two flex rows (a header and
a body row) each carrying \`flex-basis: 120px\` for the same column is the
mistake this section exists to prevent: every column width is written
twice, and nothing keeps the copies in step.

**Structure.** Write the shape a browser builds, or the exported page
moves your elements and the canvas won't match it:

\`\`\`
table
├── caption        (optional, first)
├── thead > tr > th
├── tbody > tr > td
└── tfoot > tr > td
\`\`\`

Rows go in a \`thead\`, \`tbody\`, or \`tfoot\` — not straight in the
\`table\`. Anything that isn't a cell goes inside a \`th\` or \`td\`.

**Columns are defined once, on the table.** The table is a grid, and its
\`grid-template-columns\` is the only place a column's width lives:

\`\`\`css
.patients_a1b2 {
  display: grid;
  grid-template-columns: 2fr 120px 100px;
}
\`\`\`

Scamp carries those columns to every section and row itself, with a
rule it derives and writes after the table's own:

\`\`\`css
:where(.patients_a1b2) > :where(thead, tbody, tfoot),
:where(.patients_a1b2) :where(tr) {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
}
\`\`\`

- **Never write \`display\`, \`subgrid\`, or \`grid-column\` on a section or
  row yourself.** The derived rule does it. A row's own class rule can
  stay empty.
- **Never give a \`th\` or \`td\` a \`width\`.** Its column sets it. A cell
  width fights the track and recreates the duplication tables exist to
  remove; the panel shows a cell's width as \`Column\` and won't edit it.
  Height, padding, and alignment are still the cell's own.
- **A cell spans columns with the \`colSpan\` attribute**
  (\`<td colSpan="2">\`), not with \`grid-column\`. Scamp derives the
  placement from the attribute.
- **No \`rowSpan\`.** Each \`<tr>\` is one row of the table's grid, so a cell
  can't reach into the next one. Restructure instead.

**Row and cell styling is set once, on the table**, not on every row or
cell. Scamp reads exactly these rules — this form, with these
selectors — as the table's settings, which the user edits under
**Rows and cells** in the panel. Write only the ones you need:

\`\`\`css
/* Cell padding and text alignment, every th and td */
.patients_a1b2 :where(th, td) {
  padding: 8px 12px;
  text-align: left;
}

/* A line under every row */
:where(.patients_a1b2) :where(tr) {
  border-bottom: 1px solid var(--color-border);
}

/* A background on every second body row */
:where(.patients_a1b2) > :where(tbody) > :where(tr:nth-child(even)),
:where(.patients_a1b2) > :where(tr:nth-child(even of tr)) {
  background-color: var(--color-neutral-50);
}

/* The header stays at the top while the page scrolls */
:where(.patients_a1b2) > :where(thead) {
  position: sticky;
  top: 0;
  z-index: 1;
}
\`\`\`

- Keep each body to exactly those declarations, in that order. Add
  anything else and Scamp still keeps the rule, verbatim, but the panel
  can't edit it.
- \`text-align\` takes \`left\`, \`center\`, or \`right\`. A divider is
  \`<px> <solid|dashed|dotted> <color>\`, in that order. Padding is px or
  \`var(--token)\` values.
- A row's or cell's own rule still wins, so style the exception there:
  the header row's background goes on the \`thead\`'s class, and one cell
  that needs more room gets its own \`padding\`.

After writing a table, call \`scamp_check_view\`: it reports elements in
the wrong place, cells with their own width, a \`rowSpan\`, and a divider
or padding repeated on every row or cell.

## CSS conventions

### Layout: flex first, always

**Use flexbox for layout unless the user explicitly asks for
something else.** This is the single most important layout rule in
Scamp. The canvas, the panel controls, and the round-trip parser are
all built around flex as the default container model.

- A container with multiple children should set
  \`display: flex\` on the parent. Pick \`flex-direction\` (row /
  column), \`gap\`, \`align-items\`, and \`justify-content\` to lay them
  out. Don't reach for grid or absolute positioning first.
- **CSS grid is allowed**, but reserve it for the specific cases
  flex can't express cleanly: 2D grids with both row AND column
  alignment constraints (e.g. a 4×3 photo grid), or templates with
  named areas. A simple two-column "image left, text right" layout
  is flex, not grid.
- **Absolute positioning is for special cases only** — overlays,
  toasts, fixed nav bars, decorative pseudo-elements (\`::before\` /
  \`::after\` badges). Never use \`position: absolute\` as your
  primary layout strategy for siblings inside a container; that's
  what flex is for. A row of cards is flex; an overlay on top of an
  image is absolute.
- **No \`float\`, no \`display: table\`, no inline-block hacks.** Flex (or
  grid when justified) covers every modern layout need. Tabular data is
  the exception: write a real \`<table>\`, laid out the way the Tables
  section describes, rather than rebuilding one from flex rows.
- Flex parents render correctly on the Scamp canvas AND are
  editable from the panel's Layout control. Grid and absolute
  layouts still render but expose fewer controls to the user.

When in doubt: \`display: flex\` plus \`flex-direction\` plus \`gap\`.

### Decorative layers must be \`position: absolute\`

A glow, gradient wash, blurred blob, or any other purely visual layer
inside a flex container **must** be taken out of flow:

\`\`\`css
/* ❌ wrong — an in-flow flex item. It is invisible, but it still
   occupies main-axis space and shoves the real content sideways. */
.hero_glow {
  width: 980px;
  height: 820px;
  background: radial-gradient(circle, rgba(160,140,255,.2), transparent 70%);
}

/* ✅ right — painted, but out of flow */
.hero_glow {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  width: 980px;
  height: 820px;
  background: radial-gradient(circle, rgba(160,140,255,.2), transparent 70%);
  pointer-events: none;
}
\`\`\`

The parent needs \`position: relative\` for the layer to anchor to it.

\`pointer-events: none\` stops it swallowing clicks, but it does **not**
remove it from layout — only \`position: absolute\` (or \`fixed\`) does.
This is the single most common way an agent-built hero ends up with its
content squashed and pushed to one side.

### A fixed-width sibling competes with a \`width: 100%\` one

In a flex row, \`width: 100%\` is a *starting size*, not a guarantee. A
sibling with a fixed width takes its share first and both shrink to fit:

\`\`\`css
.row   { display: flex; }
.fixed { width: 980px; }        /* takes ~half the row */
.fluid { width: 100%; max-width: 1160px; }   /* gets what's left */
\`\`\`

If you want the fluid child centred in the container, don't put a sized
sibling in flow next to it — make the sibling absolute, or wrap the
content so the decorative element is not a flex item.

### Other CSS rules

- One property per line.
- **Every declaration ends with a semicolon, including the last one
  in a block.** Browsers tolerate a missing trailing semicolon but
  Scamp's parser doesn't always — and worse, missing semicolons
  between declarations turn the whole block into one malformed
  declaration that the browser silently drops. Especially watch
  this in \`::before\` / \`::after\` rules, which are easy to write
  by hand without semis:
  \`\`\`css
  /* ❌ wrong — entire block fails to parse, no bullet renders */
  .item::before {
    content: "—"
    position: absolute
    left: 0
  }
  /* ✅ correct */
  .item::before {
    content: "—";
    position: absolute;
    left: 0;
  }
  \`\`\`
- Shorthand is fine (\`border: 1px solid #ccc\`, \`padding: 16px 24px\`).
- The page root is a regular rectangle in Scamp — it defaults to
  \`width: 100%\`, \`min-height: 100vh\`, and \`position: relative\` so the
  exported component fills any browser viewport and absolute children
  paint over a visible box. Scamp does NOT write the canvas viewport
  size (1440, 768, etc.) into \`.root\` — that's a design-tool
  preference stored separately in \`scamp.config.json\`. The canvas is
  a browser-window simulator (like Chrome DevTools' responsive mode);
  the deployed page is meant to work at any width. Don't re-introduce
  fixed pixel dimensions on \`.root\` unless the user specifically
  wants a fixed-width page.
- Width / height values:
  - \`width: 100%\` and \`height: 100%\` mean stretch to fill the parent.
  - \`width: fit-content\` and \`height: fit-content\` mean shrink to content.
  - \`width: auto\` / \`height: auto\` (or simply omitting the
    declaration) leaves the dimension up to normal CSS layout.
  - Pixel values (\`width: 320px\`) are explicit fixed sizes.
- Inside a flex parent, the flex layout engine takes over and
  positional declarations on the child are ignored. Same applies to
  grid children inside a grid container.
- For free-form containers (no flex / no grid), Scamp falls back to
  positioning children with \`position: absolute; left: Xpx; top: Ypx;\`.
  This is the FALLBACK, not the default — prefer flex (see Layout
  above). When you DO need absolute positioning (overlays, fixed
  nav), Scamp respects whatever \`position\` value you wrote
  (\`fixed\`, \`sticky\`, \`relative\`, \`absolute\`, \`static\`).
- **New text elements take their default font from the theme.** When
  you create a text element, set \`font-family: var(--font-sans);\` on
  its class so it inherits the project's default font. If the
  project doesn't declare \`--font-sans\` (an older project, or the
  user deleted it), fall back to the literal system stack:
  \`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"\`.
  The user can override per-element from the panel — your job is to
  pick the project's default at creation time, not to dictate.
- **New text elements default to \`width: fit-content\` and
  \`height: fit-content\`** so the box hugs the text. This way the
  user can change the font size and the box reflows automatically —
  no clipped descenders, no trapped whitespace. If the user later
  switches to a fixed width / height from the panel, that's their
  call; don't pre-emptively pin dimensions on text.
- **\`box-sizing: border-box\` is on by default** via a universal
  reset in \`theme.css\` (\`*, *::before, *::after\`). \`width: 100%\`
  plus \`padding\` works the way you'd expect — the padding sits
  inside the element's declared width, not outside it. Don't
  redeclare \`box-sizing\` per element; rely on the reset.

## CSS properties
Use any CSS property you'd use in a real stylesheet. Scamp renders
**every** valid CSS property on the canvas — there's no allow-list.

Internally Scamp routes a small set of properties (\`background\`,
\`border\`, \`border-radius\`, \`color\`, \`display\`, \`flex-direction\`,
\`flex-wrap\`, \`align-items\`, \`justify-content\`, \`align-content\`,
\`gap\`, \`row-gap\`, \`column-gap\`, \`width\`, \`height\`,
\`padding\`, \`margin\`, \`opacity\`, \`position\`, \`font-size\`,
\`font-weight\`, \`text-align\`, \`line-height\`, \`letter-spacing\`,
\`font-family\`, \`transition\`, \`box-shadow\`, \`filter\`,
\`backdrop-filter\`, \`transform\`, \`transform-origin\`,
\`mix-blend-mode\`, \`background-blend-mode\`, the grid container/item set, and the
flex-item set — \`flex\`, \`flex-grow\`, \`flex-shrink\`, \`flex-basis\`,
\`align-self\`, \`order\`) into
typed fields it can later expose via UI controls. Everything else
(\`clip-path\`, \`mask\`, \`isolation\`, gradients, \`@keyframes\`, …)
round-trips
through the file untouched AND is applied to the rendered element on
the canvas.

\`mix-blend-mode\` blends through to the page root by default.
Add \`isolation: isolate\` to a parent element to cap the blend at
that container — useful when you want a multiply-blended card
that doesn't bleed onto the page background. Scamp doesn't model
\`isolation\` as a typed field; it round-trips verbatim via
\`customProperties\` and renders natively on the canvas.

### Editability — prefer typed properties

Properties NOT in the typed-fields list above render correctly on
the canvas but the user can't adjust them from the panel — they'd
have to drop into code. Reach for the typed form when you have a
choice so the design stays tweakable from the canvas.

**Typography — avoid \`clamp()\`. Use a base value + named
breakpoint overrides.** Scamp's font-size control reads a single
number. \`clamp(min, preferred, max)\` is stored as a raw string and
the panel can't dial it. For responsive type, pick the desktop size
as the base and override at smaller widths (default Scamp
breakpoints: 768, 390):

\`\`\`css
.hero_title_a1b2 {
  font-size: 5.5rem;
}

@media (max-width: 768px) {
  .hero_title_a1b2 {
    font-size: 3.5rem;
  }
}

@media (max-width: 390px) {
  .hero_title_a1b2 {
    font-size: 2.5rem;
  }
}
\`\`\`

**Sizing — stick to px, rem, %, and Scamp's special modes.** Scamp's
size parser types \`Npx\`, percentages, \`auto\`, \`fit-content\`, and
the special \`100%\` / \`100vh\` modes. Other units — \`ch\`, \`em\`,
arbitrary \`vh\` / \`vw\` — are stored as raw values; the panel shows
the leading number but loses the unit when the user edits it. For
"limit a paragraph to ~52 characters of body text," write
\`max-width: 32rem\` instead of \`max-width: 52ch\`.

**Padding, margin, gap, border-radius, border-width — tokens are
first-class.** Scamp's shorthand parsers for these properties accept
plain px values AND \`var(--token)\` references, including mixed
forms across sides (\`padding: 16px var(--space-md) 16px var(--space-md)\`).
The panel's spacing controls round-trip both forms; tokens emit
verbatim into the saved CSS.

Other CSS units in these properties (\`rem\`, \`em\`, \`%\`, \`auto\`,
\`vh\`, \`vw\`, \`calc(...)\`) still fall into the passthrough bucket
and aren't editable from the panel — they render correctly but the
typed controls go blank. Stick to px or \`var(--token)\` if you want
the user to be able to tweak the value on canvas.

**Flex, on both sides.** The whole flex vocabulary is typed and
editable: on the parent, \`flex-direction\` (all four values),
\`flex-wrap\`, \`align-items\`, \`justify-content\`, \`align-content\`,
\`gap\` / \`row-gap\` / \`column-gap\`; on the child, \`flex-grow\`,
\`flex-shrink\`, \`flex-basis\`, \`align-self\`, \`order\`. The
\`flex\` shorthand is read on the way in (\`flex: 1 1 200px\`, \`flex:
none\`) and expanded; Scamp writes the longhands back.

- ✅ Parent: \`display: flex; flex-wrap: wrap; row-gap: var(--space-md);\`.
  Children: \`flex: 1 1 320px;\` — every field lands in the Size panel.
- Prefer a px, %, or \`var(--token)\` basis over \`calc(...)\`, which
  renders but shows as a bare string in the panel.
- \`flex-shrink: 0\` is how Scamp keeps a fixed-size child from being
  squashed; the panel shows it as **Don't shrink**. Setting a px size
  on a flex child's main axis adds it, and Fill / Hug / Auto removes it.
- \`flex: 1\` on a heightless child of a flex COLUMN means fill-height
  to Scamp — it maps to the Size panel's **Fill** on the height, not to
  the grow field. Write it when that's what you mean.

For "stretch this child to fill the row," the parent's default
\`align-items: stretch\` already does it — no per-child override.

**Vendor prefixes.** When a property needs a vendor prefix for
browser support (\`-webkit-backdrop-filter\` for Safari, etc.), write
both lines so the design renders on every browser:

\`\`\`css
.nav_a1b2 {
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}
\`\`\`

Scamp round-trips prefixed declarations verbatim through
\`customProperties\`.

**Lists — be explicit about markers.** \`<ul>\` / \`<ol>\` inherit
browser-default bullets. The reset block zeros their margin but not
\`list-style\`. Decide which you want and write it down:

- Keep markers: \`list-style: disc;\` (or \`decimal\` for \`<ol>\`) on
  the \`<ul>\` class. Explicit beats relying on browser defaults.
- Drop markers: \`list-style: none;\` on the \`<ul>\` class, then
  style each bullet on its own \`<li>\` class (padding +
  background-image, or an inline \`<svg>\` child). **Avoid \`> li::before\`
  compound selectors** — they render in the browser but aren't
  panel-editable, so the user can't tweak the bullet from the canvas.

\`var(--token)\` works anywhere a CSS value works, including inside
shorthand declarations like \`padding: var(--space-3) var(--space-5)\`.
Scamp resolves the variable at render time through \`theme.css\`.

\`:hover\`, \`:focus\`, and \`:active\` on an element's OWN class
(\`.card_a1b2:hover { … }\`) are parsed into editable per-state overrides —
tweakable from the panel. Other pseudo-selectors (\`:nth-child\`,
\`::before\`), descendant / combined forms (\`.a:hover .b { … }\`), and
at-rules other than \`@media (max-width: Npx)\` are preserved verbatim but
not parsed into the canvas model.

## Responsive breakpoints

Scamp writes per-breakpoint overrides as top-level \`@media
(max-width: Npx)\` blocks AT THE BOTTOM of the CSS module, AFTER every
base class rule. Each breakpoint has its own block containing one
class rule per element that overrides a property at that width:

\`\`\`css
.rect_a1b2 {
  width: 100%;
  padding: 24px;
}

.rect_c3d4 {
  background: #eee;
}

@media (max-width: 768px) {
  .rect_a1b2 {
    padding: 12px;
  }
}

@media (max-width: 390px) {
  .rect_a1b2 {
    padding: 8px;
  }
  .rect_c3d4 {
    width: 100%;
  }
}
\`\`\`

Rules for agents:

- **Only \`max-width\` queries are parsed.** \`min-width\`,
  \`prefers-color-scheme\`, \`orientation\`, and other query shapes are
  preserved verbatim but Scamp's canvas won't react to them.
- **Only pixel values are parsed.** \`max-width: 48rem\` won't be
  matched to a project breakpoint; use \`max-width: 768px\` etc.
- **The \`Npx\` value must match a breakpoint defined in the
  project.** Default breakpoints are 768 (tablet) and 390 (mobile).
  Unknown widths are preserved verbatim but treated as opaque.
- **Emit breakpoints widest-first** (tablet before mobile) so the CSS
  cascade picks the narrowest matching override.
- **Never nest \`@media\` inside a class rule** — only the top-level
  form above is parsed.
- **Desktop is the base.** Put desktop styles directly on the class,
  not inside a \`@media\` block.

## Per-element states (\`:hover\`, \`:active\`, \`:focus\`)

Scamp models three CSS pseudo-classes as first-class element states.
Style overrides for a state are written as a separate rule block
sharing the element's class name:

\`\`\`css
.rect_a1b2 {
  background: #ffffff;
  border-radius: 8px;
}

.rect_a1b2:hover {
  background: #f0f0f0;
}

.rect_a1b2:active {
  background: #e0e0e0;
}
\`\`\`

Rules for agents:

- **Emit state blocks immediately after the element's base block**,
  before any \`@media\` queries. Order: \`:hover\` → \`:active\` →
  \`:focus\`.
- **Only declare properties that differ from the base.** Scamp picks
  up the change as a state-specific override; redeclaring identical
  values just makes the file noisier.
- **Empty state blocks aren't allowed** — if an override has no
  declarations, omit the block entirely.
- **A transition declared on the base applies to all state changes
  automatically** (correct CSS behaviour). Don't add per-state
  \`transition\` declarations — Scamp doesn't model them.

### Other pseudo-classes are preserved verbatim

\`:focus-visible\`, \`:disabled\`, \`:checked\`, \`:nth-child(...)\`,
compound selectors like \`.rect_a1b2:hover .child\` — anything that
isn't one of the three recognised states — round-trip through Scamp
unchanged but aren't editable from the panel. Agents can write them
freely; Scamp preserves them text-stable.

## Animations

Scamp models the \`animation\` shorthand as a typed field on each
element. The shorthand emits and parses in the canonical order:

\`\`\`css
.rect_a1b2 {
  animation: fade-in-up 300ms ease forwards;
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
\`\`\`

Rules for agents:

- **\`@keyframes\` blocks live AFTER the per-element class blocks**
  but BEFORE any \`@media\` queries. Order: base classes → state
  pseudo-class blocks → custom selector blocks → \`@keyframes\` →
  \`@media\` → preserved-verbatim media blocks.
- **Preset names** Scamp's picker recognises: \`fade-in\`,
  \`fade-in-up\`, \`fade-in-down\`, \`slide-in-left\`,
  \`slide-in-right\`, \`scale-in\`, \`bounce-in\`, \`fade-out\`,
  \`fade-out-up\`, \`slide-out-left\`, \`slide-out-right\`,
  \`scale-out\`, \`pulse\`, \`shake\`, \`bounce\`, \`spin\`, \`ping\`,
  \`float\`, \`wiggle\`. Agents can use these names directly and
  Scamp will recognise them in the picker if the keyframes body
  matches the canonical version.
- **Custom-named animations** round-trip cleanly — Scamp marks them
  as "Custom" in the picker but doesn't touch them.
- **Multi-animation source** (\`animation: a 1s, b 2s\`) round-trips
  via the \`customProperties\` passthrough; the panel can't model the
  multi case but the value stays intact.
- **\`@keyframes\` blocks aren't auto-removed** when no element
  references them — Scamp leaves them on disk so agents can apply
  them later without reauthoring.

### Per-state animations

Animations work inside state blocks too:

\`\`\`css
.button:hover {
  animation: shake 500ms ease-in-out;
}
\`\`\`

CSS triggers the animation on hover-enter and **re-triggers it every
time the user re-enters hover** (the \`:hover\` declaration drops on
hover-leave). This is fine for one-shot motion (\`shake\`, \`pulse\`
once) but unusual for infinite loops — \`spin\` would reset on every
re-hover. For continuous loops, declare the animation on the base
state, not on \`:hover\`.

### Per-breakpoint animations

Per-breakpoint animations aren't typed — Scamp's picker only edits
the base and per-state animations. An agent-written
\`@media (max-width: 768px) { .foo { animation: spin 1s; } }\` block
round-trips verbatim but isn't editable from the panel.

## CSS Variables and Tokens

The project includes a \`theme.css\` file with five sections:

1. **Font imports** — optional \`@import url(...)\` lines at the top
   referencing Google Fonts (\`fonts.googleapis.com\`) or Adobe Fonts
   kits (\`use.typekit.net/<kit-id>.css\`). Scamp's Fonts panel
   manages these.
2. **Design tokens** — CSS custom properties inside \`:root\`. Includes
   a \`--font-sans\` stack used as the page-wide default font.
3. **Box-sizing reset** — a universal \`*, *::before, *::after { box-sizing: border-box; }\`
   rule so \`width: 100%\` plus padding renders the way modern CSS
   frameworks expect (padding sits inside the declared width).
4. **Body defaults** — a single \`body\` rule that applies
   \`--font-sans\` so an unstyled element renders in the project's
   default font everywhere (preview, \`next dev\`, production).
5. **Browser-default reset** — a marked-with-comment block that
   zeros margins on block-level semantic tags (\`p\`, \`h1\`–\`h6\`,
   \`ul\`, \`ol\`, etc.), forces \`display: block\` on replaced media
   (\`img\`, \`video\`, \`iframe\`, \`svg\`), and \`all: unset\`s
   interactive / form tags (\`button\`, \`a\`, \`select\`, \`input\`,
   \`textarea\`, \`fieldset\`, \`legend\`). Mirrors what the canvas
   renderer applies inline so canvas and preview show identical
   unstyled output. The block is preceded by the sentinel comment
   \`/* scamp: browser reset — keep canvas and preview in sync */\`.

\`\`\`css
/* scamp: font imports — managed by Project Settings → Fonts */
@import url("https://fonts.googleapis.com/css2?family=Inter&display=swap");

:root {
  --color-primary: #3b82f6;
  --color-text: #111111;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  font-family: var(--font-sans);
}

/* scamp: browser reset — keep canvas and preview in sync */
p, h1, h2, h3, h4, h5, h6, ul, ol, dl, dd,
blockquote, figure, pre, hr, fieldset {
  margin: 0;
}
img, video, iframe, svg { display: block; }
button, a, select, input, textarea, fieldset, legend {
  all: unset;
  box-sizing: border-box;
  font: inherit;
  color: inherit;
  display: block;
}
input, textarea, select { cursor: text; user-select: text; }
\`\`\`

Reference tokens in module CSS files using \`var()\` — anywhere a CSS
value goes, including inside shorthands. A new project's \`theme.css\`
declares colour and type tokens but no spacing or radius ones, so
declare any you use in its \`:root\` first — a \`var()\` with no
declaration resolves to nothing:

\`\`\`css
/* theme.css */
:root {
  --space-3: 12px;
  --space-5: 20px;
  --radius-md: 8px;
}

/* the module */
.button {
  background-color: var(--color-primary);
  color: var(--color-text);
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-md);
}
\`\`\`

Changing \`--font-sans\` updates the page-wide default font. Per-element
overrides (a \`font-family\` declaration on a class) win over this
default. Do not delete the \`body\` rule — it's how unstyled text
elements pick up the project's default font.

The browser-default reset is what makes Scamp's "what you see on the
canvas is what you get in the deployed page" promise hold. Browsers
add 1em of margin to \`<p>\`, default chrome to \`<button>\`, etc.;
the canvas zeros all of that via inline style; this block does the
same in CSS so both surfaces match. Editing or extending the rules
is fine, but **do not delete the sentinel comment** — Scamp uses it
to detect the block on project open and avoid reinserting a duplicate.

**Reference only tokens that already exist in \`theme.css\`.** A
\`var(--…)\` reference to an undeclared token resolves to the
property's *initial* value — e.g. \`padding: var(--space-md)\`
becomes \`0\`, \`background: var(--color-card-bg)\` becomes transparent,
\`max-width: var(--max-width)\` becomes \`none\`. The layout collapses
and the page looks broken on the canvas.

**Before writing any module CSS, read \`theme.css\` and note what
tokens exist.** A fresh project ships colour and type tokens —
\`--color-primary\`, \`--color-text\`, \`--color-surface\`,
\`--color-border\`, \`--font-sans\`, a \`--text-*\` scale and so on —
but no spacing scale, radii, or max-width. Most real layouts need some
of those.

**When you need a token that doesn't exist yet, add it to
\`theme.css\` first, then reference it.** Adding tokens is fine and
expected. What's NOT OK:

- Referencing a token that isn't declared anywhere.
- Inlining raw hex / rgba / hsl literals in module CSS to skip the
  theme step. Use a token for any color or scale value, even
  one-off ones. Genuine single-use literals (a brand mark's exact
  hex, a specific illustration tint) can stay literal — flag with
  a comment when you do.

Example: a layout needs accent shadows. Add
\`--shadow-card: 0 16px 40px rgba(0, 0, 0, 0.08);\` to \`theme.css\`,
then write \`box-shadow: var(--shadow-card);\` in the module file.

Do NOT change or remove existing token values without the user
asking — that's a design-system overhaul, not a layout edit.

## Design system

See \`DESIGN.md\` in the project root for the design system: brand
guidelines, design principles, and token usage guidance. It follows the
google-labs-code/design.md specification — YAML front matter holds exact
token values (auto-generated from \`theme.css\`), markdown prose holds
rationale and usage notes. Scamp regenerates the YAML from \`theme.css\`,
so don't hand-edit the front matter (it will be overwritten); the prose
sections round-trip and are yours to write.

## Project config

Each project also has a \`scamp.config.json\` file at the root. It holds
per-project settings like the artboard background colour. Scamp
reads and writes this file; don't modify it unless the user asks.

## Snapshot history

Scamp saves snapshots of the project in a \`.scamp/\` folder.
Do not modify or delete anything inside \`.scamp/\`.
Do not add \`.scamp/\` to version control — it is already in \`.gitignore\`,
except \`.scamp/agent-history/\`, the Scamp Agent's conversations, which
are shared with the project.

## What NOT to change
- Do not alter the import line at the top of the TSX file.
- Do not rename the default export function.
- Do not add new \`.tsx\` / \`.module.css\` files unless the user asks
  for a new page.
- Do not strip \`position: relative\` from \`.root\` — absolute-
  positioned children rely on it to anchor to the page root.
- Do not delete \`theme.css\` — it holds the project's design tokens
  and font imports.
- Do not delete \`scamp.config.json\` — it holds per-project settings.
- Do not combine multiple selectors into one rule block.
- Do not nest \`@media\` inside a class rule.
`;


import { WRITTEN_CONTRACT } from '../projectConfig';

/**
 * `agent.md` written into projects using the Next.js App Router layout
 * (the default for new projects). Differs from the legacy template in
 * project structure, asset path conventions, and the list of files
 * agents should leave alone.
 */
const NEXT_LAYOUT_PARAGRAPH = `This project uses the **Next.js App Router** layout — it can be opened
directly in a Next.js workspace and run with \`next dev\` outside of
Scamp without any reorganisation.`;

const SCAMP_LAYOUT_PARAGRAPH = `This project uses the **Scamp framework** layout (\`scampjs\`):

- \`views/<Name>/<Name>.tsx\` + \`.module.css\` — a page's design. Scamp
  owns and regenerates these.
- \`components/<Name>/\` — reusable pieces, same file shape.
- \`routes/\` — YOUR logic: a route file loads data and renders a view;
  \`routes/api/\` holds API handlers (\`GET\`, \`POST\`, … over a
  \`LoadContext\`, or a default-exported Hono app). Scamp lists these in
  its Routes section and writes only a \`render\` export or a generated
  route; it never regenerates them. \`scamp_list_routes\` lists them.
- \`design/theme.css\` — the design tokens.
- \`.dev.vars\` — local values for \`env\` in \`load()\` and API handlers,
  \`KEY=value\` per line; gitignored, never committed.

**Generate route** in Scamp writes \`routes/<slug>.tsx\` whose \`load()\`
returns the view's sample data; replace the samples with real data and
keep the shape, which is the view's props. A **Database** section below
appears when the project has a Drizzle recipe (\`scamp add drizzle\`).

There is no \`app/\` folder and no wrapper pages; a page IS its view.
\`npm run dev\` runs the framework's dev server (\`scamp dev\`).`;

const NEXT_WRAPPER_NOTE = `Its \`app/<slug>/page.tsx\` is a one-line wrapper Scamp writes and
regenerates — never edit it. New pages created in Scamp are views; a
legacy \`app/<slug>/page.tsx\` page keeps working until it is converted.`;

const SCAMP_WRAPPER_NOTE = `There are no wrapper pages: a page is its view, and the route file
under \`routes/\` that renders it is yours — Scamp never reads, lists,
or regenerates anything there.`;


/**
 * Everything the guidance says that depends on which layout the project
 * uses. A field here is the ONLY way a layout difference reaches the
 * document, so a new one can't be forgotten in a section nobody thought
 * to fork. see docs/notes/agent-md-layouts.md
 */
type LayoutVocabulary = {
  /** Opening paragraph naming the layout. */
  layoutParagraph: string;
  /** What sits between a page and its view, in the views section. */
  wrapperNote: string;
  /** The two files the CSS-first rule names. */
  pageCssPath: string;
  pageTsxPath: string;
  /** The files the worked example writes, and its `styles` import. */
  exampleCssPath: string;
  exampleTsxPath: string;
  exampleCssImport: string;
  /** Design tokens. */
  themeCss: string;
  /** One sentence on how the token file reaches the running app. */
  themeImportNote: string;
  /** Whole sections, which differ too much to parameterise. */
  structureSection: string;
  /** Routing, where a layout has any to explain. Carries its own trailing blank line, so an empty one changes nothing. */
  routesSection: string;
  linkingSection: string;
  assetsSection: string;
  previewSection: string;
  doNotChangeSection: string;
};

/**
 * The guidance, built for one project layout. Everything a layout
 * changes comes in through the vocabulary: forking the template by
 * string-replacing two paragraphs is what left 34 Next.js references
 * in a Scamp-framework project's agent.md.
 * see docs/notes/agent-md-layouts.md
 */
const buildAgentMd = (v: LayoutVocabulary): string => `<!-- This file is managed by Scamp and refreshed on every project open. Edits made by hand will be overwritten. -->

# Scamp Project — Agent Instructions

You are editing files in a Scamp project. Scamp is a local design tool
that bidirectionally syncs canvas state with real \`.tsx\` + CSS module
files. Anything you write here is parsed and re-rendered on the canvas.

${v.layoutParagraph}

## TL;DR

- Edit CSS first, then TSX. Always. Same file write should look like:
  CSS save → wait → TSX save.
- Every Scamp element is a JSX node with both \`data-scamp-id="…"\` AND
  \`className={styles.…}\` matching the same string.
- The \`_XXXX\` suffix is real hex (\`0-9 a-f\`), e.g. \`_a1b2\`. Not
  \`_n001\`, not \`_s002\`, not your own counter.
- Before referencing a token, check it exists in \`theme.css\`. Add
  missing tokens to \`theme.css\` first; never inline raw hex / rgba
  in module CSS.
- Prefer typed property values (px / rem, single \`font-size\` +
  breakpoint overrides) over \`clamp()\`, \`ch\`, or \`flex\` shorthand
  — those render fine but lock the user out of Scamp's panel
  controls. See "Editability — prefer typed properties."
- One CSS class = one rule block. No combined selectors, no nested
  \`@media\`.
- **Use flexbox for layout.** \`display: flex\` + \`flex-direction\` +
  \`gap\` is the default container pattern. Reach for grid only when
  you genuinely need a 2D template, and for absolute positioning
  only for overlays / fixed nav / decorative pseudo-elements. Never
  use absolute positioning as your primary layout strategy.
- If a class block already has rules in CSS, Scamp will leave it
  alone. Scamp only auto-creates EMPTY blocks for classes that
  appear in the TSX but aren't in the CSS yet.
- Anything Scamp doesn't model in its UI controls
  (\`clip-path\`, \`mask\`, \`@keyframes\`, comments, etc.)
  round-trips through your file unchanged and renders on the canvas.
- **Reusable UI goes in \`components/<Name>/\`, not on a page.** When
  the user asks for components, a kit, or a library, create component
  folders — see "Scamp components". A page of examples is not a
  component library.
- Don't run a build or install packages to verify your work. Scamp
  renders files as you save them; call \`scamp_check_view\` to see what
  it actually parsed. \`scamp_get_element_tree\` reports structure only,
  so a view that arrived degraded still looks correct in it.

## What Scamp does and doesn't touch

| You write | Scamp's response |
|---|---|
| A new element in TSX with \`data-scamp-id="hero_x1y2"\` and a className that doesn't exist yet in the CSS | Scaffolds an empty \`.hero_x1y2 {}\` block in the CSS module. |
| A new element in TSX whose class IS already in the CSS module | Leaves your CSS rule alone. Renders the element with your styles. |
| Any CSS property — \`position: fixed\`, \`box-shadow\`, \`backdrop-filter\`, \`@keyframes\`, gradients, animations | Parsed if Scamp has a typed control for it; otherwise stored verbatim and emitted byte-equivalent. The canvas renders the real CSS either way. |
| \`var(--token)\` anywhere — including inside \`padding\`, \`margin\`, \`gap\` shorthands | Preserved verbatim. The canvas resolves the variable through the project's \`theme.css\` and renders the resulting value. |
| A \`@media (max-width: Npx)\` block whose \`Npx\` matches a project breakpoint | Parsed into the breakpoint cascade and editable from the panel at that breakpoint. |
| A \`@media\` block with \`min-width\`, non-pixel units, or a width that doesn't match a project breakpoint | Preserved verbatim at the bottom of the file but not interpreted by the canvas. |
| Comments and blank lines inside CSS class blocks | Preserved on round-trips so long as the class block isn't being rewritten by a canvas edit. |
| Loose text fragments and unclassed JSX (\`<br>\`, \`<strong>\`, raw text) inside a Scamp element | Preserved in source order in the TSX and rendered. NOT manipulable from the canvas — they appear as a "Raw" group in the layers panel. |

## Editing alongside Scamp (safe to do)

Scamp's bidirectional sync is designed for an agent and the canvas
to coexist. When you (or any external editor — Claude Code, vim, an
IDE) write to a project file while Scamp is open, Scamp pauses its
own canvas-driven writes until your edits settle. You don't need to
close Scamp to make a change.

Concretely:

- The moment Scamp's file watcher sees an external write, the sync
  engine enters a paused state. The toolbar indicator turns blue
  and reads "Paused."
- Subsequent writes from the same agent (typical: 2-5 in a row as
  the agent iterates) extend the pause window. Scamp waits until
  ~2.5s after the last external write before resuming.
- If the user kept editing the canvas during the pause, Scamp shows
  a "Diverged" state when the pause clears. The user picks Save
  canvas (force overwrite disk) or Discard canvas (reload from
  disk). The agent's writes are NEVER silently overwritten.
- If Scamp's integrated terminal hosts the agent process (Linux /
  macOS), Scamp also pauses as soon as the agent process starts —
  even before the first write — so the first write never races.

What this means for the agent: write naturally, save when you're
done with a logical change, and don't worry about Scamp's canvas
state. Scamp will catch up.

## Active context

Scamp maintains a live context file at \`.scamp/context.md\`.
It always reflects the currently open page (or component) and the
selected element — its class, tag, current styles, children, and
ancestor chain.

Read it at the start of every session, and re-read it whenever the
user refers to "this element", "the selected one", or asks why
something looks the way it does. It saves the user describing what
they just clicked.

It is written by Scamp and regenerated on every selection. Never
edit it, and never commit it — \`.scamp/\` is gitignored.

## MCP server (preferred over the context file)

While Scamp is open it runs a local MCP server, already registered in
this project's agent config — you should have \`scamp_*\` tools
available with no setup. If this is the first time, your agent may ask
you to approve the project's MCP server before the tools appear.

Prefer these tools over \`.scamp/context.md\`: the file is a snapshot
written on selection, the tools read the canvas at the moment you ask.

- \`scamp_get_selected_element\` — what the user means by "this" or "it"
- \`scamp_get_element_by_id\` — any element, selected or not
- \`scamp_get_element_tree\` — structure only; cheap, start here
- \`scamp_get_active_page\` — which page or component is open
- \`scamp_list_pages\` / \`scamp_list_components\` — what else exists
- \`scamp_get_view_props\` — a view's or component's exact props type and
  sample data; call before writing the route or page that renders it.
  Check its \`warnings\`: a non-empty list means the view lost something
  on the way in and the props may not be the whole story
- \`scamp_check_view\` — what a page, view, or component LOST on parse:
  bindings kept as opaque text, declarations that render but leave the
  panel blank, undeclared tokens. Call it after writing or editing one;
  an empty \`findings\` list means it arrived intact. \`notes\` are
  valid CSS the panel has no control for: leave them, since rewriting
  the value changes the layout
- \`scamp_check_project\` — the same check on every page, view, and
  component at once. Call it after a change across several files
- \`scamp_get_conventions\` — these rules, scoped to this project's
  format. No argument for the summary and the section list, then
  \`section\` for the one you need
- \`scamp_get_component_scaffold\` — the exact starter files for a new
  component; call it before creating one
- \`scamp_get_recent_edits\` — what the user has changed since you last
  looked; call it before editing a file you read earlier
- \`scamp_get_theme_tokens\` — call before writing any colour, spacing,
  or typography value so you use a token instead of a literal
- \`scamp_get_canvas_state\` — everything at once; large, and capped

If the tools are missing, Scamp is closed or no project is open — fall
back to \`.scamp/context.md\`, and read \`.scamp/mcp.json\` for the
server's URL and token. Never commit that file: the token is local to
this machine.

## Critical rules
- Never remove \`data-scamp-id\` attributes from any element.
- Never change the 4-char hex suffix of a class name (e.g. the \`a1b2\`
  in \`hero_card_a1b2\`) — it's the element's unique identifier.
- **Every \`data-scamp-id\` MUST be unique within the page.** When you
  duplicate or copy an element, generate a fresh random 4-char hex
  for the new one — never reuse an existing id. Each id ⇒ exactly
  one JSX element ⇒ exactly one CSS class block. Duplicate ids
  produce an invalid file: Scamp's parser keeps only the last
  occurrence of each id and silently drops the earlier ones, so the
  canvas and the file will visibly disagree.
- Never combine multiple selectors into one rule block
  (\`.a, .b { … }\` will be misread).
- Never nest \`@media\` inside a class rule — only the top-level form
  is parsed (see "Responsive breakpoints").
- One class = one rule block, always.
- \`data-scamp-id\` must always match the CSS class name exactly.
- Renaming an element? Change its class name in BOTH files in the SAME
  edit — the \`.tsx\` (\`className\` AND \`data-scamp-id\`) and the
  \`.module.css\` selector. (Scamp can recover a one-sided rename via the
  shared 4-char hex id, but only while that id is unchanged on both sides.)
- Put element states on the element's OWN class —
  \`.card_a1b2:hover { … }\` — which Scamp parses into an editable state. A
  cross-element interaction (\`.card_a1b2:hover .arrow_c3d4 { … }\`) is kept
  verbatim but is NOT editable on the canvas; keep any such block
  self-contained and valid (every declaration ends in \`;\`).

### Each rendered element needs its OWN unique class

A common mistake is to treat a className like a reusable "type"
or "component class" — defining \`.card\` once and reusing it on
ten sibling \`<div>\`s. **That does not work in Scamp.**

Every JSX element you render is a separate element on the
canvas, and every element needs its own unique
\`data-scamp-id\` + className pair, where the class name ends in
its own fresh 4-char hex suffix.

❌ WRONG — reusing one class across siblings, omitting
\`data-scamp-id\` on duplicates, and skipping the hex suffix:

\`\`\`tsx
<ul className={styles.card_list}>
  <li data-scamp-id="card_row" className={styles.card_row}>Scamp</li>
  <li className={styles.card_row}>Figma</li>
  <li className={styles.card_row}>Framer</li>
</ul>
\`\`\`

Scamp's parser sees one element here (the first \`<li>\`), drops
the rest, and the canvas will not match the file.

✅ RIGHT — every visible element gets its own id+class with a
unique hex suffix. If the rows share styles, write the rule
ONCE in CSS keyed off the parent (e.g. \`.card_list_x1y2 > li\`)
or just repeat the declarations in each block:

\`\`\`tsx
<ul data-scamp-id="card_list_x1y2" className={styles.card_list_x1y2}>
  <li data-scamp-id="card_row_a1b2" className={styles.card_row_a1b2}>Scamp</li>
  <li data-scamp-id="card_row_c3d4" className={styles.card_row_c3d4}>Figma</li>
  <li data-scamp-id="card_row_e5f6" className={styles.card_row_e5f6}>Framer</li>
</ul>
\`\`\`

The same applies to every level of nesting — buttons, list
items, repeated cards, table rows. If you'd render N copies on
the page, you need N unique class names, each with its own hex
suffix and its own \`data-scamp-id\`.

## File editing order — CSS first, then TSX

Scamp watches for file changes. When the TSX file is saved, Scamp
parses it and auto-scaffolds empty CSS class blocks for any new
\`data-scamp-id\` it finds whose class is NOT already in the CSS
module. If you write the TSX first, the auto-scaffold will land
*before* you write the matching styles.

**Always write or edit the CSS module file before the TSX file.**

1. Add / update styles in \`${v.pageCssPath}\`.
2. Then add / update markup in \`${v.pageTsxPath}\`.

When the TSX lands, every class is already present in the CSS so
the scaffolder is a no-op and your styles are untouched.

If you are making changes to both files, re-read the CSS file
after writing the TSX in case Scamp added a scaffold for an
element whose class wasn't in the CSS yet.

## Worked example — a sticky navbar

You want a navbar fixed to the top of the page with token-driven
colours and a circular brand badge.

Step 1: write the CSS (\`${v.exampleCssPath}\`):

\`\`\`css
.root {
}

.site_nav_n123 {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: blur(8px);
}

.brand_b001 {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-primary);
}
\`\`\`

Step 2: write the TSX (\`${v.exampleTsxPath}\`):

\`\`\`tsx
import styles from '${v.exampleCssImport}';

export default function Home() {
  return (
    <div data-scamp-id="root" className={styles.root}>
      <nav data-scamp-id="site_nav_n123" className={styles.site_nav_n123}>
        <div data-scamp-id="brand_b001" className={styles.brand_b001} />
      </nav>
    </div>
  );
}
\`\`\`

What Scamp does on save:
- Parses both files.
- Sees \`.site_nav_n123\` and \`.brand_b001\` already in the CSS — leaves
  them alone.
- Renders the navbar with \`position: fixed\`, the token-driven colours,
  the \`backdrop-filter\`, and the circular brand badge — all preserved
  byte-equivalent.

If you later change the brand background colour from the canvas
panel, Scamp surgically rewrites just the \`background\` line inside
\`.brand_b001\`. Everything else in the file stays put.

${v.structureSection}

${v.routesSection}## Page conventions
- Each page exports a single default React component.
- The root element uses \`styles.root\` and \`data-scamp-id="root"\`.
- Every other element needs both:
  - a \`data-scamp-id\` attribute matching the full CSS class name
  - a className following \`[prefix]_[4-char-hex-id]\`

### Element naming
The class name prefix identifies the element:

- **Default names:** \`rect_a1b2\` (container), \`text_c3d4\` (text)
- **Custom names:** \`hero_card_a1b2\`, \`sidebar_ff12\`, \`nav_links_e5f6\`

Custom names make the generated code more readable and help the user
identify elements in the layers panel. Use them when the element has
a clear semantic role. Rules:

- The prefix is lowercase, words separated by underscores.
- Only alphanumeric characters and underscores (no hyphens, no spaces).
- The last \`_XXXX\` segment is always a 4-character hex id — digits
  \`0-9\` and lowercase letters \`a-f\` only. Never \`g-z\`, never
  uppercase, never an incrementing counter. Never change an
  existing id.
  - ✅ \`_a1b2\`, \`_c3d4\`, \`_ff12\`, \`_e5f6\`, \`_b001\`, \`_c101\`
  - ❌ \`_n001\` (\`n\` not hex), \`_h003\`, \`_s002\`, \`_w005\`, \`_x004\`
- If the prefix is \`rect\` or \`text\`, scamp treats it as unnamed and
  infers the element type from the prefix. Any other prefix is a custom
  name, and scamp infers the type from the HTML tag instead.
- Custom names don't need to be unique — the hex suffix handles that.

When creating new elements, prefer descriptive names:

| Instead of        | Use                    |
|-------------------|------------------------|
| \`rect_a1b2\`       | \`hero_section_a1b2\`    |
| \`rect_c3d4\`       | \`sidebar_c3d4\`         |
| \`text_e5f6\`       | \`page_title_e5f6\`      |
| \`rect_g7h8\`       | \`nav_links_g7h8\`       |

- Do not add inline styles — all styles live in the CSS module.

## Scamp components (reusable UI)

A Scamp component is a folder under \`components/\` that any page can
drop an instance of. Edit it once and every instance updates. This is
what the user means by "components", "a kit", "a library", or
"reusable" — **make component folders, not a page full of examples.**
A page named \`components\` is not a component library: Scamp won't
list it in the Components sidebar and nothing can reuse what's on it.

Create one whenever a piece of UI will appear on more than one page,
or whenever the user asks for one. Scamp picks the folder up the
moment the files land — no registration, no \`scamp.config.json\` edit.

### Files

\`\`\`
components/
└── Card/
    ├── Card.tsx
    └── Card.module.css
\`\`\`

The name is PascalCase letters and digits only (\`Card\`, \`HeroCard\`,
\`Button2\`). It is the folder, the file, the function, and the JSX tag,
so it must be a valid identifier — no hyphens, no underscores.

A blank component is exactly this (\`scamp_get_component_scaffold\`
returns it for any name):

\`\`\`tsx
import styles from './Card.module.css';

type CardProps = {
  className?: string;
};

export default function Card({ className }: CardProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`} />
  );
}

export const _scamp = { contract: ${WRITTEN_CONTRACT}, events: [] } as const;
\`\`\`

\`\`\`css
.root {
  width: 100%;
  position: relative;
}
\`\`\`

The last statement of every component is the \`_scamp\` export: the
framework contract version the file was written for, and the names of
its event-handler props in props-type order (\`[]\` when it has none).
Scamp writes it on every save; copy it exactly, don't invent fields.

### Pages as views

A page's design can live as a view: \`views/<Name>/<Name>.tsx\` +
\`<Name>.module.css\`, in exactly the component file shape above (props
type, \`className\` passthrough, \`_scamp\` export). \`scamp_list_pages\`
reports such a page with \`kind: "view"\` and the view name; edit the
view. ${v.wrapperNote}
Never give a view root \`min-height: 100vh\`; the page shell owns full
height.

Inside, everything works as on a page: the root is \`data-scamp-id="root"\`
with the \`className\` passthrough shown above, every other element has
a matching \`data-scamp-id\` / \`className\` pair with a hex suffix, and
all styles live in the module. Ids only need to be unique within the
component. Never give a component root \`min-height: 100vh\` — it is
embedded in a page, not a page.

### Text props

A text element whose content should vary per instance becomes a prop.
Declare it as \`?: string\`, default it in the destructure, and reference
it in place of the literal:

\`\`\`tsx
type ButtonProps = {
  label?: string;
  className?: string;
};

export default function Button({ label = "Get started", className }: ButtonProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <span data-scamp-id="label_1a2b" className={styles.label_1a2b}>{label}</span>
    </div>
  );
}

export const _scamp = { contract: ${WRITTEN_CONTRACT}, events: [] } as const;
\`\`\`

Text that should never vary between instances stays a literal.

### Slots

To let a page pass whole elements in, add a \`React.ReactNode\` prop and
render it inside an otherwise-empty container. The default slot is
\`children\`; a named slot is any other name:

\`\`\`tsx
type CardProps = {
  children?: React.ReactNode;
  header?: React.ReactNode;
  className?: string;
};
…
<div data-scamp-id="body_3c4d" className={styles.body_3c4d}>{children}</div>
\`\`\`

A slot container has no children of its own.

### Data bindings

A view (or component) is presentational: it declares the data it needs
as props, renders sample data by default, and leaves the real values to
whoever renders it. **Compute in logic, bind in the view.** In a Scamp
framework project that logic is the route file under \`routes/\` — its
\`load()\` receives a \`LoadContext\` from \`scampjs/runtime\` and the
route passes the result in as props. Never fetch, branch on business
rules, or format data inside a view file.

There are five binding kinds, and these are the only forms Scamp reads
(any other expression is kept verbatim but is not editable on the
canvas):

| Kind | In the view | Prop |
|---|---|---|
| Text | \`<h2 …>{code}</h2>\` | \`code?: string\` |
| Attribute | \`href={url}\`; boolean: \`disabled={!canStart}\` | \`url?: string\`; \`canStart?: boolean\` |
| Event | \`onClick={onStart}\`; in a repeat: \`onClick={() => onCopy?.(player.id)}\` | \`onStart?: () => void\`; \`onCopy?: (id: string) => void\` |
| Repeat | \`{players.map((player) => (…))}\` around ONE element carrying \`key={player.id}\` | \`players?: Array<{ id: string; label: string }>\` |
| Show | \`{waiting && (…)}\` around one element | \`waiting?: boolean\` |

\`\`\`tsx
import styles from './Lobby.module.css';

type LobbyProps = {
  code?: string;
  players?: Array<{ id: string; label: string }>;
  waiting?: boolean;
  onStart?: () => void;
  className?: string;
};

export default function Lobby({
  code = "KZQ4",
  players = [
    { id: "1", label: "Player 1 · Alex" },
    { id: "2", label: "Player 2 · Bea" },
  ],
  waiting = true,
  onStart,
  className,
}: LobbyProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`}>
      <h2 data-scamp-id="code_e1d2" className={styles.code_e1d2}>{code}</h2>
      <ul data-scamp-id="list_e1e3" className={styles.list_e1e3}>
        {players.map((player) => (
          <li data-scamp-id="row_e1e4" className={styles.row_e1e4} key={player.id}>{player.label}</li>
        ))}
      </ul>
      {waiting && (
        <p data-scamp-id="note_e1f5" className={styles.note_e1f5}>Waiting for everyone to join</p>
      )}
      <button data-scamp-id="start_e1f9" className={styles.start_e1f9} type="button" onClick={onStart}>Start the game</button>
    </div>
  );
}

export const _scamp = { contract: ${WRITTEN_CONTRACT}, events: ['onStart'] } as const;
\`\`\`

The rules:

- Every prop is optional and defaulted in the destructure, and the
  default IS the sample data the canvas renders. Give a repeat two or
  three realistic rows with identical fields; a field types as
  \`number\` only when every row holds a number.
- Props are declared in document order (per element: show, repeat, the
  text prop, then bound attributes), then events, then slots, then
  \`className\` last. The destructure goes multi-line as soon as a
  repeat's rows are in it.
- Inside a repeat, text and attributes read the row — \`{player.label}\`,
  \`href={player.url}\` — and those are not props. \`key\` is the row's
  \`id\` unless another field is named.
- A repeat or show wraps exactly one element, on its own lines, at
  that element's indent. Never wrap the root.
- \`_scamp.events\` lists the event props in the same order as the type.
- \`scamp_get_view_props\` returns the exact props type and samples for
  any view or component — call it before writing code that renders
  one, so the object you pass matches.

A view imports nothing from \`scampjs\`: it is plain TSX plus a CSS
module and renders unchanged in any React or Preact project. Scamp
regenerates only the view's own two files.

### Variants

A component with several looks (an outline button, a small size, an
open menu) declares each **axis** as a prop typed as a union of string
literals, defaults it, and binds it on the root as \`data-<prop>\`:

\`\`\`tsx
type ButtonProps = {
  variant?: "default" | "outline";
  size?: "small" | "medium" | "large";
  className?: string;
};

export default function Button({ variant = "default", size = "medium", className }: ButtonProps) {
  return (
    <button data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`} type="button" data-variant={variant} data-size={size}>
      …
\`\`\`

Each non-default value is styled after every element's own rules, one
rule per element it changes. The root's is \`.root[data-<prop>="<value>"]\`;
any other element's is \`.root[data-<prop>="<value>"] .<class>\`.
\`:hover\`, \`:active\`, or \`:focus\` go on the last part:

\`\`\`css
.root[data-variant="outline"] {
  background: transparent;
}

.root[data-variant="outline"]:hover {
  background: var(--color-surface);
}

.root[data-size="small"] .label_c1a1 {
  font-size: 12px;
}
\`\`\`

- The default value has no rules: its look is the elements' own rules.
- Order the rules by axis, then value, as the union lists them.
- A look for two values together combines them on the root, one
  attribute per axis in the props type's order, after every single
  value's rules: \`.root[data-variant="outline"][data-size="small"] .label_c1a1\`.
  None of its values is a default.
- A variant rule inside \`@media\` is kept verbatim but can't be edited
  in Scamp.
- An element only some values show is hidden with \`display: none\` in
  the others. The structure is the same in every value.
- Values are lowercase, with hyphens. Every value a rule names must be
  in the union.
- A variant rule outranks the element's own \`:hover\` rule.

### Instancing on a page

Import the component (after the \`styles\` import; component imports
sorted alphabetically) and place a self-closing tag carrying
\`data-scamp-instance-id\`. The id is \`inst_\` plus a hex suffix, and prop
overrides are plain JSX attributes. A variant is picked the same way,
\`variant="outline"\`; leave it out for the default:

\`\`\`tsx
import styles from '${v.exampleCssImport}';
import Card from '@/components/Card/Card';

…
<Card data-scamp-instance-id="inst_a1b2" title="Pricing" />
\`\`\`

The page may size an instance — \`className={styles.inst_a1b2}\` with a
matching block holding width / height / margin only — and nothing
else. Never style a component's internals from a page; edit the
component. Default-slot content goes between the tags; named slots are
passed as \`header={<…/>}\`.

Showcase pages are welcome *in addition* — build them out of instances
so the showcase and the real site share one source.

## HTML tags
Use semantic HTML. Scamp captures the actual tag name and renders it
on the canvas, so the design preview matches what ships.

There are four element types, identified by the class-name prefix:

- **Text** (\`text_\` prefix or custom name) — any text-bearing tag:
  \`p\`, \`h1\`–\`h6\`, \`span\`, \`a\`, \`label\`, \`blockquote\`, \`pre\`,
  \`code\`, \`strong\`, \`em\`, \`small\`, \`time\`, \`figcaption\`, \`legend\`,
  \`li\`, \`button\`, \`th\`, \`td\`, \`caption\`. Default: \`p\`.
- **Container** (\`rect_\` prefix or custom name) — block-level tags:
  \`div\`, \`section\`, \`article\`, \`aside\`, \`main\`, \`header\`,
  \`footer\`, \`nav\`, \`figure\`, \`form\`, \`fieldset\`, \`ul\`, \`ol\`,
  \`li\`, \`details\`, \`summary\`, \`dialog\`, \`button\`, \`a\`, \`table\`,
  \`thead\`, \`tbody\`, \`tfoot\`, \`tr\`, \`th\`, \`td\`. Default: \`div\`.
- **Image / media** (\`img_\` prefix or custom name) — \`img\`, \`video\`,
  \`iframe\`, \`svg\`. Default: \`img\`.
- **Input / form control** (\`input_\` prefix or custom name) — \`input\`,
  \`textarea\`, \`select\`. Default: \`input\`.

\`<button>\`, \`<a>\`, \`<li>\`, \`<th>\`, and \`<td>\` are **dual-natured**.
A leaf holding only a text label (\`<button>Sign up</button>\`,
\`<a href="/">Home</a>\`) is a TEXT element: Scamp reads and edits its
label on the canvas like any other text. The SAME tag holding element
children (\`<button><svg …/><span …>Go</span></button>\`) is a
CONTAINER. Scamp decides automatically from the contents, so:

- A button or link that is just a label needs NO nested \`<span>\` —
  put the text directly inside (\`<button data-scamp-id="cta_a1b2"
  className={styles.cta_a1b2}>Sign up</button>\`) and it's
  canvas-editable. Give it a \`text_\` or custom prefix (not \`rect_\`).
- Only reach for children inside a button/link when it genuinely
  contains more than text (an icon plus a label). Then it's a
  container, and the label goes in its own text child.

Pick the tag that best describes the content. A page hero is a
\`<header>\`. A page title is an \`<h1>\`. A paragraph of body copy is
a \`<p>\`. The user will thank you (and so will their accessibility
audit).

### Text ALWAYS goes in a text element — never bare in a container

This is the single most common mistake, and it produces broken,
uneditable designs. **Read this carefully.**

A container (\`<div>\`, \`<section>\`, a \`rect_\` element) is for
layout. It is NOT a text element. If you write words directly
inside a container, Scamp cannot model them as an editable text
element — they collapse into a loose "Raw" fragment attached to the
parent. That fragment renders on the canvas but is NOT selectable,
NOT editable from the properties panel, and clutters the layers
panel. This is exactly the "fragment" problem that makes a design
unmanageable.

**Every run of visible text must be the CONTENT of a text element**
— a text-bearing tag (\`p\`, \`h1\`–\`h6\`, \`span\`, \`a\`, \`label\`,
\`blockquote\`, \`li\`, …) with its own \`data-scamp-id\` and its own
matching \`text_\`-prefixed (or custom-named) CSS class.

❌ WRONG — raw text sitting directly in a container. Scamp turns
"Welcome to Scamp" and "Draw, and it becomes code." into
uneditable Raw fragments:

\`\`\`tsx
<div data-scamp-id="hero_h1a2" className={styles.hero_h1a2}>
  Welcome to Scamp
  <div data-scamp-id="rect_c3d4" className={styles.rect_c3d4}>
    Draw, and it becomes code.
  </div>
</div>
\`\`\`

✅ RIGHT — the container holds text CHILDREN, each its own text
element with an id + class. Now every line is selectable and
editable on the canvas:

\`\`\`tsx
<div data-scamp-id="hero_h1a2" className={styles.hero_h1a2}>
  <h1 data-scamp-id="hero_title_t1a2" className={styles.hero_title_t1a2}>Welcome to Scamp</h1>
  <p data-scamp-id="hero_body_t3b4" className={styles.hero_body_t3b4}>Draw, and it becomes code.</p>
</div>
\`\`\`

Rules of thumb:

- A container's job is layout; it should contain child ELEMENTS,
  not bare words. If a \`<div>\` / \`<section>\` has text in it,
  that text belongs in a \`<p>\`, heading, or \`<span>\` child.
- A button or link that is just a text label IS itself a text-
  capable element — put the label directly inside the
  \`<button>\` / \`<a>\` (\`<button …>Sign up</button>\`). You don't
  need to nest a \`<span>\` for a plain label. But if a card is a
  \`<div>\` with a heading and a paragraph, those are two separate
  text children, never bare text in the div.
- The ONLY text you may leave bare inside an element is inline
  formatting WITHIN a text element — \`<strong>\`, \`<em>\`, \`<br>\`,
  \`<code>\` interleaved with the words of a \`<p>\` (see "Loose text
  and unclassed JSX" below). That is a text element containing
  inline markup, not a container containing raw text — the
  distinction that matters is whether the DIRECT parent of the
  words is a text element or a container.
- When in doubt: if you're about to type words as the direct child
  of a \`<div>\`, stop and wrap them in a \`<p>\` (or the right
  heading) with its own \`data-scamp-id\` + class first.

### Tag-specific attributes

Scamp preserves every attribute you write on an element verbatim through
round-trips, so feel free to add the attributes a real HTML tag needs:

- \`<a>\` — \`href\`, \`target\`
- \`<button>\` — \`type\` (\`button\` / \`submit\` / \`reset\`)
- \`<form>\` — \`method\` (\`get\` / \`post\`), \`action\`
- \`<label>\` — \`htmlFor\` (React's spelling of HTML's \`for\`)
- \`<time>\` — \`datetime\`
- \`<blockquote>\` — \`cite\`
- \`<dialog>\` — \`open\` (bare, no value)
- \`<video>\` — \`src\`, \`controls\`, \`autoplay\`, \`loop\`, \`muted\`
  (bare for booleans)
- \`<iframe>\` — \`src\`, \`title\`
- \`<input>\` — \`type\` (text/email/password/number/checkbox/radio/
  range/date/file), \`placeholder\`
- \`<textarea>\` — \`rows\`, \`placeholder\`

### Two tags with dedicated syntax

- **\`<select>\`** children must be \`<option value="x">Label</option>\`
  elements only — don't nest other canvas elements inside. Scamp
  manages options through a typed list rather than as nested children.
- **\`<svg>\`** inner markup is preserved byte-for-byte but NOT rendered
  on the canvas (svg shows as a placeholder rectangle). Edit the raw
  source through the Element section in the properties panel, or in
  the TSX file directly — either way round-trips cleanly.

${v.linkingSection}

${v.assetsSection}

## Tables

Tabular data — rows of records with aligned columns — is a real
\`<table>\`, never flex rows that imitate one. Two flex rows (a header and
a body row) each carrying \`flex-basis: 120px\` for the same column is the
mistake this section exists to prevent: every column width is written
twice, and nothing keeps the copies in step.

**Structure.** Write the shape a browser builds, or the exported page
moves your elements and the canvas won't match it:

\`\`\`
table
├── caption        (optional, first)
├── thead > tr > th
├── tbody > tr > td
└── tfoot > tr > td
\`\`\`

Rows go in a \`thead\`, \`tbody\`, or \`tfoot\` — not straight in the
\`table\`. Anything that isn't a cell goes inside a \`th\` or \`td\`.

**Columns are defined once, on the table.** The table is a grid, and its
\`grid-template-columns\` is the only place a column's width lives:

\`\`\`css
.patients_a1b2 {
  display: grid;
  grid-template-columns: 2fr 120px 100px;
}
\`\`\`

Scamp carries those columns to every section and row itself, with a
rule it derives and writes after the table's own:

\`\`\`css
:where(.patients_a1b2) > :where(thead, tbody, tfoot),
:where(.patients_a1b2) :where(tr) {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
}
\`\`\`

- **Never write \`display\`, \`subgrid\`, or \`grid-column\` on a section or
  row yourself.** The derived rule does it. A row's own class rule can
  stay empty.
- **Never give a \`th\` or \`td\` a \`width\`.** Its column sets it. A cell
  width fights the track and recreates the duplication tables exist to
  remove; the panel shows a cell's width as \`Column\` and won't edit it.
  Height, padding, and alignment are still the cell's own.
- **A cell spans columns with the \`colSpan\` attribute**
  (\`<td colSpan="2">\`), not with \`grid-column\`. Scamp derives the
  placement from the attribute.
- **No \`rowSpan\`.** Each \`<tr>\` is one row of the table's grid, so a cell
  can't reach into the next one. Restructure instead.

**Row and cell styling is set once, on the table**, not on every row or
cell. Scamp reads exactly these rules — this form, with these
selectors — as the table's settings, which the user edits under
**Rows and cells** in the panel. Write only the ones you need:

\`\`\`css
/* Cell padding and text alignment, every th and td */
.patients_a1b2 :where(th, td) {
  padding: 8px 12px;
  text-align: left;
}

/* A line under every row */
:where(.patients_a1b2) :where(tr) {
  border-bottom: 1px solid var(--color-border);
}

/* A background on every second body row */
:where(.patients_a1b2) > :where(tbody) > :where(tr:nth-child(even)),
:where(.patients_a1b2) > :where(tr:nth-child(even of tr)) {
  background-color: var(--color-neutral-50);
}

/* The header stays at the top while the page scrolls */
:where(.patients_a1b2) > :where(thead) {
  position: sticky;
  top: 0;
  z-index: 1;
}
\`\`\`

- Keep each body to exactly those declarations, in that order. Add
  anything else and Scamp still keeps the rule, verbatim, but the panel
  can't edit it.
- \`text-align\` takes \`left\`, \`center\`, or \`right\`. A divider is
  \`<px> <solid|dashed|dotted> <color>\`, in that order. Padding is px or
  \`var(--token)\` values.
- A row's or cell's own rule still wins, so style the exception there:
  the header row's background goes on the \`thead\`'s class, and one cell
  that needs more room gets its own \`padding\`.

After writing a table, call \`scamp_check_view\`: it reports elements in
the wrong place, cells with their own width, a \`rowSpan\`, and a divider
or padding repeated on every row or cell.

## CSS conventions

### Layout: flex first, always

**Use flexbox for layout unless the user explicitly asks for
something else.** This is the single most important layout rule in
Scamp. The canvas, the panel controls, and the round-trip parser are
all built around flex as the default container model.

- A container with multiple children should set
  \`display: flex\` on the parent. Pick \`flex-direction\` (row /
  column), \`gap\`, \`align-items\`, and \`justify-content\` to lay them
  out. Don't reach for grid or absolute positioning first.
- **CSS grid is allowed**, but reserve it for the specific cases
  flex can't express cleanly: 2D grids with both row AND column
  alignment constraints (e.g. a 4×3 photo grid), or templates with
  named areas. A simple two-column "image left, text right" layout
  is flex, not grid.
- **Absolute positioning is for special cases only** — overlays,
  toasts, fixed nav bars, decorative pseudo-elements (\`::before\` /
  \`::after\` badges). Never use \`position: absolute\` as your
  primary layout strategy for siblings inside a container; that's
  what flex is for. A row of cards is flex; an overlay on top of an
  image is absolute.
- **No \`float\`, no \`display: table\`, no inline-block hacks.** Flex (or
  grid when justified) covers every modern layout need. Tabular data is
  the exception: write a real \`<table>\`, laid out the way the Tables
  section describes, rather than rebuilding one from flex rows.
- Flex parents render correctly on the Scamp canvas AND are
  editable from the panel's Layout control. Grid and absolute
  layouts still render but expose fewer controls to the user.

When in doubt: \`display: flex\` plus \`flex-direction\` plus \`gap\`.

### Decorative layers must be \`position: absolute\`

A glow, gradient wash, blurred blob, or any other purely visual layer
inside a flex container **must** be taken out of flow:

\`\`\`css
/* ❌ wrong — an in-flow flex item. It is invisible, but it still
   occupies main-axis space and shoves the real content sideways. */
.hero_glow {
  width: 980px;
  height: 820px;
  background: radial-gradient(circle, rgba(160,140,255,.2), transparent 70%);
}

/* ✅ right — painted, but out of flow */
.hero_glow {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  width: 980px;
  height: 820px;
  background: radial-gradient(circle, rgba(160,140,255,.2), transparent 70%);
  pointer-events: none;
}
\`\`\`

The parent needs \`position: relative\` for the layer to anchor to it.

\`pointer-events: none\` stops it swallowing clicks, but it does **not**
remove it from layout — only \`position: absolute\` (or \`fixed\`) does.
This is the single most common way an agent-built hero ends up with its
content squashed and pushed to one side.

### A fixed-width sibling competes with a \`width: 100%\` one

In a flex row, \`width: 100%\` is a *starting size*, not a guarantee. A
sibling with a fixed width takes its share first and both shrink to fit:

\`\`\`css
.row   { display: flex; }
.fixed { width: 980px; }        /* takes ~half the row */
.fluid { width: 100%; max-width: 1160px; }   /* gets what's left */
\`\`\`

If you want the fluid child centred in the container, don't put a sized
sibling in flow next to it — make the sibling absolute, or wrap the
content so the decorative element is not a flex item.

### Other CSS rules

- One property per line.
- **Every declaration ends with a semicolon, including the last one
  in a block.** Browsers tolerate a missing trailing semicolon but
  Scamp's parser doesn't always — and worse, missing semicolons
  between declarations turn the whole block into one malformed
  declaration that the browser silently drops. Especially watch
  this in \`::before\` / \`::after\` rules, which are easy to write
  by hand without semis:
  \`\`\`css
  /* ❌ wrong — entire block fails to parse, no bullet renders */
  .item::before {
    content: "—"
    position: absolute
    left: 0
  }
  /* ✅ correct */
  .item::before {
    content: "—";
    position: absolute;
    left: 0;
  }
  \`\`\`
- Shorthand is fine (\`border: 1px solid #ccc\`, \`padding: 16px 24px\`).
- The page root is a regular rectangle in Scamp — it defaults to
  \`width: 100%\`, \`min-height: 100vh\`, and \`position: relative\` so the
  exported component fills any browser viewport and absolute children
  paint over a visible box. Scamp does NOT write the canvas viewport
  size (1440, 768, etc.) into \`.root\` — that's a design-tool
  preference stored separately in \`scamp.config.json\`. The canvas is
  a browser-window simulator (like Chrome DevTools' responsive mode);
  the deployed page is meant to work at any width. Don't re-introduce
  fixed pixel dimensions on \`.root\` unless the user specifically
  wants a fixed-width page.
- Width / height values:
  - \`width: 100%\` and \`height: 100%\` mean stretch to fill the parent.
  - \`width: fit-content\` and \`height: fit-content\` mean shrink to content.
  - \`width: auto\` / \`height: auto\` (or simply omitting the
    declaration) leaves the dimension up to normal CSS layout.
  - Pixel values (\`width: 320px\`) are explicit fixed sizes.
- Inside a flex parent, the flex layout engine takes over and
  positional declarations on the child are ignored. Same applies to
  grid children inside a grid container.
- For free-form containers (no flex / no grid), Scamp falls back to
  positioning children with \`position: absolute; left: Xpx; top: Ypx;\`.
  This is the FALLBACK, not the default — prefer flex (see Layout
  above). When you DO need absolute positioning (overlays, fixed
  nav), Scamp respects whatever \`position\` value you wrote
  (\`fixed\`, \`sticky\`, \`relative\`, \`absolute\`, \`static\`).
- **New text elements take their default font from the theme.** When
  you create a text element, set \`font-family: var(--font-sans);\` on
  its class so it inherits the project's default font. If the
  project doesn't declare \`--font-sans\` (an older project, or the
  user deleted it), fall back to the literal system stack:
  \`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"\`.
  The user can override per-element from the panel — your job is to
  pick the project's default at creation time, not to dictate.
- **New text elements default to \`width: fit-content\` and
  \`height: fit-content\`** so the box hugs the text. This way the
  user can change the font size and the box reflows automatically —
  no clipped descenders, no trapped whitespace. If the user later
  switches to a fixed width / height from the panel, that's their
  call; don't pre-emptively pin dimensions on text.
- **\`box-sizing: border-box\` is on by default** via a universal
  reset in \`theme.css\` (\`*, *::before, *::after\`). \`width: 100%\`
  plus \`padding\` works the way you'd expect — the padding sits
  inside the element's declared width, not outside it. Don't
  redeclare \`box-sizing\` per element; rely on the reset.

## CSS properties
Use any CSS property you'd use in a real stylesheet. Scamp renders
**every** valid CSS property on the canvas — there's no allow-list.

Internally Scamp routes a small set of properties (\`background\`,
\`border\`, \`border-radius\`, \`color\`, \`display\`, \`flex-direction\`,
\`flex-wrap\`, \`align-items\`, \`justify-content\`, \`align-content\`,
\`gap\`, \`row-gap\`, \`column-gap\`, \`width\`, \`height\`,
\`padding\`, \`margin\`, \`opacity\`, \`position\`, \`font-size\`,
\`font-weight\`, \`text-align\`, \`line-height\`, \`letter-spacing\`,
\`font-family\`, \`transition\`, \`box-shadow\`, \`filter\`,
\`backdrop-filter\`, \`transform\`, \`transform-origin\`,
\`mix-blend-mode\`, \`background-blend-mode\`, the grid container/item set, and the
flex-item set — \`flex\`, \`flex-grow\`, \`flex-shrink\`, \`flex-basis\`,
\`align-self\`, \`order\`) into
typed fields it can later expose via UI controls. Everything else
(\`clip-path\`, \`mask\`, \`isolation\`, gradients, \`@keyframes\`, …)
round-trips
through the file untouched AND is applied to the rendered element on
the canvas.

\`mix-blend-mode\` blends through to the page root by default.
Add \`isolation: isolate\` to a parent element to cap the blend at
that container — useful when you want a multiply-blended card
that doesn't bleed onto the page background. Scamp doesn't model
\`isolation\` as a typed field; it round-trips verbatim via
\`customProperties\` and renders natively on the canvas.

### Editability — prefer typed properties

Properties NOT in the typed-fields list above render correctly on
the canvas but the user can't adjust them from the panel — they'd
have to drop into code. Reach for the typed form when you have a
choice so the design stays tweakable from the canvas.

**Typography — avoid \`clamp()\`. Use a base value + named
breakpoint overrides.** Scamp's font-size control reads a single
number. \`clamp(min, preferred, max)\` is stored as a raw string and
the panel can't dial it. For responsive type, pick the desktop size
as the base and override at smaller widths (default Scamp
breakpoints: 768, 390):

\`\`\`css
.hero_title_a1b2 {
  font-size: 5.5rem;
}

@media (max-width: 768px) {
  .hero_title_a1b2 {
    font-size: 3.5rem;
  }
}

@media (max-width: 390px) {
  .hero_title_a1b2 {
    font-size: 2.5rem;
  }
}
\`\`\`

**Sizing — stick to px, rem, %, and Scamp's special modes.** Scamp's
size parser types \`Npx\`, percentages, \`auto\`, \`fit-content\`, and
the special \`100%\` / \`100vh\` modes. Other units — \`ch\`, \`em\`,
arbitrary \`vh\` / \`vw\` — are stored as raw values; the panel shows
the leading number but loses the unit when the user edits it. For
"limit a paragraph to ~52 characters of body text," write
\`max-width: 32rem\` instead of \`max-width: 52ch\`.

**Padding, margin, gap, border-radius, border-width — tokens are
first-class.** Scamp's shorthand parsers for these properties accept
plain px values AND \`var(--token)\` references, including mixed
forms across sides (\`padding: 16px var(--space-md) 16px var(--space-md)\`).
The panel's spacing controls round-trip both forms; tokens emit
verbatim into the saved CSS.

Other CSS units in these properties (\`rem\`, \`em\`, \`%\`, \`auto\`,
\`vh\`, \`vw\`, \`calc(...)\`) still fall into the passthrough bucket
and aren't editable from the panel — they render correctly but the
typed controls go blank. Stick to px or \`var(--token)\` if you want
the user to be able to tweak the value on canvas.

**Flex, on both sides.** The whole flex vocabulary is typed and
editable: on the parent, \`flex-direction\` (all four values),
\`flex-wrap\`, \`align-items\`, \`justify-content\`, \`align-content\`,
\`gap\` / \`row-gap\` / \`column-gap\`; on the child, \`flex-grow\`,
\`flex-shrink\`, \`flex-basis\`, \`align-self\`, \`order\`. The
\`flex\` shorthand is read on the way in (\`flex: 1 1 200px\`, \`flex:
none\`) and expanded; Scamp writes the longhands back.

- ✅ Parent: \`display: flex; flex-wrap: wrap; row-gap: var(--space-md);\`.
  Children: \`flex: 1 1 320px;\` — every field lands in the Size panel.
- Prefer a px, %, or \`var(--token)\` basis over \`calc(...)\`, which
  renders but shows as a bare string in the panel.
- \`flex-shrink: 0\` is how Scamp keeps a fixed-size child from being
  squashed; the panel shows it as **Don't shrink**. Setting a px size
  on a flex child's main axis adds it, and Fill / Hug / Auto removes it.
- \`flex: 1\` on a heightless child of a flex COLUMN means fill-height
  to Scamp — it maps to the Size panel's **Fill** on the height, not to
  the grow field. Write it when that's what you mean.

For "stretch this child to fill the row," the parent's default
\`align-items: stretch\` already does it — no per-child override.

**Vendor prefixes.** When a property needs a vendor prefix for
browser support (\`-webkit-backdrop-filter\` for Safari, etc.), write
both lines so the design renders on every browser:

\`\`\`css
.nav_a1b2 {
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}
\`\`\`

Scamp round-trips prefixed declarations verbatim through
\`customProperties\`.

**Lists — be explicit about markers.** \`<ul>\` / \`<ol>\` inherit
browser-default bullets. The reset block zeros their margin but not
\`list-style\`. Decide which you want and write it down:

- Keep markers: \`list-style: disc;\` (or \`decimal\` for \`<ol>\`) on
  the \`<ul>\` class. Explicit beats relying on browser defaults.
- Drop markers: \`list-style: none;\` on the \`<ul>\` class, then
  style each bullet on its own \`<li>\` class (padding +
  background-image, or an inline \`<svg>\` child). **Avoid \`> li::before\`
  compound selectors** — they render in the browser but aren't
  panel-editable, so the user can't tweak the bullet from the canvas.

\`var(--token)\` works anywhere a CSS value works, including inside
shorthand declarations like \`padding: var(--space-3) var(--space-5)\`.
Scamp resolves the variable at render time through \`${v.themeCss}\`.

\`:hover\`, \`:focus\`, and \`:active\` on an element's OWN class
(\`.card_a1b2:hover { … }\`) are parsed into editable per-state overrides —
tweakable from the panel. Other pseudo-selectors (\`:nth-child\`,
\`::before\`), descendant / combined forms (\`.a:hover .b { … }\`), and
at-rules other than \`@media (max-width: Npx)\` are preserved verbatim but
not parsed into the canvas model.

## Responsive breakpoints

Scamp writes per-breakpoint overrides as top-level \`@media
(max-width: Npx)\` blocks AT THE BOTTOM of the CSS module, AFTER every
base class rule. Each breakpoint has its own block containing one
class rule per element that overrides a property at that width:

\`\`\`css
.rect_a1b2 {
  width: 100%;
  padding: 24px;
}

.rect_c3d4 {
  background: #eee;
}

@media (max-width: 768px) {
  .rect_a1b2 {
    padding: 12px;
  }
}

@media (max-width: 390px) {
  .rect_a1b2 {
    padding: 8px;
  }
  .rect_c3d4 {
    width: 100%;
  }
}
\`\`\`

Rules for agents:

- **Only \`max-width\` queries are parsed.** \`min-width\`,
  \`prefers-color-scheme\`, \`orientation\`, and other query shapes are
  preserved verbatim but Scamp's canvas won't react to them.
- **Only pixel values are parsed.** \`max-width: 48rem\` won't be
  matched to a project breakpoint; use \`max-width: 768px\` etc.
- **The \`Npx\` value must match a breakpoint defined in the
  project.** Default breakpoints are 768 (tablet) and 390 (mobile).
  Unknown widths are preserved verbatim but treated as opaque.
- **Emit breakpoints widest-first** (tablet before mobile) so the CSS
  cascade picks the narrowest matching override.
- **Never nest \`@media\` inside a class rule** — only the top-level
  form above is parsed.
- **Desktop is the base.** Put desktop styles directly on the class,
  not inside a \`@media\` block.

## Per-element states (\`:hover\`, \`:active\`, \`:focus\`)

Scamp models three CSS pseudo-classes as first-class element states.
Style overrides for a state are written as a separate rule block
sharing the element's class name:

\`\`\`css
.rect_a1b2 {
  background: #ffffff;
  border-radius: 8px;
}

.rect_a1b2:hover {
  background: #f0f0f0;
}

.rect_a1b2:active {
  background: #e0e0e0;
}
\`\`\`

Rules for agents:

- **Emit state blocks immediately after the element's base block**,
  before any \`@media\` queries. Order: \`:hover\` → \`:active\` →
  \`:focus\`.
- **Only declare properties that differ from the base.** Scamp picks
  up the change as a state-specific override; redeclaring identical
  values just makes the file noisier.
- **Empty state blocks aren't allowed** — if an override has no
  declarations, omit the block entirely.
- **A transition declared on the base applies to all state changes
  automatically** (correct CSS behaviour). Don't add per-state
  \`transition\` declarations — Scamp doesn't model them.

### Other pseudo-classes are preserved verbatim

\`:focus-visible\`, \`:disabled\`, \`:checked\`, \`:nth-child(...)\`,
compound selectors like \`.rect_a1b2:hover .child\` — anything that
isn't one of the three recognised states — round-trip through Scamp
unchanged but aren't editable from the panel. Agents can write them
freely; Scamp preserves them text-stable.

## Animations

Scamp models the \`animation\` shorthand as a typed field on each
element. The shorthand emits and parses in the canonical order:

\`\`\`css
.rect_a1b2 {
  animation: fade-in-up 300ms ease forwards;
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
\`\`\`

Rules for agents:

- **\`@keyframes\` blocks live AFTER the per-element class blocks**
  but BEFORE any \`@media\` queries. Order: base classes → state
  pseudo-class blocks → custom selector blocks → \`@keyframes\` →
  \`@media\` → preserved-verbatim media blocks.
- **Preset names** Scamp's picker recognises: \`fade-in\`,
  \`fade-in-up\`, \`fade-in-down\`, \`slide-in-left\`,
  \`slide-in-right\`, \`scale-in\`, \`bounce-in\`, \`fade-out\`,
  \`fade-out-up\`, \`slide-out-left\`, \`slide-out-right\`,
  \`scale-out\`, \`pulse\`, \`shake\`, \`bounce\`, \`spin\`, \`ping\`,
  \`float\`, \`wiggle\`. Agents can use these names directly and
  Scamp will recognise them in the picker if the keyframes body
  matches the canonical version.
- **Custom-named animations** round-trip cleanly — Scamp marks them
  as "Custom" in the picker but doesn't touch them.
- **Multi-animation source** (\`animation: a 1s, b 2s\`) round-trips
  via the \`customProperties\` passthrough; the panel can't model the
  multi case but the value stays intact.
- **\`@keyframes\` blocks aren't auto-removed** when no element
  references them — Scamp leaves them on disk so agents can apply
  them later without reauthoring.

### Per-state animations

Animations work inside state blocks too:

\`\`\`css
.button:hover {
  animation: shake 500ms ease-in-out;
}
\`\`\`

CSS triggers the animation on hover-enter and **re-triggers it every
time the user re-enters hover** (the \`:hover\` declaration drops on
hover-leave). This is fine for one-shot motion (\`shake\`, \`pulse\`
once) but unusual for infinite loops — \`spin\` would reset on every
re-hover. For continuous loops, declare the animation on the base
state, not on \`:hover\`.

### Per-breakpoint animations

Per-breakpoint animations aren't typed — Scamp's picker only edits
the base and per-state animations. An agent-written
\`@media (max-width: 768px) { .foo { animation: spin 1s; } }\` block
round-trips verbatim but isn't editable from the panel.

## CSS Variables and Tokens

The project includes an \`${v.themeCss}\` file with two sections:

1. **Font imports** — optional \`@import url(...)\` lines at the top
   referencing Google Fonts (\`fonts.googleapis.com\`) or Adobe Fonts
   kits (\`use.typekit.net/<kit-id>.css\`). Scamp's Fonts panel
   manages these.
2. **Design tokens** — CSS custom properties inside \`:root\`.

\`\`\`css
/* scamp: font imports — managed by Project Settings → Fonts */
@import url("https://fonts.googleapis.com/css2?family=Inter&display=swap");

:root {
  --color-primary: #3b82f6;
  --color-text: #111111;
}
\`\`\`

${v.themeImportNote} Reference tokens in
module CSS files using \`var()\` — anywhere a CSS value goes,
including inside shorthands. Spacing and radius tokens aren't in a new
project, so this example declares them first:

\`\`\`css
/* ${v.themeCss} */
:root {
  --space-3: 12px;
  --space-5: 20px;
  --radius-md: 8px;
}

/* the module */
.button {
  background-color: var(--color-primary);
  color: var(--color-text);
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-md);
}
\`\`\`

**Reference only tokens that already exist in \`${v.themeCss}\`.** A
\`var(--…)\` reference to an undeclared token resolves to the
property's *initial* value — e.g. \`padding: var(--space-md)\`
becomes \`0\`, \`background: var(--color-card-bg)\` becomes transparent,
\`max-width: var(--max-width)\` becomes \`none\`. The layout collapses
and the page looks broken on the canvas.

**Before writing any module CSS, read \`${v.themeCss}\` and note what
tokens exist.** A fresh project ships colour and type tokens —
\`--color-primary\`, \`--color-text\`, \`--color-surface\`,
\`--color-border\`, \`--font-sans\`, a \`--text-*\` scale and so on —
but no spacing scale, radii, or max-width. Most real layouts need some
of those.

**When you need a token that doesn't exist yet, add it to
\`${v.themeCss}\` first, then reference it.** Adding tokens is fine
and expected. What's NOT OK:

- Referencing a token that isn't declared anywhere.
- Inlining raw hex / rgba / hsl literals in module CSS to skip the
  theme step. Use a token for any color or scale value, even
  one-off ones. Genuine single-use literals (a brand mark's exact
  hex, a specific illustration tint) can stay literal — flag with
  a comment when you do.

Example: a layout needs accent shadows. Add
\`--shadow-card: 0 16px 40px rgba(0, 0, 0, 0.08);\` to \`${v.themeCss}\`,
then write \`box-shadow: var(--shadow-card);\` in the module file.

Do NOT change or remove existing token values without the user
asking — that's a design-system overhaul, not a layout edit.

## Design system

See \`DESIGN.md\` in the project root for the design system: brand
guidelines, design principles, and token usage guidance. It follows the
google-labs-code/design.md specification — YAML front matter holds exact
token values (auto-generated from \`theme.css\`), markdown prose holds
rationale and usage notes. Scamp regenerates the YAML from \`theme.css\`,
so don't hand-edit the front matter (it will be overwritten); the prose
sections round-trip and are yours to write.

## Project config

\`scamp.config.json\` at the project root holds per-project settings
like the artboard background colour and breakpoint table. Scamp
reads and writes this file; don't modify it unless the user asks.

${v.previewSection}

## Snapshot history

Scamp saves snapshots of the project in a \`.scamp/\` folder.
Do not modify or delete anything inside \`.scamp/\`.
Do not add \`.scamp/\` to version control — it is already in \`.gitignore\`,
except \`.scamp/agent-history/\`, the Scamp Agent's conversations, which
are shared with the project.

${v.doNotChangeSection}
`;


/** The Next.js App Router layout. Frozen — see docs/notes/nextjs-sunset.md. */
const NEXT_LAYOUT: LayoutVocabulary = {
  layoutParagraph: NEXT_LAYOUT_PARAGRAPH,
  wrapperNote: NEXT_WRAPPER_NOTE,
  pageCssPath: 'app/[page]/page.module.css',
  pageTsxPath: 'app/[page]/page.tsx',
  exampleCssPath: 'app/page.module.css',
  exampleTsxPath: 'app/page.tsx',
  exampleCssImport: './page.module.css',
  themeCss: 'app/theme.css',
  themeImportNote: `\`app/theme.css\` is imported from \`app/layout.tsx\` so the tokens
apply to every page when running \`next dev\`.`,
  routesSection: '',
  structureSection: `## Project structure

This is a Next.js App Router project:

- **Root / Home page**: \`app/page.tsx\` and \`app/page.module.css\`.
- **Additional pages**: \`app/[page-name]/page.tsx\` and
  \`app/[page-name]/page.module.css\` (one folder per page).
- **Components**: \`components/[Name]/[Name].tsx\` and
  \`components/[Name]/[Name].module.css\` (one folder per reusable
  component — see "Scamp components").
- **Shared root layout**: \`app/layout.tsx\` — do not modify. The
  auto-generated layout sets \`<body style={{ margin: 0, minHeight:
  '100vh' }}>\` so the design isn't pushed off-axis by the browser's
  default body margin and the body fills the viewport in any browser.
- **Design tokens**: \`app/theme.css\` — imported from \`app/layout.tsx\`,
  defines the project's CSS custom properties.
- **Next.js config**: \`next.config.ts\` — do not modify.
- **Package manifest**: \`package.json\` — do not modify (Scamp pins
  the Next.js / React versions it expects).
- **Per-project Scamp settings**: \`scamp.config.json\` — do not modify.
- **Static assets**: \`public/assets/\`. Next.js serves the \`public/\`
  directory at the URL root, so \`public/assets/hero.png\` is
  accessible at \`/assets/hero.png\`.

Do not move, rename, or restructure these files.
Each page exports a single default React component.
All styles live in the co-located CSS Modules file.`,
  linkingSection: `### Linking between pages

Use absolute paths matching the page slug for internal links — Next.js
App Router routes are absolute, not relative:

- Home page → \`href="/"\`
- A page at \`app/about/page.tsx\` → \`href="/about"\`
- A page at \`app/checkout-flow/page.tsx\` → \`href="/checkout-flow"\`

Plain \`<a href="/<slug>">\` triggers a normal browser navigation. Both
in \`next dev\` and a production build, this works without any
special component (no \`next/link\` import required). Subpaths,
fragments, and query strings (\`/about/team#contact\`,
\`/about?tab=members\`) round-trip cleanly.

For external links use a full URL (\`href="https://example.com"\`) and
add \`target="_blank"\` plus \`rel="noopener noreferrer"\` when the
link should open in a new tab. Inside Scamp's preview window,
external links are routed to the user's system browser
automatically — the preview is scoped to the project.

When a user renames a page, Scamp rewrites every matching
\`href="/<old-slug>"\` (including subpath / query / fragment forms)
across every page in the project. So the canonical href shape is
the load-bearing convention here — keep it consistent.`,
  assetsSection: `## Images and static assets

Static assets (images, SVGs, fonts) live in \`public/assets/\`. Next.js
serves the \`public/\` directory at the URL root, so a file at
\`public/assets/hero.png\` is accessible at \`/assets/hero.png\`.

CSS background image references use the absolute root path:

\`\`\`css
background-image: url('/assets/hero.png');
\`\`\`

TSX \`<img>\` elements reference the same path:

\`\`\`tsx
<img src="/assets/hero.png" alt="" />
\`\`\`

Always place new images in \`public/assets/\` and reference them with
the leading-slash form. Do not delete files from \`public/assets/\`
unless the user asks.`,
  previewSection: `## Preview mode

The user can press ⌘P (or click "Preview" in the toolbar) to open
the project in a real Next.js dev server in a separate window.
Scamp runs \`npm install\` automatically on first open, then spawns
\`next dev\` and renders the live URL inside an embedded webview.

Implications for agents:

- The \`package.json\` and \`next.config.ts\` files are essential
  for preview to work. Don't delete them; don't change the
  \`scripts.dev\` entry that Scamp invokes.
- Animations, transitions, and \`:hover\` / \`:active\` / \`:focus\`
  states only run in preview mode (the static canvas doesn't fire
  hover events). When you're testing motion or interactivity, the
  user is most likely viewing it in preview.
- The reserved filename \`[page-name].data.json\` (e.g.
  \`page.data.json\` next to \`app/about/page.tsx\`) is set aside
  for a future feature that injects mock data as page props during
  preview. Don't repurpose this name for unrelated files.`,
  doNotChangeSection: `## What NOT to change
- Do not alter the import line at the top of any \`page.tsx\` file.
- Do not rename the default export function in any \`page.tsx\`.
- Do not modify \`app/layout.tsx\` — the root layout is part of the
  Next.js scaffold.
- Do not modify \`next.config.ts\` or \`package.json\` — these are
  Scamp-managed scaffold files.
- Do not add new \`page.tsx\` / \`page.module.css\` files unless the
  user asks for a new page (Scamp creates the folder for you).
- Do not strip \`position: relative\` from \`.root\` — absolute-
  positioned children rely on it to anchor to the page root.
- Do not delete \`app/theme.css\` — it holds the project's design
  tokens and font imports and is imported from the root layout.
- Do not delete \`scamp.config.json\` — it holds per-project settings.
- Do not combine multiple selectors into one rule block.
- Do not nest \`@media\` inside a class rule.`,
};

/** The Scamp framework (`scampjs`) layout. */
const SCAMP_LAYOUT: LayoutVocabulary = {
  layoutParagraph: SCAMP_LAYOUT_PARAGRAPH,
  wrapperNote: SCAMP_WRAPPER_NOTE,
  pageCssPath: 'views/<Name>/<Name>.module.css',
  pageTsxPath: 'views/<Name>/<Name>.tsx',
  exampleCssPath: 'views/Home/Home.module.css',
  exampleTsxPath: 'views/Home/Home.tsx',
  exampleCssImport: './Home.module.css',
  themeCss: 'design/theme.css',
  themeImportNote: `\`design/theme.css\` is injected into every page's document shell by
the framework, so the tokens apply everywhere.`,
  structureSection: `## Project structure

This is a Scamp framework project (\`scampjs\`):

- **A page's design**: \`views/<Name>/<Name>.tsx\` and
  \`views/<Name>/<Name>.module.css\` (one folder per page). Scamp owns
  and regenerates these — a page IS its view.
- **Components**: \`components/<Name>/<Name>.tsx\` and
  \`components/<Name>/<Name>.module.css\` (one folder per reusable
  component — see "Scamp components").
- **Routing and data**: \`routes/\` — YOURS. A route file loads data and
  renders a view; \`routes/api/\` holds API handlers. Scamp lists these
  and writes only a \`render\` export or a generated route; it never
  regenerates anything there. See "Route files".
- **Design tokens**: \`design/theme.css\` — the framework injects it into
  every page's document shell.
- **Design system**: \`design/DESIGN.md\` — the token values plus the
  prose explaining them. See "Design system".
- **Local env values**: \`.dev.vars\` — \`KEY=value\` per line, read as
  \`env\` in \`load()\` and API handlers. Gitignored; never commit it.
- **Env types**: \`scamp-env.d.ts\` — yours; augments \`Env\`.
- **Package manifest**: \`package.json\` — do not modify (Scamp pins the
  \`scampjs\` version it expects).
- **Per-project Scamp settings**: \`scamp.config.json\` — do not modify.
- **Static assets**: \`public/\`, served at the URL root — see "Images
  and static assets".

There is no \`app/\` folder, no \`layout.tsx\`, and no wrapper pages: the
framework owns the document shell. Do not move, rename, or restructure
these files. Each view exports a single default React component, and
all of its styles live in the co-located CSS Module.`,
  routesSection: `## Route files

A route file is yours — Scamp never regenerates one. It lives anywhere
under \`routes/\`, and its path is the URL: \`routes/index.tsx\` is \`/\`,
\`routes/about.tsx\` is \`/about\`, \`routes/products/[slug].tsx\` is
\`/products/<slug>\`. \`[...rest]\` catches the remainder, and a
\`(group)\` folder adds no segment. \`scamp_list_routes\` prints the whole
table — call it rather than guessing a URL.

A route imports its view, loads the data, and passes it in:

\`\`\`tsx
import type { LoadContext, RouteProps } from 'scampjs/runtime';
import Product from '@/views/Product/Product';
import { findProduct, formatPrice } from '@/lib/products';

export const render = 'static';

export function params() {
  return [{ slug: 'essential-tee' }];
}

export async function load({ params }: LoadContext<{ slug: string }>) {
  const product = findProduct(params.slug);
  return { name: product.name, price: formatPrice(product.price) };
}

export default function ProductRoute({ data }: RouteProps<typeof load>) {
  return <Product {...data} />;
}
\`\`\`

| Export | Required | What it does |
|---|---|---|
| \`default\` | yes | Renders the view. Receives \`{ params, data }\`. |
| \`load\` | no | Runs on the server or at build time; what it returns is \`data\`. |
| \`render\` | no | \`'static'\` (the default), \`'server'\`, or \`'client'\`. |
| \`params\` | no | A static route with \`load()\` prerenders one page per entry. |

\`load()\` receives \`{ params, request, env }\` and nothing else — never a
Hono context, and a route file imports nothing from Hono.

**Compute in logic, bind in the view.** Formatting, arithmetic, and
mapping a record onto a view's props all happen here: a view is
presentational and renders its sample data by default. Call
\`scamp_get_view_props\` for the exact shape a view expects before
writing the object you pass it.

**Generate route** in Scamp writes \`routes/<slug>.tsx\` for a view that
nothing renders yet, with \`load()\` returning the view's sample data.
Replace the samples with real data and keep the shape.

`,
  linkingSection: `### Linking between pages

Internal links are absolute paths. The URL is whatever route renders
the view — \`routes/index.tsx\` is \`/\`, \`routes/about.tsx\` is \`/about\`,
\`routes/products/[slug].tsx\` is \`/products/<slug>\`. \`scamp_list_routes\`
prints every route with its URL.

Plain \`<a href="/about">\` triggers a normal browser navigation and
needs no special component or import. Subpaths, fragments, and query
strings (\`/about/team#contact\`, \`/about?tab=members\`) round-trip
cleanly.

For external links use a full URL (\`href="https://example.com"\`) and
add \`target="_blank"\` plus \`rel="noopener noreferrer"\` when the
link should open in a new tab. Inside Scamp's preview window,
external links are routed to the user's system browser
automatically — the preview is scoped to the project.

When a user renames a page, Scamp rewrites every matching
\`href="/<old-slug>"\` (including subpath / query / fragment forms)
across every page in the project, and moves the route that renders it.
So the canonical href shape is the load-bearing convention here —
keep it consistent.`,
  assetsSection: `## Images and static assets

Static files (images, SVGs, fonts) live in \`public/\`. It is served at
the URL root by both \`scamp dev\` and a build, so a file at
\`public/assets/hero.png\` is reachable at \`/assets/hero.png\`.

CSS background image references use the absolute root path:

\`\`\`css
background-image: url('/assets/hero.png');
\`\`\`

TSX \`<img>\` elements reference the same path:

\`\`\`tsx
<img src="/assets/hero.png" alt="" />
\`\`\`

Always place new images in \`public/\` and reference them with the
leading-slash form. Do not delete files from \`public/\` unless the
user asks.

**An image whose source is data binds like any other attribute.**
\`src={photo}\` from a prop, or \`src={product.image}\` inside a repeat —
and the default in the destructure is the sample the canvas draws. See
"Data bindings"; \`alt\` binds the same way. A remote URL works, but it
only renders on the canvas while the machine is online, so prefer a
file in \`public/\` for anything the design depends on.`,
  previewSection: `## Preview mode

The user can press ⌘P (or click "Preview" in the toolbar) to open the
project in the framework's dev server in a separate window. Scamp runs
\`npm install\` automatically on first open, then spawns \`scamp dev\`
and renders the live URL inside an embedded webview.

Implications for agents:

- \`package.json\` is essential for preview to work. Don't delete it;
  don't change the \`scripts.dev\` entry that Scamp invokes.
- Preview runs the real routes, so it shows the data \`load()\` returns.
  The canvas shows the view's sample data instead. A view that looks
  empty on the canvas but full in preview needs better defaults in its
  destructure — not a fix to the route.
- Animations, transitions, and \`:hover\` / \`:active\` / \`:focus\`
  states only run in preview (the static canvas doesn't fire hover
  events). When you're testing motion or interactivity, the user is
  most likely viewing it in preview.`,
  doNotChangeSection: `## What NOT to change
- Do not change a view's file shape: the props type above the
  component, the \`className\` passthrough on the root, and the
  \`_scamp\` export at the bottom are contract, not style.
- Do not modify \`package.json\` — Scamp pins the \`scampjs\` version it
  expects.
- Do not add view folders by hand unless the user asks for a new page
  (Scamp creates the folder, and the route that renders it, for you).
- Do not strip \`position: relative\` from \`.root\` — absolute-
  positioned children rely on it to anchor to the view root.
- Do not give a view root \`min-height: 100vh\` — the page shell owns
  full height.
- Do not delete \`design/theme.css\` — it holds the project's design
  tokens and font imports, and the framework injects it into every
  page.
- Do not delete \`scamp.config.json\` — it holds per-project settings.
- Do not commit \`.dev.vars\` — it holds local values for \`env\`.
- Do not combine multiple selectors into one rule block.
- Do not nest \`@media\` inside a class rule.`,
};

/** The Next.js App Router variant. Frozen — see docs/notes/nextjs-sunset.md. */
export const AGENT_MD_CONTENT = buildAgentMd(NEXT_LAYOUT);

/** The Scamp-framework variant: same conventions, its own layout. */
export const AGENT_MD_CONTENT_SCAMP = buildAgentMd(SCAMP_LAYOUT);

/**
 * Sections a recipe appended to the project's agent.md, under
 * `<!-- scamp:recipe:<name> -->` markers (scampjs CONTRACT.md section
 * 3.2). The app regenerates agent.md on every open; these are the
 * framework's, and survive the regeneration verbatim.
 */
export const recipeSectionsOf = (agentMd: string): string => {
  const index = agentMd.search(/<!-- scamp:recipe:[^>]+ -->/);
  return index === -1 ? '' : agentMd.slice(index).replace(/\s*$/, '\n');
};

/** The managed template plus whatever recipe sections the existing file carries. */
export const withRecipeSections = (template: string, existing: string | null): string => {
  const sections = existing === null ? '' : recipeSectionsOf(existing);
  return sections === '' ? template : `${template.replace(/\s*$/, '\n')}\n${sections}`;
};
