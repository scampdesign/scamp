# Embedded Scamp — implementation plan

Status: **phases 1–7 built, ready for manual testing** on
`feat/embedded-scamp` (2026-11-03). The product brief is
[`../embedded-scamp-prd.md`](../embedded-scamp-prd.md); the user guide is
[`../user_docs/edit-react-project.md`](../user_docs/edit-react-project.md).

## Decisions on the PRD's open questions

These were made to ship a testable v1 without stopping to ask. Each is
cheap to change later.

- **Stacks for v1:** Vite + React and Next.js. CRA is detected and
  reported as "not supported yet" on the setup screen. The agent writes in
  whatever idiom it finds, and its prompt names the one Scamp detected:
  Tailwind, CSS Modules, styled-components or plain CSS.
- **Auto-fix vs report:** Scamp does what is safe and reversible and
  reports the rest. It runs the install, writes its own config into
  `.scamp/`, creates the branch, and initializes git when you ask it to. It
  reports, and never changes: the Node version, missing env files, and a
  backend the app seems to need.
- **Product shape:** a mode inside the desktop app. **Edit React project**
  on the start screen opens its own window.
- **Agent write loop:** continuous by default, as the PRD's "always
  listening" says. **Pause** holds the queue, and **Run now** sends
  everything queued as one batch.
- **Design checks:** on demand only. A run reads the whole project and
  costs tokens.

## Architecture

- **A window of its own**, like the import window: a `BrowserWindow` with a
  `<webview>` for the running app, and a preload with a narrow API
  (`window.scampEmbedded`). The main window's security settings are
  unchanged. see `src/main/embedded/window.ts`
- **No package to install in the project.** Scamp starts Vite itself, with
  `--config .scamp/embedded/vite.config.scamp.mjs`. That wrapper loads the
  project's own config (`loadConfigFromFile`) and puts one plugin ahead of
  the project's plugins. Its `pre` transform parses each source file with
  the project's `@babel/parser` and writes
  `data-scamp-src="src/File.tsx:line:col"` into every intrinsic JSX tag,
  adding no newlines. `.scamp/` goes in `.git/info/exclude`, so nothing
  Scamp writes is committed.
  - **Why a transform, not React's `source`:** under
    `@vitejs/plugin-react`, esbuild compiles the JSX after the fast-refresh
    preamble is prepended, so the `source` React's runtime gets counts lines
    of the transformed file (19 lines off in the fixture). The transform
    reads the file before anything else touches it.
  - **Fallbacks, in order:** a wrapper around `react/jsx-dev-runtime` that
    tags from `source`, for a project without `@babel/parser` (SWC, where
    `source` is computed on the original file); then React's fiber debug
    info (`_debugSource` on React 18, `_debugStack` on 19), read in the page.
- **Next.js** runs with its own dev script; nothing is written to the
  project. The inspector reports React's debug location for an untagged
  element (`_debugSource` on React 18, the first non-React frame of
  `_debugStack` on 19), and main resolves it (`sourceResolve.ts`): it
  fetches the chunk from the app's own origin (or reads a server chunk
  inside the project, for `rsc://React/Server/file://` frames), follows its
  `sourceMappingURL`, decodes the map by hand (`sourceMap.ts`, index maps
  included, for Turbopack), strips the `webpack://_N_E/` or
  `turbopack:///[project]/` prefix, then `refineLine` picks the line that
  opens the tag, scored by CSS Module local names (`classTokens`) and
  text. Instances are counted by the same debug location.
- **Pseudo states** go through the debugger protocol (`pseudo.ts`), on the
  webview's contents from `did-attach-webview`: the inspector marks
  elements with `data-scamp-force="hover,focus"`, says so, and the window
  asks main to apply the marks with `CSS.forcePseudoState`. Forced nodes
  are tracked by backend node id, since `DOM.getDocument` renumbers node
  ids. Freeze marks the chain under the pointer `:hover` and the focused
  element `:focus`; the Style tab's states mark the selection. An edit made
  in a state previews as a stylesheet rule (`[data-scamp-uid]:hover`, or
  the shared `data-scamp-src` for every instance) and is queued with
  `state`, so the prompt asks for a `:hover` rule or Tailwind's prefix.
- **Every element is editable.** The panel edits computed CSS, so it works
  on any element; the source line is a head start for the agent, not a
  gate. An element with no line goes to the agent with its classes, text,
  component chain, page path and ancestor selector, and is told to search;
  a library's element (React's location inside `node_modules`) is styled
  from the project's code that renders it.
