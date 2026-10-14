# Settings

Scamp has two kinds of settings:

- **App settings** apply to every project. Change them from the Settings
  icon on the start screen.
- **Project settings** apply to one project and are stored in
  `scamp.config.json` at the project root. Change them from the
  **Settings** icon in the left sidebar rail while a project is open.

## App settings

### Default projects folder

Choose where Scamp creates new projects. Scamp stores every new project
as a subfolder of this directory. You can change the folder at any time;
existing projects aren't moved.

### Privacy

**Send anonymous crash reports and usage counts**: Scamp asks once, on
first launch, and sends nothing unless you agree. You can change your
choice here at any time. The change takes effect immediately, without a
restart.

When the setting is on, Scamp sends crash reports and a once-per-session
ping that counts active installations. That includes the following:

- **A random ID generated on your machine**, stored in Scamp's own
  settings. It identifies this installation, not you. It isn't derived
  from your name, email address, IP address, hostname, or anything else
  about your computer.
- **No project data.** Your files, page contents, image assets, and
  project names are never sent.

Turning the setting **Off** stops the sending and deletes the random ID.
If you turn it back on later, Scamp generates a new ID; there's no way
to connect the two.

## Project settings

### Artboard background color

Set the color of the area behind the canvas—the background you see when
you zoom out or around the edges of your design. It doesn't affect
generated code; it's a visual preference for this project's workspace.

### Framework

In a Scamp-framework project, **Framework** shows the version of
`scampjs` the project has installed. When npm has a newer release that
your version of Scamp supports, the version line says so and an
**Update** button appears.

To update, click **Update**. Scamp runs `npm install` in the project
and, if the preview is open, restarts it. If you run the project's dev
server yourself, restart it to pick up the new version.

Scamp only offers releases it can read and write. If a newer `scampjs`
needs a newer Scamp, update Scamp first.

### Breakpoints

The responsive breakpoints for this project. Default: Desktop (1440),
Tablet (768), and Mobile (390).

For each breakpoint, you can edit the following:

- **Label**: The name shown in the canvas size control, such as
  "Tablet".
- **Width**: The `max-width` value used in generated `@media` queries.

To add a breakpoint, click **+ Add breakpoint**. You can delete any
breakpoint except Desktop, which is the base and can't be removed.

Scamp keeps breakpoints sorted widest-first, so the CSS cascade stays
predictable.

For the full responsive workflow, see [Breakpoints](breakpoints.md).

### Fonts

Manage the Google Fonts imports for this project. See
[Typography](typography.md).

## Tips

- Choose a neutral artboard color that contrasts with your design, so
  element boundaries are easy to see.
- Keep your projects folder somewhere accessible, especially if you plan
  to use [external editors or AI agents](bidirectional-sync.md).
- Match your project's breakpoints to the ones you use in production.
  The defaults are sensible, but you can simplify or extend them.
