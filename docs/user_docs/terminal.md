# Terminal

Scamp includes a built-in terminal, so you can run commands without
leaving the app.

## Open the terminal

To show or hide the terminal panel, press **Ctrl+`** (backtick), or
click the terminal icon on the right of the canvas toolbar.

## Use the terminal

The terminal opens in your project directory. Use it to do the
following:

- Run AI agents or command-line tools. See
  [Work with AI agents](ai-agents.md).
- Run git commands.

## The MCP indicator

When a project is open, the panel header shows an **MCP** pill. Its dot
tells you whether Scamp's [MCP server](ai-agents.md) is running and
whether an agent is connected; its tooltip lists the agent
configurations that Scamp registered. For the meaning of each color, see
[Is it working?](ai-agents.md#is-it-working).

The copy button beside the pill opens a menu of agents: Claude Code,
Codex, OpenCode, Gemini CLI, Cursor, VS Code, and other tools. Select
yours to copy its connect command or config to your clipboard. Use it
for an agent that Scamp can't configure automatically, or for a session
that was already running when you opened the project.

## Multiple tabs

You can open up to three terminal tabs. Each tab runs an independent
shell session, so you can run a dev server in one tab and an agent in
another.

## Persistence

The terminal keeps running while the panel is hidden. Hide the panel
with **Ctrl+`**, and your processes continue in the background. Reopen
the panel to see their output.

## Error recovery

If a terminal fails to start—for example, because of a shell
configuration issue—Scamp tries to recover automatically. If the
problem persists, close the tab and open a new one.
