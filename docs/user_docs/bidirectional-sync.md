# Bidirectional sync

Scamp's defining feature is two-way sync between the canvas and your
code files. Edit in Scamp, and the files update. Edit the files
externally, and the canvas updates.

## How it works

Scamp watches your project files with chokidar, a filesystem watcher.
When a `.tsx` or `.module.css` file changes on disk, Scamp does the
following:

1. Detects the change.
2. Parses the updated file.
3. Updates the canvas to reflect the new state.

This happens automatically; no manual refresh is needed.

## Edit externally

Open your project files in any editor:

- **VS Code**: Edit TSX or CSS and save. The canvas updates within
  moments.
- **Terminal**: Use `sed`, `awk`, or any CLI tool to modify files.
- **AI agents**: Point an agent at your project folder and let it write
  code. Scamp picks up the changes.

## The save-status indicator

A pill in the toolbar shows where the canvas stands relative to disk at
any moment. Most of the time you see **Saved**. The other states surface
specific situations. Click any of them to open a small popover with more
detail.

| State | Meaning |
|---|---|
| **✓ Saved** | The canvas and disk are in sync. |
| **↑ Saving…** | A write is in flight. |
| **● Unsaved** | You just edited, and the debounce hasn't fired yet, or another write is queued behind a save. |
| **⚠ Save failed** | The last write failed. The popover shows the message and a **Retry** button. |
| **⏸ Paused** | Scamp has paused saving, because an external editor is writing project files or you paused manually. The popover explains which one. |
| **⚠ Diverged** | The pause cleared, but the canvas has edits that don't match disk. The popover offers **Save canvas** (write your edits, overwriting disk) or **Discard canvas** (reload from disk, losing your in-memory changes). |
| **↺ Reloaded** | A canvas-driven save hit a write conflict, and Scamp adopted disk instead. Your in-flight edit was dropped. |

### Pause manually

The save indicator's popover always includes a **Pause sync** or
**Resume sync** toggle. Pausing holds your canvas edits until you
resume, which is useful while you make a large external edit.

Your edits don't stay held forever. When you resume, Scamp writes them.
When you switch to another page or component, Scamp writes the one
you're leaving, even while paused, so the edits aren't lost.

## Agent coexistence

Scamp keeps saving while an agent is open, in its integrated terminal or
anywhere else. An agent sitting at its prompt doesn't pause anything.

Two things keep Scamp from overwriting an agent's work:

- Scamp pauses while project files are actually changing (see the quiet
  window).
- Every save checks that the file still holds what Scamp last wrote. If
  an agent changed it in the meantime, Scamp merges the two edits. If
  they touched the same lines, Scamp keeps the agent's version and the
  indicator shows **Reloaded**.

### The quiet window

Every external file change opens a 2.5-second quiet window during which
Scamp absorbs additional writes without re-saving the canvas. Agents
typically write the same file two to five times in quick succession as
they iterate; the window keeps Scamp from racing those bursts.

If you make a canvas edit during the quiet window, Scamp queues it and
flushes it when the window expires.

### Diverged: choose which version wins

If both the canvas and disk gain conflicting edits during a pause (you
typed in the panel, and an agent rewrote the same class block), the
pause clears into **Diverged**. The popover lists the canvas edits that
happened during the pause and offers two choices:

- **Save canvas**: Writes the canvas's state to disk, overwriting
  whatever the agent wrote.
- **Discard canvas**: Reloads from disk, dropping your in-memory canvas
  edits.

There's no automatic merge. Scamp surfaces the conflict for you to
resolve explicitly.

## The agent.md file

Each project includes an `agent.md` file. This file explains the project
structure and conventions to AI coding agents: the `data-scamp-id` and
`className` contract, supported HTML tags, the `@media (max-width: Npx)`
format for [breakpoints](breakpoints.md), which files Scamp manages and
which are agent-editable, and the spacing-token conventions.

It also tells the agent about the [live canvas tools](ai-agents.md) and
when to prefer them over the context file.

Scamp regenerates `agent.md` every time you open a project, so updates
to the conventions roll out automatically as Scamp evolves. Don't
hand-edit `agent.md`; your edits get overwritten.

A sibling `CLAUDE.md` exists for Claude Code specifically. It imports
the full `agent.md`, so Claude Code sessions start with the Scamp
guidance already loaded.

## Work with AI agents

1. Open Scamp and your AI agent side by side, or run the agent in
   Scamp's [terminal](terminal.md).
2. Design the layout in Scamp. The agent reads the generated files.
3. Ask the agent to add styles, logic, or refine the CSS. Scamp reloads
   automatically.
4. Continue iterating between visual design and code.

If you and the agent touch the same file at the same time, the Paused
and Diverged flow described above keeps you from overwriting each other.

### Tell the agent what you're looking at

The flow above is about files. Scamp also gives agents a live view of
the canvas—what's selected, its styles, and the page structure—so you
can say "make this wider" instead of naming a class.

That's a separate feature set with its own page:
[Work with AI agents](ai-agents.md). In short:

- **MCP server**: An agent queries the canvas directly, and the answers
  are always current. It's registered automatically; you approve it
  once.
- **`.scamp/context.md`**: A snapshot of the current selection,
  rewritten as you click. It works when Scamp is closed.
- **Copy context** (Cmd/Ctrl+Shift+C): One line that describes the
  selection, for pasting into a prompt.

## Limitations

- Very rapid external writes might briefly show intermediate states
  before the quiet window settles.
- Unknown CSS at-rules, such as `@media (min-width: …)` and `@supports`,
  round-trip verbatim but aren't reflected on the canvas.
- External-edit history lands in the History panel as a single
  "External edit detected" entry. See
  [Undo, redo, and history](undo-redo.md) for how to step back through
  agent edits.
