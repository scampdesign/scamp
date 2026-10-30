# State properties in the variant set

**The story.** A component's open menus, confirm steps, and other
click states are variant properties today, so each one multiplies the
set. ChainStrip has three looks (`color` 5, `state` 3, `exit` 2: 30
frames) and four click states (`menu`, `inmenu`, `outmenu`, `options`:
2 × 2 × 2 × 3 = 24). Together they make 1,440 combinations, 40 times
the cap, and the set falls back to the over-cap layout
(`authoredVariantGrid`). A designer reads "menu open" as a moment in
the component's life, not a way it looks, and nobody designs
`violet · bypassed · split · inmenu open · options confirm`.

Builds on [Component variants](component-variants-plan.md), phases 6
(the set) and 7 (interactions).

## What we want

- Click states draw as their own frames, over the default look, not
  multiplied into the grid of looks.
- ChainStrip opens as its full 30-frame grid of looks, plus one frame
  for each open state.
- No change to the files, the contract, or the framework.

## The idea: a property an interaction drives is a state

Phase 7 already records which properties change by themselves:
`variantInteractions` on the root, read from `data-scamp-click`,
`data-scamp-outside`, and `data-scamp-escape` (and hover, press, and
focus selector lists). So a property's kind is derived, not stored:

> A **state property** is one where every non-default value is the `to`
> of an interaction. Every other property is a **look**.

ChainStrip: `menu`, `inmenu`, `outmenu`, and `options` are states (each
`open`/`confirm` value is reached by a click); `color`, `state`, and
`exit` are looks (nothing changes them, the route passes them).

Because it's derived, an agent or a hand edit that adds a click to a
property makes it a state with nothing else to write, and removing the
interaction makes it a look again.

## The set

```
Looks (grid, as today): color down, state across, one grid per exit
States: menu open · inmenu open · outmenu open · options open · options confirm
Combinations: each styled key that mixes a state with a look
```

- **Looks** use `variantGrid` over the look properties only.
- **States** are one block per state property, each value over the
  default look, like the over-cap layout's single-value rows.
- **Combinations** are what the over-cap layout already finds: each key
  a rule styles (and the live frame), restricted here to keys with a
  state in them. `bypassed` + `options confirm` shows only if a rule
  styles it.
- Picking values in the **Variants** section reaches any combination,
  as it does in the over-cap layout today.

## The limit

The cap becomes **looks**: `variantCombinationCount` over the look
properties must be 36 or fewer. States add their values to the set
(a sum, not a product), with their own limit of 24 state frames, so a
component can't grow without bound.

- `combinationLimitError` counts the same way, so adding a click
  interaction to a property can bring a component back under the cap.
- The over-cap layout stays for files past either limit.
- `agent.md` and the `scamp_edit_variants` tool text say so.

## Code

| File | Change |
|---|---|
| `lib/variantAxes.ts` | `stateAxisProps(elements)`: the set of state properties. `variantSetLayout(elements, activeKey)`: looks grid, states, combinations, or the over-cap layout; replaces the two callers' choice in `VariantSet.tsx`. `variantCombinationCount` takes the look axes. |
| `lib/variantInteractions.ts` | Nothing new; `stateAxisProps` reads `variantInteractions`. |
| `canvas/VariantSet.tsx` | Draws `variantSetLayout`; the message only for the over-cap case. |
| `components/VariantsSection.tsx` | A **State** tag beside a state property's name, so the grouping is explained where the property is edited. |
| `shared/templates/agentMd.ts`, `main/agent/writeTools.ts` | The limit's wording. |

## Tests

- **Unit** (`test/variantCombinations.test.ts`): a property with a
  click to each non-default value is a state; one with a click to only
  some values is a look; hover/press/focus count; ChainStrip's shape
  lays out as 30 looks + 5 states; the limit counts looks only;
  removing an interaction moves the property back to the grid.
- **End to end:** a component with two looks and two click states draws
  its grid and its state frames; adding a click interaction in the
  panel moves a property out of the grid.

## Open questions

1. **Do hover, press, and focus make a state?** Figma's interactive
   button keeps `default / hover / pressed` in the grid, and a button's
   `variant × size × state` is 27 frames, under the cap. Proposed: yes,
   for consistency, since the grid still fits; the alternative is
   click, outside, and Escape only.
2. **Mutually exclusive states.** ChainStrip's four menus close each
   other on every click, so they're really one property
   (`open: none | menu | inmenu | outmenu | options | confirm`). A check
   could suggest merging them. Out of scope here; worth a check later.
3. **Instances.** An instance on a page picks looks through props;
   states stay closed unless the route passes them. Unchanged, but the
   Instance section could list state properties separately later.
