# Embedded Scamp for a running Rails app

Edit React Project assumes a React app that Scamp starts and instruments.
This plan adds a second way in: **attach to an app that is already
running**, given its URL and the repository its code is in, and edit its
HTML visually while the agent writes the changes. Rails is the first target,
but nothing in the attach path is Rails-only.

see docs/plans/embedded-scamp-plan.md for the architecture this builds on.

## The first test app

A real Rails 8.1 app, which is a good match for this plan:

- Server-rendered ERB, **ViewComponent** (about 40 components), **Turbo**,
  and about 70 small Stimulus controllers. No React, no npm build.
- **Tailwind v4** through `tailwindcss-rails`, with `bin/dev` running the
  watcher beside Puma. `application.css` imports about 30 hand-written CSS
  files, and the design tokens are about 280 custom properties.
- **`annotate_rendered_view_with_filenames` is already on** in
  development. Every template, partial, layout and component template is
  wrapped in `<!-- BEGIN app/views/… -->` / `<!-- END … -->`.
  ViewComponent 4.21 writes the same comments, including for components
  with an inline `call`.
- The Rails app is in a **subfolder of the repository**, which the audit's
  item 9 fix supports.
- The repository has its own branch rules and agent instructions
  (`CLAUDE.md`, `AGENTS.md`), and reserves some ports for the user's own
  server.

## What already works unchanged

- **The window, the webview and the inspector.** The inspector is a script
  injected into any page. Hover, selection, Freeze, forced `:hover` and
  `:focus` states, the layers tree, and inline preview of an edit all work
  on plain HTML.
- **The Style panel.** It edits the selection's computed CSS, so it never
  needed React.
- **The agent and its tools.** The queue, the file tools kept inside the
  folder, git (branch, diff, accept, discard, undo, History), and **My
  agent** over MCP don't depend on the framework.
- **An element with no source line.** It already goes to the agent with its
  classes, text, page path and ancestor selector, and the agent searches.
  On day one, every element in a Rails app works this way.

## Decisions

- **Attach, don't start.** Scamp doesn't run `bin/dev`, install gems, or
  write into the project. It needs a URL and a folder, nothing else. The
  user's server, database, workers and sign-in stay theirs.
  - Starting the server for the user can come later, if attaching turns out
    to be a chore. Rails apps vary too much (Postgres, RabbitMQ, `.env`) to
    guess the command.
- **No instrumentation.** The source comes from Rails' own template
  comments, not from a transform. If the comments are off, Scamp says how
  to turn them on (one line in `config/environments/development.rb`) and
  still works without them.
- **Name the entry by what it does, not by the framework.** For example,
  **Edit a running app**, beside **Edit React Project**. The React path
  keeps everything it has.
- **The agent follows the project's own instructions.** The prompt tells it
  to read `CLAUDE.md` / `AGENTS.md` in the repository first, if they exist.
  **My agent** (Claude Code) does that on its own.

## Phases

### 1. Attach to a URL and a folder

The smallest version that's useful on the test app.

- [ ] A setup screen for **Edit a running app**: the app's URL (or a port,
  read as `http://localhost:<port>`), and the folder. Remember both in the
  recent projects list.
- [ ] Checks, in place of the React preflight (`preflight.ts`,
  `preflightFacts.ts`):
  - The URL responds. Follow redirects, so `/` → `/login` passes.
  - The folder is inside a git repository. A subfolder is fine.
  - What the folder is: `Gemfile` with `rails`, and which CSS setup
    (`tailwindcss-rails`, `dartsass-rails`, `cssbundling-rails`, plain
    `app/assets/stylesheets`). This only feeds the prompt; nothing fails
    on it.
- [ ] `EmbeddedStart` (`window.ts`) gets a branch for an attached session:
  make the session branch, skip `writeInstrumentation` and
  `startReactApp`, and use the given URL. Don't stop the server on close,
  since Scamp didn't start it.
- [ ] Reload after a run. With no Vite hot reload, Scamp reloads the webview
  when a run ends (the **My agent** path already does on
  `scamp_embedded_finish`).
  - Tailwind's watcher rebuilds the CSS a moment after the agent writes. A
    reload before it finishes shows the old styles. Wait until the
    stylesheet's fingerprinted URL changes (Propshaft's digest), or for a
    short settle time if the CSS didn't change.
