# CLAUDE.md — Scamp App

This file is read by Claude Code on every session. Follow everything here without being asked.

---

## Project Overview

Scamp is a local-first Electron design tool. Users draw rectangles on a canvas and the app auto-saves real TSX + CSS Module files. Bidirectional sync means external edits (agent or manual) reload the canvas. The stack is Electron + electron-vite + React + TypeScript + Zustand.

See `prd-scamp-poc.md` for full product context.

---

## Where things are

Read this before grepping. Everything below is a starting point, not the
whole story — but starting in the wrong file is the most expensive thing
you can do here, and a wrong guess costs more context than this table.

| Task | Start at |
|---|---|
| Read a web page into the model | `src/shared/captureScript.ts` (runs IN the page), `src/shared/importCapture.ts` (the contract + `CAPTURED_PROPERTIES`) |
| Change what an import produces | `src/renderer/lib/importReduce.ts` — the pure reducer |
| The import's report of what it lost | `src/renderer/lib/importReport.ts` |
| Import fonts, theme tokens, images | `importFonts.ts`, `importTokens.ts`, then `src/renderer/src/components/projectShell/useWebsiteImport.ts` for the orchestration |
| Measure import fidelity | `scripts/import-fidelity.mjs` (geometry), `scripts/import-pixels.mjs` (pixels), findings in `docs/notes/import-parity-log.md` |
| TSX / CSS output | `src/renderer/lib/generateCode/` — `declarations.ts` is where a property becomes CSS |
| Read files back into the model | `src/renderer/lib/parseCode/` |
| A CSS property's typed mapping | `src/renderer/lib/cssPropertyMap.ts`, `parsers/` for each shorthand |
| Draw an element on the canvas | `src/renderer/src/canvas/ElementRenderer.tsx` |
| Canvas frame, zoom, theme variables | `src/renderer/src/canvas/Viewport.tsx` |
| Theme tokens reaching the canvas | `src/renderer/store/canvas/slices/designSystem.ts` (`setThemeData`), consumed in `Viewport.tsx` |
| Canvas state, selection, elements | `src/renderer/store/canvas/slices/` — one slice per domain |
| A properties-panel control | `src/renderer/src/components/sections/` — one file per section |
| Pages, views, routes on disk | `src/main/ipc/componentOps.ts` |
| Start-screen thumbnails | `src/renderer/src/lib/projectThumbnail.ts`, capture in `exportCapture.ts` |
| An IPC channel | name in `src/shared/ipcChannels.ts`, handler in `src/main/ipc/<domain>.ts`, surface in `src/preload/index.ts` |
| What an agent can do over MCP | `src/main/mcp/tools.ts`, answered in `src/renderer/src/syncBridge/mcpResponder.ts` |
| Auto-update and releases | `electron-builder.yml`, `.github/workflows/release.yml`, `docs/notes/auto-update.md` |

**Canvas / preview divergence** has its own harness: `test/e2e/parity/`.
Read `docs/notes/parity-harness.md` first — its oracle deliberately shares
no code with the thing it checks, and that rule is easy to break by
accident.

---

## Non-Negotiable Rules

- **Never write `any`** in TypeScript — use proper types or `unknown` with a type guard
- **Never skip tests** for anything in `src/renderer/lib/` — these are pure functions and must be fully tested
- **Never use `console.log` for debugging** — use the logger utility or remove before committing
- **Never hardcode IPC channel name strings** — always use constants from `src/shared/ipcChannels.ts`
- **Never read from disk in the renderer** — all file operations go through IPC
- **Never assume a case-sensitive filesystem.** Linux CI is case-sensitive; macOS APFS (the default for dev machines) is case-insensitive, so `fs.access("components/button/button.tsx")` resolves to the `Button` folder. Use directory listings + string comparison when a check depends on exact casing, and design code/tests to behave the same on both platforms.
- **In Playwright tests, use `ControlOrMeta+` not `Control+`** for keyboard shortcuts that should be cross-platform. CodeMirror's `Mod-*` bindings (and most macOS-aware app shortcuts) map to `Cmd` on macOS and `Ctrl` on Linux. A literal `Control+End` is a no-op on macOS and the next `keyboard.type` splices into wherever `editor.click()` left the cursor — usually mid-line, producing CSS the parser then rejects.

---

## Code Standards

