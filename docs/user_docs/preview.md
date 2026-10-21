# Preview mode

Open your project in a real browser preview window powered by Next.js.
Real React, real CSS Modules, and real hot module reload: every
transition, animation, hover state, link, and form input behaves exactly
as it does in production.

## Open the preview

In the project toolbar, click **▶ Preview** (top right, between the
Terminal toggle and the Save indicator), or press **Cmd+P** or
**Ctrl+P**.

A new window opens at the current page. The first time you preview a
project, Scamp runs `npm install` automatically. This one-time setup
usually takes 30–90 seconds. Later opens reuse `node_modules` and start
the dev server in a second or two.

A [view](views.md) previews at its page's route, through the wrapper
page. In a Scamp framework project, the preview runs `scamp dev` instead
of `next dev` and opens the view at `/_views/[Name]`. Previewing while
you edit a component opens it on its own at `/_components/[Name]`, with
its default values, so you can try its
[interactions](components.md#change-a-variant-on-hover-or-click).

The preview requires the Next.js project format. In legacy-format
projects, the **Preview** button is disabled, and its tooltip points to
the migration banner. For the migration flow, see
[Bidirectional sync](bidirectional-sync.md).

## How the preview works

Scamp spawns a real `next dev` server that points at your project
folder—the same files you edit on the canvas—and serves them at
`localhost:<port>`. The preview window embeds that URL in a webview, so
what you see is the actual page, not a screenshot or a simulation.

As a result:

- Hot module reload (HMR) picks up canvas edits in milliseconds. Edit a
  button's color in Scamp, and it updates in the preview window without
  a reload.
- Real interactions work: hover, focus, click, transitions, animations,
  links, and forms.
- Your project is a standalone, runnable app. Run `npm run dev` from a
  terminal outside Scamp to get the same preview.

## The preview toolbar

```
[ ← ]  [ → ]  [ ↺ ]  [  http://localhost:3001/about  ]  [ ⧉ ]  [ status ]  [ ⚙ ]  [ Mobile · Tablet · Desktop · Fullscreen · custom ]
```

| Control | What it does |
|---|---|
| **←** and **→** | Navigate the browser history (back and forward) |
| **↺** | Reload the page, or restart the dev server if it crashed |
| URL bar | Read-only display of the current page URL |
| **⧉** | Copy the URL to the clipboard |
| Status chip | Shows **Idle**, **Installing…**, **Starting…**, **Ready**, or **Crashed** |
| **⚙** | Open the browser DevTools attached to the preview |
| Viewport selector | Resize the preview to common widths |

### Viewport sizes

The viewport selector pins the preview content to a specific width:

- **Mobile**: 390 px
- **Tablet**: 768 px
- **Desktop**: 1440 px
- **Fullscreen**: Fills the preview window
- **Custom**: Any pixel value you type

The preview window itself stays the same size; the viewport sits inside
it, centered, to simulate that screen size. Use it to verify responsive
[breakpoints](breakpoints.md) at the exact widths your CSS targets.

## Server lifecycle

| State | What's happening |
|---|---|
| **Idle** | No server is running. The preview hasn't started yet. |
| **Installing…** | The first-time `npm install` is running. A spinner shows progress. |
| **Starting…** | `next dev` is starting, which usually takes 2–5 seconds. |
| **Ready** | The server is up. The preview shows the live page. |
| **Crashed** | The dev server exited unexpectedly. A **Restart** button replaces the reload button; click it to start a fresh server. |

One server runs per project at a time. Closing the preview window leaves
the server running until you close the project, so reopening the
preview is immediate. Closing the project stops the server.

## External links

Links inside the preview that navigate within your project, such as
`<a href="/dashboard">`, work like normal browser navigation, with back
and forward through the toolbar history. Links to external URLs
(`https://...`, `mailto:`, and `tel:`) open in your system browser
rather than inside the preview window. The preview is scoped to your
project; external destinations belong elsewhere.

This routing happens automatically. For how to set up internal and
external links, see [Links between pages](linking.md).

## DevTools

In the preview toolbar, click **⚙** to open Chrome DevTools attached to
the preview's webview. Inspect the live DOM, debug network requests,
profile performance—everything you expect from a browser debugger.

## Errors

If your TSX has a syntax error, the Next.js error overlay takes over the
preview area with a stack trace that points at the file and line. Fix
the error in your file or in the [properties panel](properties-panel.md),
and the preview hot-reloads automatically.

If the dev server fails to start—because of a port collision, a broken
`package.json`, and so on—the preview shows the **Crashed** state with
the recent log output and a **Restart** button.

## What the preview doesn't include

- The canvas's selection chrome and overlays.
- Scamp's panel chrome.
- Mock data substitution. This is planned: pages are expected to accept
  a `[page-name].data.json` sibling for design-time content.

## Tips

- **Cmd+P** opens the preview. If the preview is already open, **Cmd+P**
  focuses the existing window; it never opens a duplicate.
- The preview window remembers its position and size between sessions.
- For the closest match between the canvas and the preview, make sure
  your project's `theme.css` has the generated browser reset block. It
  keeps margins and form chrome consistent across the two surfaces. See
  [Themes](themes.md).
- If the preview is blank but the page has content, check that
  `--font-sans` and the box-sizing reset are in `theme.css`. Older
  projects pick these up on the next open through auto-migration.
