# Built-in agent vs. MCP server

Scamp offers two ways for an AI agent to work on a project:

- **The built-in Scamp Agent** — the chat in the Agent panel, running
  Claude on the user's own API key. Its harness lives in
  `src/main/agent/`.
- **The MCP server** — for an agent outside Scamp (Claude Code in a
  terminal, for example). Tools in `src/main/mcp/tools.ts`, answered in
  `src/renderer/src/syncBridge/mcpResponder.ts`.

They share the read tools: the built-in agent is offered the MCP server's
own descriptors (`agentToolsFrom` in `src/main/agent/agentTools.ts`), so
the two never describe the canvas differently. The difference is in how
each one changes the design.

Keep this note current when a tool is added to either side.

## Tools

✅ available · — not available

### Read

| Tool | What it answers | Built-in | MCP |
|---|---|:-:|:-:|
| `scamp_get_active_page` | The page, view, or component open on the canvas, and its files | ✅ | ✅ |
| `scamp_get_selected_element` | Everything about the selection: class, tag, parent, children, styles | ✅ | ✅ |
| `scamp_get_element_by_id` | The same, for any element; `view` reads one that isn't open | ✅ | ✅ |
| `scamp_get_element_tree` | Structure without styles; `view` reads one that isn't open | ✅ | ✅ |
| `scamp_get_canvas_state` | A broad snapshot of the open page, capped | ✅ | ✅ |
| `scamp_list_pages` | Every page and view, with its files | ✅ | ✅ |
| `scamp_list_components` | Every component, with its files | ✅ | ✅ |
| `scamp_get_view_props` | A view or component's props type and sample data | ✅ | ✅ |
| `scamp_check_view` | What a view lost on the way in: opaque bindings, unreadable values, undeclared tokens | ✅ | ✅ |
| `scamp_list_routes` | Routes and API handlers under `routes/` | ✅ | ✅ |
| `scamp_list_import_sources` | Imported pages whose originals Scamp kept | ✅ | ✅ |
| `scamp_get_import_source` | An imported page's original HTML or CSS | ✅ | ✅ |
| `scamp_get_recent_edits` | What the user changed since the agent last looked | ✅ | ✅ |
| `scamp_get_conventions` | The project's rules, by section | ✅ | ✅ |
| `scamp_get_theme_tokens` | The design tokens in `theme.css` | ✅ | ✅ |
| `scamp_get_component_scaffold` | Starter files for a new component, to write to disk | — | ✅ |
| `scamp_get_react_source` | The React source an imported element came from | ✅ | ✅ |
| `scamp_find_overflow` | What overflows on a view, measured on a rendered copy of it | ✅ | ✅ |

The scaffold tool is MCP-only because it hands back files to write, and
the built-in agent never writes files — it extracts components with
`scamp_extract_component` instead.

`scamp_get_react_source` and `scamp_find_overflow` are answered in main
(`canvasToolInvoker` in `src/main/canvasQueries.ts`): the source from the
import record on disk, the overflow by asking the renderer to build the
view's export and laying it out in a hidden window. With no `view`, the
overflow check measures the conversation's view for the built-in agent
and the open one over MCP. It measures saved files for everything not on
the canvas, so an MCP agent should write its edits before calling it.

### Edit

| Tool | What it does | Built-in | MCP |
|---|---|:-:|:-:|
| `scamp_set_styles` | Set and remove CSS declarations, per breakpoint | ✅ | — |
| `scamp_add_element` | Add a container or text element | ✅ | — |
| `scamp_set_text` | Replace a text element's words | ✅ | — |
| `scamp_set_tag` | Change an element's HTML tag | ✅ | — |
| `scamp_set_attributes` | Set or remove HTML attributes | ✅ | — |
| `scamp_move_element` | Move an element to another parent or position | ✅ | — |
| `scamp_wrap_elements` | Wrap siblings in a new container | ✅ | — |
| `scamp_delete_element` | Delete an element and its children | ✅ | — |
| `scamp_extract_component` | Turn a container into a component, and look-alikes into instances | ✅ | — |
| `scamp_use_component` | Replace a container with an instance of an existing component | ✅ | — |
| `scamp_set_theme_tokens` | Add or change tokens in `theme.css` | ✅ | — |
| `scamp_set_show` | Show an element only when a boolean prop is true | ✅ | — |
| `scamp_rename_list` | Rename a repeated list, its row variable, and its fields | ✅ | — |

Every edit tool except `scamp_set_theme_tokens` takes `view`, so the
built-in agent can edit any view or component, not only the open one
(see [agent-whole-project.md](agent-whole-project.md)).

## How each one changes the design

| | Built-in agent | MCP agent |
|---|---|---|
| **How it edits** | Edit tools, through Scamp's own generate → parse round trip | Writes the `.tsx` and `.module.css` files itself |
| **How the canvas updates** | The open view's edits land in the store; other views are written through the save path's incremental patch | The file watcher reloads the canvas when a file it shows changes |
| **Checked as it goes** | Each edit's result lists what changed, values the panel can't edit, and Scamp's checks on the touched elements | Only if the agent calls `scamp_check_view` |
| **Asks before** | Any delete, component, or theme change, and more than five edits in one reply (unless a skill's plan was approved) | Whatever the agent's own client asks |
| **Undo** | One Cmd+Z per turn on the open view; **Undo AI changes** restores the snapshot taken before the conversation's first edit | The project's history snapshots, or the agent's own version control |
| **Skills** | Import cleanup and React import cleanup: their own instructions, tools, and plan → approve → apply flow | — |
| **Conversation** | One per view or component, saved in `.scamp/agent-history/` | Lives in the external agent |
| **Model and cost** | Claude Opus 5.5 on the user's API key, billed per token | Whatever the external agent runs, on its own plan |
| **Setup** | Add an API key in the Agent panel | Point the agent at the MCP server and approve it once (see `docs/user_docs/ai-agents.md`) |

## Why MCP is read-only

Decision 3 of [the built-in agent plan](../plans/builtin-agent-plan.md):
write tools are for the built-in agent only for now. An agent writing
files directly skips the round-trip check, the confirmations, and the
one-step undo. Exposing the edit tools over MCP is a reasonable next step,
and they would need the same guards.