### General:
- Prefer writing clear code and use inline comments sparingly
- If a comment would be more than ~2 lines, OR captures multi-file architectural context, move it to a new or existing file under `docs/notes/` and reference it inline (`// see docs/notes/<slug>.md`). Inline comments stay short and only encode local WHY (incidents, browser quirks, hidden invariants).
- When you make a code change that affects an existing `docs/notes/` file, update the note in the same commit. Stale notes are worse than no notes.

### TypeScript

- Strict mode is on — no exceptions
- Prefer `type` over `interface` unless you need declaration merging
- All function arguments and return types must be explicitly typed
- No implicit returns in functions that should return a value
- Use `const` by default; `let` only when reassignment is necessary
- Avoid `!` non-null assertions — handle nulls explicitly

```ts
// ✅
const getElement = (id: string): Element | null => {
  return elements[id] ?? null;
};

// ❌
const getElement = (id: string) => {
  return elements[id]!;
};
```

### React

- Functional components only — no class components
- One component per file
- Props types defined in the same file as the component, above it
- No prop drilling more than 2 levels — use Zustand store instead
- `useEffect` dependencies must be complete and correct — no suppression comments
- Event handlers named `handle[Event]` (e.g. `handleClick`, `handleMouseDown`)

```tsx
// ✅
type Props = {
  elementId: string;
  onSelect: (id: string) => void;
};

const ElementRenderer = ({ elementId, onSelect }: Props): JSX.Element => { ... };

// ❌
const ElementRenderer = (props: any) => { ... };
```

### File and Folder Naming

- React components: `PascalCase.tsx`
- Hooks: `camelCase.ts` prefixed with `use` (e.g. `useDrawTool.ts`)
- Utilities and lib files: `camelCase.ts`
- Test files: `[filename].test.ts` in `test/` at root
- CSS Modules for app UI: `ComponentName.module.css` alongside the component

### CSS Modules

- Reference theme variables (`var(--border)`, `var(--accent)`,
  `var(--text-primary)`, …) rather than hex literals. The full token
  set is declared in `src/renderer/src/styles/theme.css`.
- Add a new token to `theme.css` when an existing one doesn't fit —
  don't reintroduce raw hex values. Tokens are semantic
  (`--bg-raised`, `--text-secondary`), not numeric scales.
- One-off colors that genuinely have no reuse (e.g. a specific brand
  illustration) can stay as literals, but flag in a comment.
