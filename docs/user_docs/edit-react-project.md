# Edit an existing React project

You can restyle a React app you already have, in place, with the Scamp
panel. Scamp runs the app, you select elements on the running page and
style them, and the Scamp Agent writes each change into your source
files, in the way your project already writes styles. Every change is
made on its own git branch, so you can review it and undo it.

This works with Vite + React and Next.js projects. Create React App isn't
supported yet.

**Note:** Edit React Project is in early access. If you don't see **Edit
React Project** on the start screen, it isn't switched on for your account
yet.

## Before you start

You need the following:

- A Vite + React or Next.js project on your computer.
- Git, with your name and email set in `git config`.
- Node.js, at the version your project asks for.
- To be signed in to Scamp.
- An agent to write your changes: the Scamp Agent, with an Anthropic API
  key (see [Scamp Agent](scamp-agent.md)), or an agent you already use,
  such as Claude Code. See [Use your own agent](#use-your-own-agent).

## Open a project

1. On the start screen, click **Edit React Project**. A new window opens.
1. Click **Choose project folder**, and select the folder that holds your
   project's `package.json`. To open a project you opened before, click it
   under **Recent** instead.
1. Read the setup screen. It lists what Scamp checked and what it will do
   when you start:
   - **Accounts:** whether you're signed in, whether the agent is
     connected, and whether git is ready.
   - **Environment:** your Node.js version, the package manager, the
     bundler, and anything that may be missing, such as an env file or a
     backend the app calls.
   - **What Scamp will do:** install packages if they're missing, create a
     `scamp/` branch, and run your app with element mapping turned on.
1. If a row shows a fix, such as **Sign in**, **Connect**, or **Initialize
   git**, use it, and then click **Check again**.
1. Click **Start**.

Scamp creates a branch named after the date and time, such as
`scamp/2026-11-03-1430`, and starts your app's dev server. Your main
branch isn't changed.

**Note:** To map elements to their source in a Vite project, Scamp runs
Vite with a config file of its own, in a `.scamp/` folder inside your
project. That file loads your own `vite.config` and adds one plugin. The
`.scamp/` folder is kept out of git, and Scamp doesn't change your config
or your `package.json`. A Next.js project runs with its own dev script,
and Scamp writes nothing to it: it finds each element's file from React's
debug information and the dev server's source maps. While it looks, the
**Style** tab shows **Finding source…**.

## Style an element

1. In the toolbar, make sure **Edit** is on.
1. On the running page, click an element. Scamp outlines it, and the
   **Style** tab shows its tag, the file and line where it's written, and
   the Scamp panel.
1. Change its styles in the panel. The page updates at once.

When the same line of JSX draws more than one element, such as a card in
a list, the **Style** tab shows two buttons. When the elements are
instances of a component, the buttons name it: **This Card** and **Every
Card · 3**, with how many are on this page.

- **This Card** changes only the instance you selected. The agent changes
  it where that card is used. If every card comes from one list, the
  agent picks this one out by its place or its data in the list, or says
  it can't.
- **Every Card** changes the component itself, so every card changes,
  on this page and on any other page that uses it.

For a list inside one component, the buttons read **This one** and
**All**. Hold the pointer over a button to see what it changes.

The panel shows each value as your code writes it where Scamp can read
it: `auto`, `50%`, `1.5rem`, or a token such as `var(--accent)`, rather
than the pixels the browser works out. The token pickers offer your app's
own design tokens, the custom properties it sets on `:root`. When you pick
one, the agent writes the token, not its value.

To see the code behind the selection, open **Code** at the bottom of the
**Style** tab. It shows the element's JSX and every CSS rule that styles
it, read-only.

### Select more than one element

Hold Shift or Cmd and click more elements on the page. Each edit you make
then reaches all of them, and the **Style** tab says how many are
selected. The panel shows the values of the first one. Click without Shift
or Cmd to go back to one.

### Delete, duplicate, or wrap an element

At the top of the **Style** tab, next to the element's tag:

- **Duplicate** (or press Cmd+D) adds a copy right after it.
- **Wrap in a container** puts it inside a new `<div>`, with a class of its
  own, so you can style the container next.
- **Delete** (or press Delete) removes it.

The page previews each one at once: a duplicate shows its copy, a deleted
element is hidden, and a wrapped element is outlined. The agent writes it
into your code. If the element is one of a list drawn from data, the agent
can't add or remove an item that way, and says so.

If Scamp can't map an element to a line, or the element comes from a
library, you can still style it. The **Style** tab says so in a short note.
The agent gets what Scamp knows about the element (its classes, its text,
its components, and where it sits on the page) and finds it in your code.
For a library's element, it styles it from your code that uses it, and
never edits `node_modules`.

## Go to another page

Click the path field in the toolbar. The list under it shows the routes
Scamp found: your router's routes, your Next.js `app/` and `pages/` files,
and the links on each page you visit. Select a route to go there. A route
with a value to fill in, such as `/blog/[slug]`, goes into the field
instead: replace the placeholder, and then press **Enter**.

## Select from the layers tree

The **Layers** panel, on the left, shows the page's elements as a tree,
with each component's name beside the element it draws. Hold the pointer
over a row to outline that element on the page, and click a row to select
it. When you select an element on the page, the tree opens to it. To hide
the panel, in the toolbar, click **Layers**.

## Edit text, images, and links

When you select an element that has text, or an image or a link, the
**Style** tab shows a **Content** section. Change the **Text**, **Image**,
**Alt text**, or **Link** there and press **Enter**. The page shows the
change at once, and the agent writes it into your code. To use an image
from your computer, click **Choose file…** next to **Image**. Scamp copies
it into your project's `public` folder and points the image at it; when
you discard the agent's changes, the copy goes too. You can also
double-click text on the page to edit it in place; press **Enter** to keep
it or **Esc** to cancel.

Scamp only edits content that's written in your code. Under each field,
it says where the content comes from:

- **Written at:** the text or value is written in the element's JSX, or
  in a constant next to it.
- **Set where a component is used:** the element shows a prop, and its
  value is written where the component is used, such as
  `<Badge label="New" />`. The change is made there, for that use only.
- **Imported from:** an image imported as a file.
- **Can't be edited here:** the content comes from data, such as a list
  being drawn, state, or an API, so changing it would mean changing that
  data. Scamp says why. You can still style the element.

## Reorder elements

You can move an element before or after one of its siblings, in the same
parent.

- **On the page:** with **Edit** on, select the element, and then drag it.
  A blue line shows where it will go.
- **In the Layers panel:** drag a row above or below a row at the same
  level.

If the element you drag is the only one showing in its parent, such as the
title of a card or the summary of a closed `<details>`, Scamp moves the
nearest element around it that has siblings, such as the card itself.
Scamp outlines what's moving and says so. If nothing around it has
siblings, Scamp says that instead.

To select the element around the one you clicked, such as a `<details>`
that its summary covers completely, click **Select parent** at the top of
the **Style** tab.

While you drag, the page shows the element where it would land, and the
rest of the page moves out of its way, so you see the result before you let
go. After you drop it, the page keeps showing it there while the agent
writes the change. What you see is a copy of the element: it doesn't
respond to clicks in your app until the agent's change is in.

If the elements are drawn by a list, Scamp checks where the list comes
from before it queues the move:

- **Written in your code,** such as an array in the component or in a data
  file it imports: the agent reorders the items there.
- **Data,** such as state, a prop, an API, or a value your app works out
  while it runs: nothing in the code sets the order, so Scamp puts the
  element back and says why. Change the order where the data comes from.

To move an element into another parent, use the **Layers** panel: drop a
row on the middle of another row. The element goes inside it, as its last
child. The page shows it there right away, as it will look.

## Style a hover, focus, or active state

1. Select an element.
1. In the **Style** tab, click **Hover**, **Focus**, or **Active**. The page
   shows the element in that state, as if the pointer were over it, and the
   toolbar shows what Scamp is holding.
1. Change its styles in the panel. These edits style only that state; the
   agent writes them as a `:hover` rule, or with Tailwind's `hover:` prefix,
   in your project's idiom.
1. Click **Default** to go back to the element's normal styles.

## Ask the agent in your own words

Under the panel, type what you want, such as "match the primary button" or
"tighten the spacing", and click **Ask the agent**. If an element is
selected, the agent works on that element; otherwise it works on the page.

## Style a menu, popover, or tooltip

Menus and popovers close when you move the pointer away, which makes them
hard to select. To keep one open:

1. In the toolbar, turn **Edit** off, so you can use your app.
1. Open the menu, or hold the pointer over what shows the tooltip.
1. Without moving the pointer off the page, press **F8** to freeze it.
1. Turn **Edit** on, and click an element inside the menu.

Freeze holds both UI that your app opens with JavaScript and UI that CSS
`:hover` shows. While it holds a state, the toolbar shows **Holding
:hover on …**. To let go, click **Release**, or press **F8** again.

Freeze holds the whole page, not only the element under the pointer. While
the page is frozen, nothing in it reacts: pointing at an element doesn't
show its hover state, and clicks and keys don't reach your app. With
**Edit** on, you can still select and style elements. You can scroll the
page, but not areas inside it that scroll on their own.

To style an element in its normal state when the pointer would show its
hover state, click **Freeze** in the toolbar, or press **F8** with the
pointer off the page. The page freezes with nothing hovered.

## Let the agent write your changes

Each edit you make goes to the agent after a short pause. The toolbar shows
what the agent is doing: **Thinking**, **Writing code**, or **Done**. The
agent reads your files and makes the smallest edit that produces each
change, in your project's idiom: Tailwind classes, a CSS Module, a
styled-component, or a plain stylesheet.

To collect several edits and send them together:

1. Click the **Agent** tab, and then click **Pause**.
1. Make your edits. Each one waits in the queue, and you can remove one with
   **✕**.
1. Click **Run now** to send them all as one batch, or **Resume** to go back
   to writing each edit as you make it.

While the agent works, the page keeps showing your edits. When it finishes,
the page shows your real code, reloaded.

Some edits don't need the agent at all. When you change every instance of
an element styled with a CSS Module class, such as `className={styles.card}`,
in its normal state at desktop width, Scamp writes the new values into that
class's rule itself, in a moment. The conversation says when it did.

### Talk with the agent

The **Conversation** section of the **Agent** tab shows each batch the agent
took, what it said and did in reply, and an **Undo** for what each turn
wrote. To reply, type in the box under the conversation and press
**Enter**. The agent remembers the earlier turns.

The **Dev server output** under it shows what your app's dev server prints,
such as a build error after a change.

## Use your own agent

If you use Claude Code, Cursor, Gemini CLI, or Kiro, it can write your
changes instead of the Scamp Agent, signed in the way it already is. You
don't need an API key.

1. On the setup screen, click **Use my own agent instead**. Or, in the
   **Agent** tab, click **My agent**.
1. Click **Start**. Scamp connects to your agent through its MCP server
   and adds the connection to your agent's settings in the project, such
   as `.mcp.json` for Claude Code. Scamp keeps that file out of git.
1. In the **Agent** tab, under **My agent**, there's a terminal open in
   your project's folder. Click **Start Claude Code**, or start another
   agent there. If it asks whether to use the `scamp` server, allow it.
1. Click **Paste the prompt**, and press **Enter**.

You can also use your agent in a terminal of your own: open it in the
project's folder, and paste the line from **Copy**.

Your agent then waits for your edits, writes each batch, and waits for
more until you tell it to stop. The **Agent** tab shows whether it's
connected and when it's writing. You review, accept, and discard its
changes the same way.

**Note:** If your project already tracks the agent's settings file in
git, Scamp doesn't change it. The **Agent** tab shows a command to
connect Claude Code yourself instead.

## Review and keep changes

When the agent has written something, the **History** tab shows the files
it changed and their diff.

- To keep the changes, edit the commit message if you want, and then click
  **Accept**. Scamp commits only the files the agent changed. Your own
  uncommitted changes in other files stay uncommitted.
- To throw the changes away, click **Discard**. Scamp puts those files back
  as they were, and deletes any file the agent created.
- To go back to before a change you already accepted, use the
  **History**. See [Go back in the history](#go-back-in-the-history).

## The panel's tabs

The panel on the right has three tabs:

- **Style:** the selected element, its states, and the Scamp panel.
- **History:** undo and redo, the agent's changes to review and accept,
  what you've accepted, and branches.
- **Agent:** which agent writes your changes and how it connects, what's
  waiting for it, the conversation with it, the dev server's output, and
  design checks.

## Undo and redo

Press **Cmd+Z** to undo, and **Cmd+Shift+Z** to redo. On Windows and
Linux, press **Ctrl+Z** and **Ctrl+Shift+Z**. Each undo takes back one step,
newest first:

- **An edit or move still in the queue:** it leaves the queue, and the
  page drops its preview.
- **What the agent wrote:** the files it changed go back to how they were
  before. If a file changed again since, for example in your editor,
  Scamp leaves it and says which.
- **After you accept:** undo goes back a step in the history.

A short note in the toolbar says what each undo or redo did. The **History**
tab has **Undo** and **Redo** buttons too, with the steps they take, newest
first. Undo works
from anywhere in the window except a text field or the terminal, which
have their own.

## Go back in the history

The **History** tab lists each change you
accepted, oldest first, with what it changed in plain words and when.
The point the project is at now is marked.

- Click an entry to put the project back to how it was right after that
  change. Click **Session start** to go back to before every change in this
  session.
- The entries after that point dim, below **Undone**. Click one to go
  forward to it again.
- Accepting a new change from an earlier point drops the dimmed entries.

Your own uncommitted changes are kept. If one is in a file the step would
change, Scamp doesn't move, and says so. If you pushed the branch past that
point, going back would rewrite what you pushed, so Scamp offers **Revert
this change instead**, which adds a commit that undoes it.

## Edit at a tablet or phone width

In the toolbar, click **Tablet** or **Mobile** to size the app like that
device, or type a width. If your app's stylesheets have breakpoints, Scamp
lists them beside the width, so you can go straight to one. Click
**Desktop** to fill the window again.

An edit you make below desktop width applies at that width and narrower:
up to just under your project's next breakpoint. The page previews it that
way, so wider widths keep their styles. The agent writes it with your
project's own media queries or Tailwind prefixes. In the queue, such an
edit shows the width, such as `<article @390>`.

## Work with branches and GitHub

The **History** tab also has git actions:

- **Switch branch:** select a branch from the list. Accept or discard the
  agent's changes first.
- **Create:** type a name and click **Create** to start a new branch.
- **Push** and **Pull:** send your branch to GitHub, or get its latest
  changes. These need a remote named `origin`. **Pull** only fast-forwards,
  so it never creates a merge commit.

## Check your project's design

On the **Agent** tab, under **Design check**, click **Run design check**. The agent reads your
whole project and reports, with a file and line for each finding:

- One-off colors, sizes, or spacing where your project has a token.
- Accessibility problems, such as low contrast, missing labels or alt text,
  or missing focus styles.
- Values off your spacing or type scale.
- The same styles written in several places.

The check doesn't change any files.