- **Routes** under the path field come from three places, merged by
  `mergeRoutes`: React Router's route objects (`readRoutesFn`, shared with
  React import), Next.js files (`routes.ts`, once per session), and
  same-origin links on every page loaded. Scamp doesn't load pages in the
  background to find more.
- **Layers** are the page's tree from the inspector (`tree()`, ids kept in a
  `WeakMap`, capped at 3,000 nodes), asked again after a quiet DOM change.
- **The inspector** is a self-contained script that runs in the page through
  `webview.executeJavaScript`, as `captureScript.ts` does. It draws the
  hover and selection outline, blocks the app's own clicks in edit mode,
  freezes transient UI by blocking leave, blur and Escape events, and
  applies layer 1 styles inline. **F8** toggles freeze from inside the
  page: a menu that closes on leave has closed by the time the pointer
  reaches the toolbar. It reports back through
  `console.debug('__scamp_inspector__…')`, which the host reads from the
  webview's `console-message` event. The guest page gets no preload.
- **The panel is Scamp's own `UiPanel`.** The window has its own canvas
  store and never mounts the sync bridge, so nothing is written to Scamp
  files. A selection becomes a stand-in `ScampElement` built from the
  node's computed style (`applyDeclarations`). Each edit is the difference
  between `elementDeclarationLines` before and after. That difference is
  applied inline to the page and queued for the agent.
- **The agent** runs `runTurn` from `src/main/agent/harness.ts` with the
  app's provider and key, plus new file tools (`list_files`, `read_file`,
  `search`, `edit_file`, `write_file`), all kept inside the project folder
  and away from `node_modules`, `.git` and `.scamp`. It has its own queue,
  pause, batch and status (thinking, writing code, done).
- **Git** runs through `execFile`: branch, status, diff, commit (accept),
  restore (discard), revert, switch, push and pull. Every agent run leaves
  a diff on the branch. Accept commits it as `Scamp: …`.
- **The dev server** uses `startReactApp` from
  `src/main/reactImport/appServer.ts` with a command override, so the
  install, free port, ready check and stop on quit are shared with React
  import.

## Phases, mapped to the PRD

1. Entry, folder choice, and the setup screen: accounts, environment, the
   backend heuristic, install, and the config Scamp writes.
2. The branch, the managed dev server, and the app in the window with
   navigation.
3. Selection and source mapping, layer 1 edits through the panel, and
   freezing transient UI.
4. The agent queue and write loop: status, pause and batch, diff review,
   and this instance or all instances.
5. Editing by instruction.
6. Git actions: create and switch branches, push, and pull.
7. Project-wide design checks.
8. Later: editing `theme.css` and tokens. Not in this branch.

## Known limits

- Forced states use the debugger, which only one client can hold: with
  DevTools open on the page, forcing may stop until it's closed.
- Next.js mapping depends on the dev server's source maps and React's
  debug info; an element it can't resolve says so. `webpack-internal://`
  frames give a file but not a reliable line, so the line comes from
  `refineLine` alone.
- The panel shows the selection's computed styles, so a `width: auto`
  element reads as a fixed width. Only what you change is sent, so this
  never reaches the source unless you edit it.
- An element drawn from a loop or from data is mapped to its JSX line, and
  "this instance only" is passed to the agent, which says when the change
  can't be made per instance.
- Accept commits the files the agent wrote. A user's own edit in one of
  those files goes into the commit with it.

## Tests

- **Unit tests** for the pure parts: preflight evaluation, git output
  parsing, the edit-to-prompt builder, the style difference, the file-tool
  path guard, and idiom detection.
- **Integration tests** for git (`test/integration/embeddedGit…`, including
  a push to a local bare remote), the file tools on a real folder (path
  guard, symlinks, env files), and the generated Vite config, loaded by
  Vite itself.
- **e2e** on a fixture Vite + React app (`test/fixtures/embedded-app/`),
  which resolves React and Vite from the repo's `node_modules`:
  `embedded-edit.spec.ts` covers setup, start, select, a live edit, the
  scripted agent writing the CSS Module, the preview dropped for the real
  CSS, review, and accept onto the `scamp/` branch.
  `embedded-modes.spec.ts` covers freeze with F8, an edit to every
  instance, pause and Run now, an instruction, the design check, and the
  signed-out setup screen. `embedded-states.spec.ts` covers F8 holding a
  CSS-only tooltip and **Release**, selecting from the layers tree,
  forcing `:hover` on the selection, and an edit queued for that state.
- Next.js resolution is unit-tested (`test/embeddedSourceMap.test.ts`) but
  has no e2e fixture: the repo doesn't install Next.
