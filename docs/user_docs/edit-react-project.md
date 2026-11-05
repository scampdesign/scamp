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
- To be signed in to Scamp, with the Scamp Agent connected. See
  [Scamp Agent](scamp-agent.md).

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
a list, the **Style** tab shows **This one** and **All**. Click **This
one** to change only the element you selected, or **All** to change the
shared definition, so every instance changes.

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

## Let the agent write your changes

Each edit you make goes to the agent after a short pause. The toolbar shows
what the agent is doing: **Thinking**, **Writing code**, or **Done**. The
agent reads your files and makes the smallest edit that produces each
change, in your project's idiom: Tailwind classes, a CSS Module, a
styled-component, or a plain stylesheet.

To collect several edits and send them together:

1. Click the **Changes** tab, and then click **Pause**.
1. Make your edits. Each one waits in the queue, and you can remove one with
   **✕**.
1. Click **Run now** to send them all as one batch, or **Resume** to go back
   to writing each edit as you make it.

While the agent works, the page keeps showing your edits. When it finishes,
the page shows your real code, reloaded.

## Review and keep changes

When the agent has written something, the **Changes** tab shows the files
it changed and their diff.

- To keep the changes, edit the commit message if you want, and then click
  **Accept**. Scamp commits only the files the agent changed. Your own
  uncommitted changes in other files stay uncommitted.
- To throw the changes away, click **Discard**. Scamp puts those files back
  as they were, and deletes any file the agent created.
- To undo a change you already accepted, find it under **Scamp's commits**,
  and click **Revert**.

## Work with branches and GitHub

The **Changes** tab also has git actions:

- **Switch branch:** select a branch from the list. Accept or discard the
  agent's changes first.
- **Create:** type a name and click **Create** to start a new branch.
- **Push** and **Pull:** send your branch to GitHub, or get its latest
  changes. These need a remote named `origin`. **Pull** only fast-forwards,
  so it never creates a merge commit.

## Check your project's design

On the **Checks** tab, click **Run design check**. The agent reads your
whole project and reports, with a file and line for each finding:

- One-off colors, sizes, or spacing where your project has a token.
- Accessibility problems, such as low contrast, missing labels or alt text,
  or missing focus styles.
- Values off your spacing or type scale.
- The same styles written in several places.

The check doesn't change any files.
