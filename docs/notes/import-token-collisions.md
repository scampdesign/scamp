# A second import painted in the first one's colours

## What was seen

"The layout is very close, however the colors are all off."

`/home/angie-hemans/Documents/scamp-files/website-import` had ten views
imported from several different sites. Its Gainwix view referenced
`var(--color-text-imported)` **51 times**, and the theme declared:

```css
--color-text-imported: #9db0cc;        /* a light blue-grey */
--color-background-imported: #16171b;  /* near-black */
```

Gainwix's own colours, measured from the live page, are `#13111c` text on
a `#fafafc` background — near-black on near-white. The view was painted in
**another site's palette, inverted**.

## Why

The import lifts repeated colours into theme tokens named by role, and
renames on collision so it never redefines a token the project already
holds. The rename used one fixed suffix:

```ts
const renamed = tokens.map((t) => {
  const held = existing.get(t.name);
  if (held === undefined || held === t.value) return t;
  return { ...t, name: `${t.name}-imported` };   // ← always this
});
```

That suffix is unique against the template's palette and **not against
itself**:

1. Import site A. `--color-text` collides with the template's, so A's
   text colour is written as `--color-text-imported: #9db0cc`.
2. Import site B into the same project. `--color-text` collides again, so
   B is renamed to `--color-text-imported` — a name that now exists.
3. B's elements are rewritten to `var(--color-text-imported)`.
4. The write filter is `renamed.filter((t) => !existing.has(t.name))`,
   and `--color-text-imported` **is** in existing — so B's value is never
   written.

B ends up referencing A's colour, in every declaration the token covers.
The more sites in a project, the worse it gets, and it is silent: the
files are valid, every reference resolves, the colours are simply
someone else's.

## The fix

`resolveTokenNames` in `src/renderer/lib/importTokens.ts` — pure, and
tested. The suffix escalates: `-imported`, `-imported-2`, `-imported-3`,
until a name is free **or** holds this exact value. It also claims names
as it goes, so two tokens within one import cannot collide either.

Reuse still works, and that is the part worth keeping: a name holding the
same value is returned unchanged, so re-importing one site references the
tokens it made the first time rather than growing a second identical
palette.

## Why the harnesses did not catch it

None of the three could. `import-fidelity.mjs` and `import-pixels.mjs`
stop at `generateCode` and render against a theme built from the extracted
tokens directly. `canvas-oracle.mjs` writes into a **fresh** project whose
theme is the template's — so its first and only import never collides with
a previous one.

Every harness imports ONE site into a CLEAN project. The bug needs two
sites and one project, which is what a person does and no harness did.
Worth remembering the next time a harness reports everything is fine.

## Existing projects are not repaired by this

The wrong references are already written into each view's CSS module, and
nothing in the fix rewrites them. A view imported before this change keeps
pointing at whatever `--color-*-imported` holds now.

To repair one: re-import the page. To repair by hand: find the token
values the view should have had (re-import to a scratch project and read
its theme) and rename the references in that view's `.module.css`.