- [ ] The agent prompt for an attached Rails app (`agentQueue.ts`,
  `ownAgent.ts`): it's a Rails app with ERB, partials and ViewComponents;
  styles go where the project keeps them (Tailwind utility classes in the
  template, or the project's CSS files, and tokens rather than raw values);
  read the repository's agent instructions first.
- [ ] Turn off what doesn't apply: React component scopes, list origins
  (`listOrigin.ts`), Next.js routes, and the CSS Modules fast path
  (`fastPath.ts`). Each should already fall back when it finds nothing.
  Confirm it does, and hide any control that only makes sense for React.
- [ ] Sign-in: the webview keeps its own session, so the user signs in once
  inside Scamp. Use a persistent partition per project, so it survives a
  restart.

**Done when** you can attach to the test app on its port, select an element
on a signed-in page, change its padding, and the agent writes it into the
right ERB or CSS file, and the page reloads showing it.

### 2. Templates from Rails' comments

- [ ] In the inspector, find the template an element came from: walk back in
  document order from the element, counting `END`/`BEGIN` comments, and
  stop at the first `BEGIN` that isn't closed. That's the innermost
  template, partial or component. Also collect the chain outwards (layout →
  view → partial → component), as React's component chain is collected now.
- [ ] Send the template path with each edit, as the source location. There's
  no line, so pick one in main the way `refineLine` does for Next.js:
  score the template's lines by the element's classes, tag and text.
- [ ] Scope buttons, as for React components: a partial or component
  rendered more than once on the page reads **This _card** and **Every
  _card · 3** (count the `BEGIN` comments for that file). An element from
  a `.each` inside one template stays "this one", and the agent says when
  it can't be done for only one.
- [ ] Show the template in the **Code** section of the Style tab: the file,
  and the lines around the picked one.
- [ ] If the comments are missing, say once that turning on
  `annotate_rendered_view_with_filenames` makes selection precise, with the
  line to add. Scamp doesn't add it.

**Done when** selecting an element in a partial shows that partial's path
and lines, and an edit to "every" changes the partial, not each place it's
rendered.

### 3. Turbo, routes and Tailwind

- [ ] **Turbo Drive** swaps the `<body>` on navigation without a page load,
  so `did-finish-load` doesn't fire. Listen for `turbo:load` in the
  inspector (or the webview's `did-navigate-in-page`), re-attach the outline
  and the layers tree, and update the path field.
  - Check that a selection, Freeze and an inline preview are cleared on a
    Turbo visit, rather than left pointing at removed nodes.
  - Turbo Frames and Streams change part of the page. Treat them like a
    React re-render: refresh the tree after a quiet DOM change, as now.
- [ ] **Routes**: same-origin links on each page work already. Add
  `bin/rails routes` output, run once per session in the folder, with only
  `GET` routes that have no required parameters.
- [ ] **Tailwind**: detect `tailwindcss-rails` and the Tailwind v4
  `@theme` tokens in `app/assets/tailwind/application.css`, so the panel
  offers the project's tokens and the agent writes their utilities.
- [ ] **ViewComponent**: name the component in the scope buttons by its
  class (`ConfirmDialogComponent`), from the template path.

## Known limits

- **No line from Rails.** The comments give the file only. Picking the line
  is a scored guess, as for Next.js, and the agent confirms it.
- **The panel shows computed values.** It can't tell which Tailwind class or
  CSS rule a value came from, as with any element without source maps.
- **Server state is the user's.** Scamp can't reset data, and a page that
  needs a record or a role shows whatever the signed-in user sees.
- **Stimulus changes the DOM after load.** The inspector sees the result,
  and the template may not contain what the controller added. The agent is
  told the element may be built in JavaScript when the template has no
  match.
- **Branch rules.** Scamp makes its own local branch and commits there on
  **Accept**. Pushing is the user's choice, so a repository that only
  accepts pushes to a particular branch isn't affected unless the user
  pushes from Scamp.

## Tests

- **Unit:** the template finder (nested partials, a component inside a
  partial, a comment whose `-->` is on the next line, as Rails 8 writes the
  layout's), the line scorer on ERB, the Rails and CSS-setup detection, and
  the `bin/rails routes` parser.
- **e2e:** a small fixture that serves static HTML with Rails-style
  comments from a local HTTP server, so the tests need no Ruby. Attach,
  select an element in a partial, check the path and scope buttons, and
  check that a Turbo-style body swap re-attaches the inspector.
- **By hand:** the test app, signed in, through phases 1–3.

## Open questions

- Does attaching belong in the same window as Edit React Project, with a
  "React" or "Running app" choice, or as its own entry on the start screen?
- Should Scamp offer to start the server later, from a command the user
  types once and Scamp remembers?
- HAML or Slim templates: Rails still writes the comments, but the line
  scorer would need their syntax. Out of scope until someone needs it.
