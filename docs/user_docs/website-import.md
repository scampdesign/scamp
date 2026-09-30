# Import a page from the web

Import reads a live web page and turns it into a
[view](views.md) in your project: real elements on the canvas, real TSX
and CSS Module files on disk, editable like anything you drew yourself.

Use it to start from a design that already exists—a page you're
redesigning, a layout you want to take apart, or your own site brought
into Scamp so you can work on it.

An import is a translation, not a copy. Scamp's model is far smaller
than a browser's, so some things change shape on the way in and a few
can't come at all. Every import ends with a report that says which.

**Caution:** A page you import is someone's work. Import it to study a
design, to rebuild your own site, or to work on a page you have the
rights to—not to republish someone else's.

## Import a page

1. In the **Pages** sidebar, click **↧ Import a page…**. A browser
   window opens.
1. In the address bar, type or paste a URL and press **Enter**. You can
   type a bare host, such as `stripe.com`.
1. Navigate to the page you want. Use the page's own links, or the
   back, forward, and reload buttons.
1. Click **Import**.

Scamp reads the page as it appears on screen, then reads it again at
each of your project's narrower [breakpoints](breakpoints.md), which is
what gives the view its responsive overrides. Reading takes a few
seconds per width, and the button says which width it's on.

When it finishes, Scamp brings the main window forward with the new view
open on the canvas, listed under **Pages** by its route slug, and with a
route that serves it. The import window stays open behind it, holding
the report—switch back to read what changed, or to import the next page.

**Note:** Scamp reads the page as it is *at that moment*. Content behind
a cookie banner, a login, or a tab you haven't clicked isn't there to be
read—dismiss it, sign in, or open it first. Scamp does scroll the page
before reading, so content that fades in on scroll is captured.

## What Scamp brings across

**The page's own names.** Where a class reads like a name, the element
takes it: `hero`, `nav_links`, `badge`. Hashed and utility classes, such
as `px-4` and `css-182dboe`, are skipped, and the element falls back to
a name from its type.

**Layout as layout.** A page built in block flow becomes flex columns,
and a grid measured in pixels becomes fractions, so the design still
reflows when you resize it. Sizes Scamp measured are replaced with fill
wherever a fixed number would freeze the layout.

**Images.** Every image, including CSS background images, is downloaded
into the project, so the view doesn't depend on the original site
staying up. An image that fails to download is named in the report.

**Fonts.** Scamp works out which families the page uses and answers each
one separately: a family already installed on your machine is used as-is,
a family on Google Fonts gets one `@import` line in the project's
`theme.css`, and a licensed face that only the original site serves is
named in the report so you can install it. See
[Typography](typography.md).

**Colors, exactly as the page wrote them.** An import writes literal
color values and doesn't create theme tokens. Deciding which colors your
project should share is a design decision, and it's yours to make
against a design you can see — see [Design system](design-system.md) for
turning values into tokens afterwards.

**Inline markup.** A link or a bold run inside a sentence stays part of
that sentence, rather than being broken into separate elements. A word
the page styled differently — a colored word in a heading, say — arrives
as a styled run inside the same text element, so the sentence stays one
element you can edit as a sentence. See
[Style part of a text element](typography.md#style-part-of-a-text-element).

## The import report

The banner across the top of the import window says what was imported
and how many elements it came to. Click **What changed** to open the
report. Because Scamp brings the main window forward when an import
lands, switch back to the import window to read it.

Entries are grouped, counted, and sorted so the losses come first:

- **`!` a loss.** Something didn't come across, and you might need to
  rebuild it. A `<canvas>` drawn by script, an embedded frame, a web
  component Scamp couldn't read into.
- **`·` a translation.** Something changed shape but nothing changed on
  screen. A block container became a flex column; a `::before` glyph
  became a real text element you can edit.

The report opens on its own whenever there's a loss in it, so a real
problem is never one click away from being missed.

## What doesn't come across

- **Tables and `display: contents`.** Scamp has no equivalent for
  either. The elements arrive, the layout doesn't.
- **`<canvas>` and `<iframe>`.** Both are drawn by something other than
  CSS—a script, or another page entirely—so they arrive empty.
- **Web components.** A closed shadow root can't be read from outside.
- **"Hidden below this width."** Scamp can apply per-breakpoint
  overrides, but it can't say an element is absent at a narrower width.
  Where the page hid something, the report says so and the element stays
  visible.
- **Inline SVG as shapes.** An icon is kept as markup, so it renders and
  keeps its color, but you can't edit its paths on the canvas.
- **Behavior.** Scripts, state, and anything that happens on a click.
  Import brings the design, not the app.

## Work on an imported view with an agent

An import is usually worth tidying, and an agent is good at it. Scamp
keeps the original page—its HTML and the stylesheets it could
read—where an agent can see it, so the question "what did this
originally do?" has an answer that isn't a guess.

Two MCP tools cover it: `scamp_list_import_sources` says which views
came from an import and from which URL, and `scamp_get_import_source`
returns the original HTML or CSS. See
[Work with AI agents](ai-agents.md).

The copy lives in a temporary folder outside the project. It's deleted
when you open a different project or quit Scamp, and it never reaches
your project folder or a commit.

## Where the files land

An imported view is an ordinary view, with no trace of where it came
from:

```
my-project/
├── views/
│   └── Pricing/
│       ├── Pricing.tsx
│       └── Pricing.module.css
├── routes/
│   └── pricing.tsx          ← Scamp framework projects
└── public/
    └── assets/              ← the page's images
```

In a Next.js project the route is a wrapper page at
`app/pricing/page.tsx` instead. Either way the view previews at its
route straight away. See [Views](views.md).

If a view has no route—which is the case for views an earlier version of
Scamp imported—open the view and click **Generate route** in the **Routes**
section of the properties panel. **Project settings** lists every route
in the project and offers the same action.
