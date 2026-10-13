# Work with AI agents

Scamp gives coding agents three ways to understand what's on your
canvas, so you don't have to describe it. All three work with any agent
that can read your project folder. The MCP server additionally needs an
agent that supports MCP, such as Claude Code, Cursor, Gemini CLI, or
Kiro.

For how Scamp and an agent avoid overwriting each other's file edits,
see [Bidirectional sync](bidirectional-sync.md).

Scamp also has its own agent, built in. See [Scamp Agent](scamp-agent.md).

## The MCP server

While Scamp is open with a project, it runs a small local server that
lets an agent query the live canvas: what's selected right now, what
styles it has, and what the page structure looks like.

This is the best of the three options, because the answers are read at
the moment the agent asks, so they're never stale.

### Setup

There is no setup. Scamp registers the server in each installed agent's
own config when you open a project. You don't run a command.

| Agent | File Scamp writes |
|---|---|
| Claude Code | `.mcp.json` |
| Cursor | `.cursor/mcp.json` |
| Gemini CLI | `.gemini/settings.json` |
| Kiro | `.kiro/settings/mcp.json` |

Only agents you have installed get a file; Scamp checks for each one's
config folder in your home directory first. Existing servers in those
files are left alone. Scamp adds only its own entry.

VS Code and Codex aren't configured automatically yet. For those, use
the copy button on the terminal's MCP indicator to get a ready-to-paste
connect command. See [Is it working?](#is-it-working).

### Approve the server once

Most agents don't trust a project-level server until you say so. In
Claude Code, the server shows as **⏸ Pending approval** until you run
`claude` once and approve it.

This is a security prompt, not a bug. You're consenting to a local
server reading your project, and Scamp deliberately doesn't bypass it.

If you decline or dismiss that prompt, Claude Code remembers the answer
in `.claude/settings.local.json` and never asks again. Your agent has no
`scamp_*` tools, with nothing to say why. Scamp detects this and turns
its MCP indicator amber. To get the prompt back, run the following
command in the project folder, and then restart `claude` and approve:

```bash
claude mcp reset-project-choices
```

### What the agent can ask

| Tool | Answers |
|---|---|
| `scamp_get_selected_element` | Everything about what's selected: class, tag, parent, children, and styles |
| `scamp_get_element_by_id` | The same, for any element by ID, on the open page or any view or component |
| `scamp_get_element_tree` | The structure of the open page or any view or component: IDs, tags, and classes, without styles |
| `scamp_get_active_page` | Which page or component is open, and its file paths |
| `scamp_list_pages` | Every page in the project |
| `scamp_list_components` | Every [component](components.md) and its files |
| `scamp_get_component_scaffold` | The exact starter files for a new [component](components.md), so the agent creates real components instead of a page of examples |
| `scamp_get_view_props` | The exact props type and sample data of a view or component, so the code that renders it passes the right shape |
| `scamp_check_view` | What a page, view, or component lost on the way into Scamp, the same problems the **Checks** section lists |
| `scamp_check_project` | The same check on every page, view, and component in the project at once |
| `scamp_list_routes` | Every route and API handler under `routes/` in a Scamp framework project, with its URL and render mode |
| `scamp_get_recent_edits` | What you've changed on the canvas since the agent last looked, as the lines each save rewrote |
| `scamp_get_theme_tokens` | Your [design tokens](design-tokens.md), so the agent uses a token instead of a raw hex value |
| `scamp_get_canvas_state` | A broad snapshot; large, and capped |
| `scamp_find_overflow` | What overflows on a page or component, measured on a rendered copy: elements past the page edge or outside their parent, and text wider than its box |
| `scamp_get_react_source` | For a project made with **Import a React app**, the app's source code behind an imported element |

In practice, you talk normally. Select a button, and then type "make
this wider". The agent calls `scamp_get_selected_element` and knows what
"this" is.

### Where the connection details live

`.scamp/mcp.json` inside your project holds the server's URL and an
access token. Scamp adds every file it writes to your `.gitignore`. The
token is specific to your machine, so committing it would leak it and
give your teammates a dead address.

The server starts when you open a project and stops when Scamp quits.

## The context file

Scamp keeps `.scamp/context.md` up to date with whatever is selected:
the open page or component, the element's class and tag, its current
styles, its children, and its ancestor chain.

It's a snapshot written on each selection, so it's a good fallback when
Scamp is closed or the agent doesn't support MCP. When both are
available, the MCP tools are better: they read the canvas at the moment
of asking, whereas the file reflects your last interaction.

`agent.md` tells agents to read it, so most pick it up without being
asked. Don't edit it; Scamp rewrites it constantly.

## Copy context

Sometimes you want to paste a description into a prompt.

Right-click an element on the canvas and select **Copy context for
agent**, or press **Cmd/Ctrl+Shift+C**. You get one line on your
clipboard:

```
Context: app/page.tsx → .rect_a1b2 (div, flex row, gap 16px, 400×300px).
2 children: .rect_c3d4 (div), .text_e5f6 (p "Sign up"). Full styles in
app/page.module.css.
```

Paste it in front of your question, and the agent knows exactly which
element you mean.

Right-clicking always selects the element first, so the copied text
always matches what the properties panel shows. With nothing selected,
the keyboard shortcut copies a page-level summary instead, which is
useful when you're asking about the whole layout.

## Which one to use

| Situation | Use |
|---|---|
| The agent supports MCP, and Scamp is open | **MCP tools**, which are always current |
| The agent can't use MCP, or Scamp is closed | **The context file** |
| You're writing a prompt by hand | **Copy context** |

## The Scamp Agent or an outside agent

The [Scamp Agent](scamp-agent.md) works inside Scamp, and an outside
agent works through the MCP server. They read your design through the
same tools, but they change it differently:

| | Scamp Agent | Outside agent through MCP |
|---|---|---|
| **How it edits** | Through Scamp's own edit tools, the same way the properties panel does | Writes your project's `.tsx` and `.module.css` files, and the canvas reloads |
| **Before big changes** | Shows you the list and waits for **Apply changes** | Depends on the agent |
| **Undo** | **Cmd+Z** for one request; **Undo AI changes** for the whole conversation | Your snapshots, or the agent's version control |
| **Cost** | Your Anthropic API key, billed per token | Whatever plan the agent runs on |

The MCP server only reads. It doesn't offer the Scamp Agent's edit tools,
so an outside agent changes your design by editing files.

## Is it working?

Open the [terminal](terminal.md) panel. When the server is running, an
**MCP** indicator appears in the panel header. The dot tells you more
than "running":

| Dot | Meaning | What to do |
|---|---|---|
| **Gray** | Running, but no agent has connected yet | Nothing, if you haven't started one. If your agent is open and has no `scamp_*` tools, approve the server there. |
| **Green** | An agent has connected this session | Nothing; it's working. |
| **Amber** | An agent has this server disabled for this project because you declined its prompt | Click the copy button; it now copies `claude mcp reset-project-choices`. Run it in the project folder, restart the agent, and approve. |

The tooltip spells out the current state and lists which agent configs
Scamp registered. The copy button gives you the connect command in the
gray and green states, and the reset command in amber.

If the indicator is absent, no project is open or the server didn't
start.

## Related pages

- [Scamp Agent](scamp-agent.md): The agent built into Scamp
- [Bidirectional sync](bidirectional-sync.md): How Scamp and an agent
  share files without overwriting each other
- [DESIGN.md](design-md.md): The design-system document agents read for
  tokens and usage guidance
- [Terminal](terminal.md): Running an agent inside Scamp
