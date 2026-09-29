# All four insets, and why the obvious fix is not safe yet

**Status: diagnosed, not fixed.** The capture still applies this only to
pseudo-elements. Read the numbers at the bottom before turning it on.

## What was seen

`gainwix.com` imported with a dark bar 160px wide painted down the left
edge of the page, over the text, for 4533px. The geometry harness named
it immediately:

```
skip_link_0001  <a>  146x50 → 146x4533
```

A "skip to content" link. The page hides it the ordinary way —
`position: absolute; top: -100px` — so it sits above the viewport until
focused.

## Why

Insets read back from `getComputedStyle` as **used** values, so an
element with `top: -100px` reports all four:

```css
position: absolute;
left: 16px;  right: 1278px;
top: -100px; bottom: 949.609px;
```

Emitting both of an opposing pair does not position a box, it
**stretches** it between them, overriding the width and height beside
it. `5383 − (−100) − 949.6 ≈ 4533`, which is the height observed.

The capture already had a filter for exactly this — keep the inset
nearer its edge, since the authored one is small and the resolved one is
leftover space — but it only ran on `::before` / `::after` styles. Real
elements never got it.

## Why turning it on is not the fix

Extending it to every positioned element, measured over three sites:

| site | before | after |
|---|---|---|
| gainwix.com | 86.51% | **91.75%** |
| resovaiq.com | 95.11% | **93.39%** |
| vercel.com/home | 95.01% | **94.85%** |

It also took vercel's import from **2624px wide to 1534px** against a
1440px source, which is a real structural win the pixel score barely
shows.

But resovaiq loses 1.72 points, reproducibly — A/B'd by stashing the
change and re-running. So the rule is wrong somewhere.

Two idioms were carved out and neither explains it:

- **Centring.** `left: 24px; right: 24px; margin: auto` with a max-width
  centres the box; dropping either inset slams it to one edge. Skipped
  when both margins on that axis are `auto`. This carve-out changed
  gainwix's score by 0.00, so it is unproven — it is in on reasoning,
  not evidence.
- **Lopsidedness.** Leftover space is asymmetric (`16px` against
  `1278px`) while an authored pair is symmetric (`inset: 0`, `24px/24px`).
  Pruning only when the larger is 4x the smaller and 100px clear of it
  recovered 0.79 of resovaiq's 1.72. Not enough.

## What is actually unknown

On resovaiq the two biggest new clusters are `title_001d` and
`snip_hello_0032`, and **neither has a `position` or any inset** — so
both are *consequences* of a positioned ancestor moving, not causes. The
ancestor that actually moved has not been identified. Find it before
touching the rule again: the harness reports where the page differs, not
which element caused it, and on a vertical-flow page those are rarely
the same element.

## If you pick this up

The helper is `dropResolvedInsets` in `src/shared/captureScript.ts`,
already extracted and documented, with the element-side call commented
out beside the other style corrections. Turning it on is one line.

Do not turn it on to move gainwix's number without finding resovaiq's
ancestor first. A 5-point gain that costs 1.7 elsewhere is a trade
nobody agreed to, and the pixel score is not the only measure — a
4533px dark bar is a far worse defect to a user than 1.7% of pixels, so
the right outcome is both, not a choice between them.
