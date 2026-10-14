# View bindings — the model-to-file mapping

How a view's (or component's) bindings are stored on `ScampElement` and
written to the file, and how the parser reads them back. The contract
is `CONTRACT.md` in the scampjs repo (section 1.3); this is the app's
side of it. see docs/archive/2026-09-16-framework-phase-1-plan.md, step 3.

## Five kinds, and where each lives

| Kind | On the element | Sample lives | Emitted as |
|---|---|---|---|
| Text | `prop: 'code'` (a text element) | `el.text` | `{code}` |
| Attribute | `bind: { href: 'url' }` | `el.attributes.href` (instances: `propOverrides.label`; an `<img>`'s src/alt: `el.src` / `el.alt`) | `href={url}` |
| Boolean attribute | `bind: { disabled: '!canStart' }` | presence of `el.attributes.disabled` | `disabled={!canStart}` |
| Event | `on: { onClick: 'onStart' }` | none | `onClick={onStart}` |
| Repeat | `repeat: { over: 'players', as: 'player', key? }` on the repeated element | `root.samples.players` (rows) | `{players.map((player) => (…))}` + `key={player.id}` |
| Show | `showIf: 'waiting'` on the shown element | `root.samples.waiting` | `{waiting && (…)}` |

### `src` and `alt` are the exception to "the sample is in the bag"

A real `<img>` keeps `src` and `alt` in typed fields rather than in
`attributes`, so every reader and writer of a bound attribute's sample
has to ask where it lives. `hasTypedSrcAlt` / `attributeSample` /
`withAttributeSample` in `lib/element/types.ts` are that question asked
once; use them rather than reaching for `el.attributes[attr]` directly.
Other image-family tags (video, iframe, svg) keep theirs in the bag —
`alt` is invalid on them and `src` has tag-specific semantics.

This is load-bearing because the parser has to decode the binding
BEFORE lifting the value into the typed field. It used to do the
opposite: `src` and `alt` went into `skipAttrs`, never reached
`decodeBinding`, and `src={photo.src}` parsed to the literal string
`"__scamp_bind__:photo.src"` — which the canvas rendered as a dead URL
and the generator wrote back into the TSX, destroying the binding on
the next save. The generator emitted the sample AND the binding, so the
file also carried a duplicate `src` attribute. Round-trip cases for a
prop-bound and a row-bound image live in `test/viewBindings.test.ts`.

Inside a repeat, text and attribute bindings may be **row paths**
(`prop: 'player.label'`, `bind: { url: 'player.url' }`); those are not
props and carry no sample of their own — the rows on the root are the
sample. An event inside a repeat emits `onClick={() => onCopy?.(player.id)}`
and types as `(id: string) => void`, named after the key field.

`repeat.key` is stored only when it isn't `id`: the generator writes
`key={row.id}` by default, and the parser drops a parsed `id` back to
absent, so a hand-written file and its regeneration parse the same.

Show wraps repeat when both are on one element. The Data tab keeps them
on separate elements in practice.

## The props type

`lib/viewProps.ts` walks the tree and returns the props in contract
order: every non-event prop in document order (per element: show,
repeat, the text prop, then bound attributes in binding order), then
events, then slots; the generator appends `className`. Types: `string`,
`boolean` (boolean attributes and show flags), `Array<{ … }>` from the
sample rows (a field is `number` when every row holds a number),
`() => void` / `(<key>: string) => void`, `React.ReactNode`. The
destructure carries the defaults, and goes multi-line as soon as a
repeat's rows are in it. `_scamp.events` is the event list in that
order. `propsTypeSource` formats the type text; the generator and the
MCP tool `scamp_get_view_props` (`getViewProps` in `canvasSnapshot.ts`,
answered from the store's component trees, by name or route slug) both
use it, so an agent reads exactly what the file declares.

## Parsing

`parseCode/bindings.ts` runs after the named-slot hoist and before the
structural parse:

- `attr={expr}` on a Scamp element or instance becomes
  `attr="__scamp_bind__:expr"` so the tokenizer keeps it whole; JSX
  values (`{<…>}`), `className={styles.x}`, and expressions holding a
  brace or quote are left alone. `readBindings` in `tsx.ts` decodes the
  marker into `bind` / `on`, a `key={row.field}` into the repeat key, and
  anything else back to a verbatim `{expr}` attribute value (which the
  generator writes unquoted).
- The wrappers become pseudo-tags — `{list.map((row) => (` →
  `<scamp-repeat over="list" as="row">`, `{flag && (` →
  `<scamp-show if="flag">` — matched to their closers by line and
  indent, which the generator fixes. The structural parse attaches a
  pending wrapper to the next real element it opens.

Both rewrites report where they moved things. Each pass returns its
text plus a `SourceMap` (`lib/sourceMap.ts`), `parseCode` composes
them, and the structural parse's per-element offsets come back out as
positions in the file as written rather than in the rewritten text.
That is what lets a save edit one element in place; without it every
offset the tokenizer reports is meaningless outside the hoisted copy.
see docs/plans/incremental-writes-plan.md, phase 5

`parsePropsDefaults` reads the destructure brace-aware: strings,
booleans, and arrays of flat rows. The post-pass in `index.ts` then
writes each bound attribute's default back into the literal's place,
hydrates `{row.field}` text as a row-path prop (with no text), and puts
show flags and repeat rows on the root as `samples`.

## What the canvas does

`lib/bindingEval.ts` resolves references against the root's samples and
the current row: a row path reads the row, anything else reads the
samples, `.length` works on rows, and `!` inverts. `resolveAttr` does
the same for a row-bound attribute, and returns undefined when the
attribute is unbound or bound to a prop — in both of those cases the
sample on the element is already the value. A flag with no
sample reads as true (the props type's default), so `!flag` hides.

Both render paths — `ElementRenderer` for pages, components, and views,
and `renderComponentSubtree` for instances on a page — expand a
parent's children through `expandChildren`: a hidden child is dropped,
a repeated child renders once per sample row with that row in scope,
everything else inherits the row. A row-bound text resolves from the
row and isn't an editable prop; a row-bound instance prop resolves
into the instance's overrides. A prop-bound attribute needs no
evaluation — the literal sample on the element is the value — but a
ROW-bound one does, through `resolveAttr`; `ElementRenderer` calls it
for an `<img>`'s src and alt before falling back to the sample. Events
render nothing.

Copies of a repeated element beyond the first carry no
`data-element-id` and no ref, so hit-testing, selection, and
measurement land on the first copy. A parent subscribes to a key of its
children's show and repeat bindings (`childBindingKey`) rather than to
the whole element map.

The parity fixture `binding-repeat-and-show` proves the canvas against
a browser rendering the same defaults.

## The Data tab

`DataBindings.tsx` adds four sections under the existing Text and Slots
rows: **Repeat** (the list name, the row variable, the key, and the
sample rows as an editable table with add-row and add-field), **Show**
(the flag name and its sample checkbox), **Attributes** (Locked / Prop
per typed or present attribute, with an *inverted* checkbox on boolean
attributes), and **Events** (None / Prop per supported event: `onClick`
on buttons and links, `onChange` on inputs, `onSubmit` on forms). Repeat
and show start from the element's right-click menu — **Repeat this…**
and **Show only when…** — which seed a list of one row or a flag set to
true. Inside a repeat, a text prop or a bound attribute may be a row
field (`item.label`). Every edit goes through the `bindings` store
slice, which also keeps the root's samples in step and renames a prop
everywhere at once.
