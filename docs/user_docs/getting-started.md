# Get started

## Install Scamp

Scamp requires macOS 13 (Ventura) or later, Windows 10 or later, or a
64-bit Linux desktop.

1. Download the Scamp installer for your platform.
2. Run the installer and follow the prompts.
3. Open Scamp from your Applications folder (macOS) or Start menu (Windows).

## The start screen

When you open Scamp, the start screen has two areas:

- **Sidebar**: The **New Project** button, navigation, a link to
  Settings, and an [account panel](accounts.md) at the bottom. Signing
  in is optional; Scamp works fully without it.
- **Projects**: A card for each project you've opened before, showing a
  picture of its home page. Click a card to reopen the project. Folder
  names appear the way you'd read them, so `my-portfolio` appears as
  "My Portfolio"; hold the pointer over a card to see the folder name on
  disk.

The folder icon beside the **Projects** heading is your default projects
folder. Hold the pointer over it to see its path, or click it to choose
a different folder. You can also change or clear the folder in
[Settings](settings.md).

## Create your first project

1. In the sidebar, click **New Project**. New projects use the Scamp
   framework structure; see [Views](views.md).
2. Enter a project name. Scamp creates a folder with that name inside
   your default projects folder.
3. The project opens with a blank canvas and one page named `home`.

## Take the tutorial

The first time you open Scamp, after you choose a default projects
folder, Scamp offers a short tutorial.

1. Click **Take the tutorial**. Scamp creates a project named
   `scamp-tutorial` in your default folder and opens it with the
   **Learn** checklist in the sidebar.
2. Follow each lesson. A lesson is checked off when you do it, however
   you do it:
   - **Draw, and it's code**: draw a rectangle.
   - **Lay it out**: group two elements into a flex container.
   - **The code is the design**: change a value in the CSS editor or in
     the `.module.css` file.
   - **Make it reusable**: create a component and place it on the page.
   - **Use your tokens**: set a color from your theme's tokens.
   - **Work with an agent** (optional): have the Scamp Agent or your own
     agent change the page.

To skip the tutorial, click **Skip**. To start it later, or to start
over in a new project, go to **Settings**, and then in the **Tutorial**
section, click **Start the tutorial**. To hide the checklist, click
**Hide Learn** at the bottom of it.

## The project folder

Scamp stores projects in a default folder that you can change in
[Settings](settings.md). A new project runs on the
[Scamp framework](scamp-framework.md), and its folder contains the
following:

- `views/Home/`: The TSX and CSS Module for your first page
- `routes/index.tsx`: The logic that puts that page at `/`
- `design/theme.css`: Your project's [theme tokens](themes.md)
- `agent.md`: Instructions for AI coding agents (see
  [Bidirectional sync](bidirectional-sync.md))
- `package.json`: The project's dependencies and scripts

These files are real, editable code. Open them in any editor, and your
changes sync back to the canvas.

## Next steps

- Learn what a project is made of in
  [The Scamp framework](scamp-framework.md).
- Learn how to [draw on the canvas](canvas.md).
- Explore the [properties panel](properties-panel.md).
- Read about [bidirectional sync](bidirectional-sync.md) to understand
  what makes Scamp different.
