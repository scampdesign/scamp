# A variable font the import renders too wide

## What was seen

Every heading on an imported page wrapped one line earlier than on the
page it came from. The geometry harness reported it precisely: 24
offenders on `scamp.club`, **all of them height-only**, each exactly one
line taller than its source.

```
headline_0038  <h2>  414x126 → 415x189    2 lines → 3
headline_00d2  <h2>  471x63  → 472x126    1 line  → 2
```

The box widths matched to within a pixel, so it was not layout. The
glyphs were wider.

## Why

`googleFontsUrlFor` asked for `family=Fraunces:wght@300;400;500;600;700;800`.

Google **instances** a variable font to whatever axes the URL names. Ask
for `wght` alone and the file it serves has every other axis frozen at
its default. Fraunces has four axes, and `opsz` defaults to **14** —
so a 48px headline was being set in 14px-optical glyphs, which are a
different, wider drawing of the same typeface.

Measured, on the real headline string at the site's own size:

| | text width |
|---|---|
| `wght` only | 988.41px |
| all four axes | 956.41px |
| the site's own headline box | 977px |

11px. That is the entire bug: at 988px the line does not fit and wraps,
at 956px it does. One wrapped headline then pushes every section below it
down the page, which is why a page that is 94% correct by geometry can
look 40% wrong by pixels.

The source also set `font-variation-settings: "SOFT" 100`, which the
capture does not carry at all. That is a separate, still-open gap.

## The fix

`googleFontsUrlFor(families, axesByFamily?)` names every axis across its
full range when the axes are known:

```
family=Fraunces:opsz,wght,SOFT,WONK@9..144,100..900,0..100,0..1
```

Two things about that string are load-bearing:

- **Axis order.** Registered (lowercase) axes alphabetically, then custom
  (uppercase) ones. Any other order is a 400 from Google, and a 400 is
  no font at all — the page falls back silently.
- **Ranges, not values.** `wght@100..900` keeps the font variable;
  the old enumerated list pinned it to six instances.

Axes arrive as an argument rather than being fetched, which is the rule
the rest of `importFonts.ts` already follows: what Google serves and what
is installed are facts it cannot know and must not go looking for. Main
fetches `https://fonts.google.com/metadata/fonts` once per resolution —
public, no key — and `ResolveFontsResult` now carries `false` or the
family's axes rather than a boolean.

## Scope

**158 of Google's ~1950 families have an axis beyond weight.** This is not
a Fraunces curiosity: it is every optical-size face, every width axis,
every custom axis, on roughly one family in twelve.

## What it moved

`scamp.club`, one change, nothing else touched:

| | before | after |
|---|---|---|
| pixels matching | 58.57% | 72.01% |
| within 2px (geometry) | 89% | 94% |
| height vs source | +359px | +35px |

The remaining geometry offenders are `<p>`, `<a>` and `<nav>` — a
different problem. No `<h2>` is left in the list.

## If you touch this

Both harnesses fetch the same metadata and pass it, deliberately: when
`scripts/import-fidelity.mjs` and `scripts/import-pixels.mjs` disagree
about a page it should be because they measure different things, not
because one of them asked Google for a different font.
