# The agent's overflow check

`scamp_find_overflow` measures what overflows on a view, in a browser,
instead of the agent guessing from styles. The built-in agent and MCP
both have it: `canvasToolInvoker` answers it for both, through the
renderer's agent-tool channel.

## How it runs

1. **Renderer** (`syncBridge/agentOverflow.ts`): picks the view the way
   edits do (`destinationFor`: the `view` argument, else the
   conversation's view, which over MCP — no turn — is the open one). The
   open target comes from the live canvas, which can be newer than disk
   while a save is pending; every other view and component comes from its
   files, read with `readProject`, because an MCP agent edits files and
   `componentTrees` can lag what it wrote. It builds a one-page HTML
   export with `buildHtmlExport` (the page is named `home` so it sits at
   the root).
2. **Main** (`agent/overflowRender.ts`): writes the files to a temp
   folder, symlinks the project's assets folder in, loads `index.html` in
   a hidden, sandboxed window at the requested width (default: the
   desktop breakpoint), waits up to 3 s for web fonts, and runs
   `measureOverflowFn` (`src/shared/overflowMeasure.ts`) in the page.
3. **Renderer** maps each exported class back to an element
   (`@lib/overflowReport`): `card_a1b2` is on the view;
   `inst_x__nav_y` is `nav_y` inside the component that instance
   `inst_x` renders, which is where the fix belongs.

## What counts

- **off-page:** past the top, left or right of the page.
- **outside-parent / clipped / scrolls:** outside the nearest ancestor
  with a box, split by that ancestor's `overflow`: visible, hidden/clip,
  or auto/scroll (often intended).
- **text-spills:** a leaf whose text is wider than its box.

An escaping element's subtree isn't reported again, rows of a list fold
into one finding with a count, and the report caps at 40.

## Gotchas

- **No `enableDeviceEmulation`.** On a hidden window it crashed the main
  process with SIGSEGV (found by `test/e2e/agent/agent-overflow.spec.ts`).
  The window's content size sets the width instead.
- **Scrollbars hidden** (`scrollbar-width: none`). Without it, a page
  taller or wider than the window lays out 15px narrower than asked.
- It measures the export, which `test/e2e/parity/` holds to the canvas.
  Where the two differ, the canvas is what the user sees.
