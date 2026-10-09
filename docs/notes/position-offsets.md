# Offsets the model can't hold

Scamp stores an element's `left` / `top` as pixel numbers, `x` and `y`.
Agents write offsets that aren't pixels: `left: 50%` with
`transform: translateX(-50%)` is how they centre an absolutely positioned
glow. `parsePx` read those as `0`, so the generator wrote `left: 0px` on
the next save. Opening a project was enough: Scamp writes the canonical
form of an agent-written file on load, and the glow moved.

Found on 2026-10-09 through a project-console warning, "couldn't patch
the stylesheet safely", which turned out to be a second, separate bug
(below).

## How it works now

- **Parse** (`parseCode/apply.ts`): a `left` / `top` that `parsePxOrNull`
  can't read goes to `customProperties`, verbatim; `x` / `y` are left
  alone. Same in breakpoint overrides.
- **Generate** (`generateCode/declarations.ts`): where the position
  branch writes `left` / `top` from `x` / `y`, it writes the kept value
  instead. The customProperties echo is then skipped by the usual
  "already emitted" rule, so the file has one `left`.
- **Canvas**: `elementToStyle` spreads customProperties last, so the kept
  value wins over the inline `x` there too.
- **Move** (`store/canvas/patchRouting.ts`): any patch that sets `x` or
  `y` (a drag, a resize, the Position fields) drops the kept `left` /
  `top` from wherever the patch lands (base, breakpoint, or state).
  Otherwise it would keep winning and the element wouldn't move.

## The patch check that cried wolf

`cssWriteFor` patches only the rules that changed, then checks the
patched file parses to the same model as the generated one. It compared
with `JSON.stringify`, which is key-order sensitive, and a model's key
order follows the order declarations appear in the file. An agent's
`align-items; gap` at a breakpoint and the generator's `gap;
align-items` read as two designs, so every save of such a file fell back
to writing it whole. It now compares with sorted keys (`canonicalJson`).

Tests: `test/positionOffsets.test.ts`, `test/cssWrite.test.ts`.
