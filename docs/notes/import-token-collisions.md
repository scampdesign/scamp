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

## The fix, and then the better fix

**First**, `resolveTokenNames` made the suffix escalate — `-imported`,
`-imported-2`, and on — until a name was free or held that exact value.
That closed the collision.

**Then the feature was removed entirely.** Escalating suffixes fix the
symptom and leave the cause: an importer was choosing which values a
project should share, by counting how often they repeated. A design
system is a set of decisions about what SHOULD be shared, and occurrence
counting cannot make those — it produces a theme nobody chose, named for
roles it inferred, in a file the user now owns.

The import writes literal values. Turning any of them into tokens is the
user's call, made afterwards against a design they can see. The
collision cannot happen because there is nothing to collide.

`importTokens.ts` and its 29 tests are deleted; both are in git history
if a user-triggered "lift these into tokens" action ever wants them, and
that action would want different ergonomics anyway — a selection, a
preview, and names the user picks.

**Fidelity is unchanged.** gainwix stayed at 93.42% across the removal,
which is the expected result: `var(--color-x)` resolving to a value and
the literal value render identically.

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
