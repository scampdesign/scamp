# Scamp Agent

The Scamp Agent is an AI assistant built into Scamp. You describe a change
in the **Agent** panel, and the agent reads your design, makes the change
on the canvas, and saves it to your files the same way your own edits are
saved. It can work on the page you have open or across the whole project.

The Scamp Agent is in beta. It runs Claude on your own Anthropic account,
so Anthropic bills you for what it uses.

**Note:** If you use an AI agent outside Scamp, such as Claude Code in a
terminal, see [Work with AI agents](ai-agents.md). That page also explains
how the two compare.

## Before you begin

- Sign in to a Scamp account. The **Agent** panel appears in the sidebar
  only when you're signed in. See [Accounts](accounts.md).
- Get a Claude API key. In the Claude Console at
  [console.anthropic.com](https://console.anthropic.com), create a key and
  make sure your account has credit.

## Connect your API key

1. In the sidebar, click **Agent**.
2. In **Claude API key**, paste your key.
3. Click **Connect**.

Scamp checks the key with Anthropic before it saves it. The key is stored
encrypted on your computer and is never shown again or sent anywhere but
Anthropic.

To change or remove the key later, go to **Settings > AI provider** and
click **Disconnect**.

## Ask the agent for a change

1. Open the page, view, or component you want to work on.
2. In the **Agent** panel, type what you want in the message box, for
   example `Make the cards in this grid the same height`.
3. Press **Enter**.

The agent reads the design first, then edits. Each change it makes appears
in its reply as it happens, with what it changed. When it finishes, it
says in a sentence or two what it did.

To stop the agent partway through, click **Stop**.

### Choose what the agent considers

The list above the message box sets the scope of your request:

| Option | The agent looks at |
|---|---|
| **Selection** | The element you have selected |
| **Whole page** | The page that's open |
| **Whole project** | Every page, view, and component in the project |

You don't need **Whole project** to name another page. You can say
`Change the heading on the About page`, and the agent finds it.

### What the agent can change

The agent can do most of what you can do in the properties panel:

- Set and remove styles, including at a breakpoint
- Add, move, wrap, and delete elements
- Change text, HTML tags, and attributes
- Turn a repeated design into a [component](components.md), and replace
  matching elements on other pages with an instance of it
- Add or change theme tokens in `theme.css`
- Show an element only when a condition is true, and rename a repeated
  list

It can also measure a page in a browser to find what overflows: content
past the edge of the page, outside its container, or cut off. Ask
something like `Find what overflows on every page and fix it`.

## Review changes before they apply

For some changes, the agent stops and shows you a list of what it wants
to do. Click **Apply changes** to go ahead, or **Cancel** to stop. If you
cancel, the agent asks what you'd like instead.

The agent always asks before it does any of these:

- Deletes an element
- Creates a component or replaces elements with one
- Changes theme tokens
- Makes more than five changes in one step

A change on a page that isn't open says which page, for example
`Delete skip_c3d4 and everything inside it (in Settings)`.

## Undo the agent's changes

There are two ways to undo, depending on how much you want to undo:

- **One request, on the page you have open:** press **Cmd+Z**
  (**Ctrl+Z** on Windows and Linux). Everything the agent did for one
  message undoes in one step.
- **Everything in the conversation, on every page:** click
  **Undo AI changes** at the top of the panel, then click
  **Undo changes**. Your pages, components, theme, and `DESIGN.md` go
  back to how they were before the agent's first edit in this
  conversation.

**Caution:** Changes the agent made to pages you don't have open aren't
in those pages' Cmd+Z history. Use **Undo AI changes** to undo them.

Before its first edit in a conversation, Scamp also saves a snapshot of
the project, labeled **Before Scamp Agent** in the **History** panel. See
[Snapshots](snapshots.md).

## Conversations

Each page, view, and component has its own conversation. When you open
another page, the panel shows that page's conversation, and switching
back brings the earlier one back. Conversations are saved in your project
in `.scamp/agent-history/`, so they're still there after you restart
Scamp.

A new project keeps `.scamp/agent-history/` in version control while
ignoring the rest of `.scamp/`, so if you share the project's repository,
your team sees the same conversations. In a project created before 0.9.0,
add these lines to `.gitignore` in place of `.scamp` to do the same:

```
.scamp/*
!.scamp/agent-history/
```

To start over on a page, click **New conversation**.

If you open another page while the agent is working, it finishes the
request on the original page.

## Clean up an imported page

A page imported from the web arrives with exact sizes and per-side values
that make it hard to edit. The agent can make it easier to edit without
changing how it looks. See [Import a page from the web](website-import.md).

1. After an import, in the import window, find **Clean up with AI**. You
   can also start a cleanup from the card in the **Agent** panel.
2. Choose how to handle repeated colors and sizes:
   - **Create theme tokens** names repeated values and uses them through
     `theme.css`.
   - **Keep hex values** leaves values as the page wrote them, and
     doesn't touch `theme.css`.
3. In the Scamp window, read the agent's plan. To change it, reply with
   what you want instead.
4. Click **Apply this plan**.

When the cleanup is done, your next message is an ordinary request again,
with every tool available.

### Tidy up a page imported from a React app

For a page imported with **Import a React app**, click **Tidy up with AI**
in the **Agent** panel. The agent reads the app's source to find which
elements the app shows only some of the time and what it calls its lists.
It then adds those conditions and names, without changing how the page
looks.

## Copy a reply

To copy what the agent said, click **Copy reply** at the bottom of its
reply, next to the token count.

## Cost and your data

The agent runs on Claude Opus through your Anthropic account. Anthropic
bills you per token: what the agent reads, what it writes, and its
reasoning. The panel shows how many tokens each reply used. A large page
or a request across many pages uses more.

When you send a message, Scamp sends Anthropic your message and what the
agent asks to read: your design's structure and styles, theme tokens, and
for an imported page, the page's original HTML and CSS or the React app's
source. Your API key goes only to Anthropic.

## Troubleshooting

**The Agent panel isn't in the sidebar.**
Sign in to your Scamp account. See [Accounts](accounts.md).

**The panel says "Anthropic no longer accepts your key".**
The key was revoked or expired. Create a new key in the Claude Console and
connect it.

**A reply ends with an error about credit.**
Add credit to your Anthropic account in the Claude Console.

**A reply ends with "Anthropic couldn't accept this conversation".**
Click **New conversation** and send your request again.

## Related pages

- [Work with AI agents](ai-agents.md)
- [Import a page from the web](website-import.md)
- [Components](components.md)
- [Snapshots](snapshots.md)
- [Undo, redo, and history](undo-redo.md)