- The user-facing `theme.css` inside a project is a SEPARATE file
  (design tokens for the user's exported CSS) — don't conflate it
  with the app's chrome theme.

### Imports

- Use path aliases — never relative `../../..` chains more than one level deep
- Alias `@renderer` → `src/renderer`
- Alias `@lib` → `src/renderer/lib`
- Alias `@store` → `src/renderer/store`
- Group imports: external packages first, then internal aliases, then relative — blank line between groups

```ts
// ✅
import { useEffect } from 'react';
import { css } from '@codemirror/lang-css';

import { useCanvasStore } from '@store/canvasSlice';
import { parseCode } from '@lib/parseCode';

import { SelectionOverlay } from './SelectionOverlay';
```

### Zustand

- One slice per domain — never put everything in one store file
- Slices export their own types
- Actions are defined inside the slice alongside state
- Never mutate state directly — use Immer or spread

### IPC (Electron)

- All IPC channel names are constants in `src/shared/ipcChannels.ts` — never hardcode strings
- Main process handlers live in `src/main/ipc/` — one file per domain
- All IPC payloads have explicit TypeScript types defined in `src/shared/types.ts`
- Preload only exposes what the renderer actually needs — keep the surface minimal
- Handlers do one thing — keep them small and composable

---

## Testing

### What Must Be Tested

Everything in `src/renderer/lib/` must have full meaningful test coverage:

| File | What to test |
|---|---|
| `generateCode.ts` | TSX structure, CSS output, default omission, nesting, customProperties passthrough, text elements |
| `parseCode.ts` | Round-trip from generated output, external edits, missing properties fall back to defaults, unknown properties go to customProperties |
| `parsers.ts` | Every shorthand format for `border` and `padding`, px parsing, edge cases |
| `cssPropertyMap.ts` | Every mapped property, width/height mode switching, unmapped properties |
| `defaults.ts` | Default values are correct and complete |

### Test Standards

- Use **Vitest** (configured with electron-vite)
- Test files in `test/` at root, named `[filename].test.ts`
- Every test has a clear description — no `it('works')` or `it('test 1')`
- Tests grouped with `describe` blocks by function or behavior
- Use specific assertions — no `toBeTruthy()` when you can use `toEqual()`
- Always test the unhappy path — nulls, empty strings, malformed input, missing properties
- No mocking of `src/renderer/lib/` functions — they are pure, test them directly

```ts
// ✅
describe('parseBorderShorthand', () => {
  it('parses a full shorthand: 1px solid #ccc', () => {
    expect(parseBorderShorthand('1px solid #ccc')).toEqual({
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#ccc',
    });
  });

  it('returns default border when given an empty string', () => {
    expect(parseBorderShorthand('')).toEqual({
      borderWidth: 0,
      borderStyle: 'none',
      borderColor: '#000000',
    });
  });
});

// ❌
it('parses border', () => {
  expect(parseBorderShorthand('1px solid #ccc')).toBeTruthy();
});
```

### Hook tests

A React hook whose *ordering* matters — not just its result — is tested
directly with `@testing-library/react`, under jsdom via a
`// @vitest-environment jsdom` pragma at the top of the file. There is
one, `test/useComponentManagement.test.ts`, and the bar for adding
another is high: e2e is still how UI behaviour is covered here.

Reach for a hook test only when a race decides correctness and the
end-to-end fixtures are too small to lose it. The case that earned the
dependency: the Next.js → Scamp migration has to move the canvas off a
page *before* replacing that page's files, and the migration specs pass
either way because the fixture project settles too fast to collide.

Write the assertion so it fails without the fix, and check that it
does — a test that passes both ways is worse than none, because it
reads like coverage.

### Integration Tests

Integration tests live in `test/integration/` and are also run with Vitest. They test across module boundaries — things unit tests can't catch — without needing to launch the full Electron app.

**What integration tests cover:**

| Test | What it validates |
|---|---|
| `sync.integration.test.ts` | `generateCode` output is written to a temp file, read back, parsed by `parseCode`, and the result matches the original state |
| `filePatch.integration.test.ts` | The `file:patch` logic finds the right class block in a CSS module, replaces only that block, and leaves the rest of the file untouched |
| `externalEdit.integration.test.ts` | Simulates an agent editing a CSS file — writes modified CSS to disk, runs `parseCode`, asserts the changed property is reflected in the element tree and nothing else changed |

**Integration test standards:**

- Use `os.tmpdir()` to create a real temp directory per test — clean it up in `afterEach`
- No mocking of `fs` — use the real file system via a temp dir
- No mocking of `generateCode` or `parseCode` — test them for real
- Keep tests independent — each test sets up and tears down its own files
- These are slower than unit tests and that is fine — correctness matters more here

```ts
// ✅ Integration test structure
describe('file patch integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('replaces only the target class block and leaves others untouched', async () => {
    const cssPath = path.join(tmpDir, 'home.module.css');
    await fs.writeFile(cssPath, originalCss);

    await patchClass(cssPath, 'rect_a1b2', 'background: red;\nwidth: 200px;');

    const result = await fs.readFile(cssPath, 'utf-8');
    expect(result).toContain('.rect_a1b2');
    expect(result).toContain('background: red;');
    expect(result).toContain('.rect_c3d4'); // other class untouched
  });
});
```

### Running Tests

```bash
npm run test                # run all tests (unit + integration)
npm run test:unit           # unit tests only
npm run test:integration    # integration tests only
npm run test:watch          # watch mode
npm run test:coverage       # coverage report
```

Tests must pass before any commit that touches `src/renderer/lib/` or `src/main/ipc/`.

### Future: E2E Tests

Playwright with its Electron mode will be added post-POC for full end-to-end tests that launch the real app. Not in scope now — the UI is too unstable to write E2E tests against during the POC phase.

---

## The Two Core Functions

These are the most critical files in the codebase. Run tests after every meaningful change to either.

### `generateCode(elements, rootId, pageName) → { tsx: string, css: string }`

- Pure function — no side effects, no IPC, no store reads
- Only emits CSS properties that differ from `DEFAULT_RECT_STYLES`
- Always appends `customProperties` verbatim at the end of each class block
- Traverses element tree depth-first
- Text content must be HTML-escaped

### `parseCode(tsx: string, css: string) → ElementTree`

- Pure function — no side effects
- Applies `DEFAULT_RECT_STYLES` as baseline before overlaying parsed values
- Unknown CSS properties go into `customProperties`, never discarded
- Must handle both shorthand and longhand CSS forms for border and padding
- Must be the inverse of `generateCode`

### Round-trip invariant

This test must always exist and always pass:

```ts
it('round-trips cleanly: generateCode → parseCode reproduces original state', () => {
  const { tsx, css } = generateCode(elements, rootId, 'home');
  const parsed = parseCode(tsx, css);
  expect(parsed).toEqual(elements);
});
```

---

## Documentation Style

User-facing prose — everything in `docs/user_docs/`, `docs/CHANGELOG.md`,
and copy that ships in the app (tooltips, banners, empty states, error
messages) — follows the
[Google developer documentation style guide](https://developers.google.com/style).
When you write or edit any of it, apply the guide. The rules that come
up most:

- **Sentence case** for headings and titles (`## Add a transform`, not
  `## Adding A Transform`). Task headings are bare infinitives ("Add",
  "Change", "Export"), never gerunds ("Adding").
- **Second person, present tense, active voice.** "You can…", "Scamp
  writes…". No "we", no "will" for things the software does now.
- **Steps are numbered imperatives, context first:** "In the sidebar,
  click **New Project**." One action per step.
- **Bold UI element names** as they appear on screen; **code font** for
  filenames, values, CSS properties, and anything the user types.
- **Verbs for UI:** *click* a button, *select* an item from a list or
  menu, *hold the pointer over* for hover, *press* a key. Don't use
  "hit", "hover", or "dropdown" (say "list" or "menu").
- **Punctuation:** serial commas; em dashes with no surrounding spaces
  (`word—word`); no spaced hyphens as dashes.
- **Avoid:** "please", "simply", "just", "easy", "e.g." (use "for
  example"), "etc." (use "and so on"), "via" (use "through"),
  exclamation marks, and marketing language.
- **Notices** use `**Note:**`, `**Tip:**`, or `**Caution:**` on their
  own paragraph. Never stack two notices.
- **Link text describes the destination** ("see [Breakpoints](…)"), not
  "click here".
- **Release notes** (`docs/CHANGELOG.md`): sentence case, present tense,
  second person, one bolded lead sentence per entry that states the
  user-visible change, then the why.

Internal docs (`docs/notes/`, `docs/plans/`) are exempt but should lean
the same way.

---

## What Not to Do

- Don't add dependencies without a good reason — keep the bundle lean
- Don't add a dependency for something achievable in ~20 lines of TypeScript
- Don't put canvas or page state in React component state — it belongs in Zustand

---

## `.js` shim regen — never with the dev server running

`src/renderer/**`, `src/main/**`, `src/preload/**`, and `src/shared/**`
each have committed `.js` + `.d.ts` shims paired with every `.ts` /
`.tsx` source file. Vite's default resolution order prefers `.js`
over `.ts`, so the dev server (renderer + main + preload) and
Vitest all read the shim, not the source — which means **edits
to a `.ts` file don't take effect until the shim is regenerated.**

There are two projects, one per side:
- Renderer + shared: `npx tsc --build tsconfig.web.json --force`
- Main + preload + shared: `npx tsc --build tsconfig.node.json --force`

Run BOTH after editing files that span sides (e.g. an IPC channel
constant in `src/shared/` plus a new handler in `src/main/` plus a
listener in `src/renderer/`). Forgetting the main-side regen
silently leaves the main process running the old watcher / IPC
handlers even though the renderer has the new code.

**Never run that regen while `npm run dev` is running.** The shim
files get rewritten while HMR is watching them, which reloads
`parseCode` / `generateCode` / store modules mid-session. The
canvas in-memory state for any currently-open project gets dropped
to empty. The on-disk project files are NOT touched — recovery is
just force-quit and reopen — but it's still alarming and a real
risk if the user happens to save during the reload window.

Rules:
- Stop the dev server before `tsc --build`.
- If you edit a `.ts` in `src/renderer/lib/` or `src/renderer/store/`
  and intend to test in the running app (not just via Vitest),
  warn the user and ask them to stop the dev server first.
- Vitest CAN read the stale shim too — if a test passes against
  the old behaviour after a `.ts` edit, regen the shim before
  trusting the result.
