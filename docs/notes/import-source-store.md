# Keeping the page an import came from

## Why

An import is a lossy translation into a model far more constrained than
a browser, and the report says what was *changed* — not what the page
originally *said*. So the interesting question when tidying up an
imported view, "what did this actually do?", had no answer: an agent
could only infer the authored rule from the generated output, which is
the wrong direction and often impossible. A rounded value, a selector
the model has no place for, a rule that reached an element through
three ancestors — none of that survives the reduction.

The original does. `captureFn` now reads
`document.documentElement.outerHTML` and the text of every stylesheet
the page lets it read, and carries them on the payload as `source`.

## Where it goes, and when it leaves

The OS temp directory, **never the project**: it is a copy of somebody
else's page, useful while an import is being tidied up and noise
afterwards. `importSourceStore.ts` writes one directory per project
(named by a hash of the project path, so two projects cannot collide)
holding `page.html`, `styles.css`, and a small `source.json`.

It is removed when the project closes, which in practice means two
events, both wired:

- A different project opens — `setActiveImportProject` in
  `ipc/project.ts`, beside the call that moves the MCP server.
- The app shuts down — `disposeImportSources()` in
  `performShutdownCleanup`.

Nothing about it ever reaches a commit, and the next session starts
clean.

`/tmp` is shared between accounts on Linux and the folder name is
predictable, so every read and write first checks that
`scamp-import-source` is a real directory owned by this user, tightening
it to `0700` if an earlier version left it open, and refuses to use it
otherwise. A read takes `page.html` / `styles.css` from the view's own
folder; the paths in `source.json` are never followed, since anyone who
could write that record could point it at any file.

## What the agent sees

Two tools, answered in **main** from disk rather than by the canvas —
the same shape `scamp_list_routes` uses, through `ToolInvokerOptions`:

- `scamp_list_import_sources` — which views came from an import, the
  URL each came from, and the sizes on disk.
- `scamp_get_import_source` — the html or the css, defaulting to css
  because that is where the answers usually are.

A stylesheet runs to megabytes and a context window does not, so a
reply is capped at `IMPORT_SOURCE_REPLY_LIMIT` and says so, and always
names the file — the rest is one file read away for the rare case that
needs it.

## Two things recorded rather than ignored

**Unreadable stylesheets.** `sheet.cssRules` *throws* for a
cross-origin sheet served without CORS, rather than returning nothing.
Those hrefs are collected into `unreadable`: "there was more CSS and we
could not see it" is exactly the kind of fact that explains an import
nobody can otherwise account for.

**Truncation.** Each half is capped at `maxSourceLength`, and the flag
says whether anything was cut, so a short file and a cut one are never
confused.

## What this is not

It does not give the MCP access to the import browser. The import
window is a separate `BrowserWindow` hosting a third-party page, with a
deliberately tiny preload; the MCP is bound to the app window alone and
never sees it. What crosses the boundary is the finished capture, on
its way to becoming a view — the agent reads the result of an import,
still never the live page.
