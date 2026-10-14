# Scamp — Feature Backlog v11

Four features for the Scamp Electron app, ordered easiest to hardest.
Sign-in comes first because cloud sync depends on it. The two import
features are independent and come last, ordered by complexity.

---

## 1. Sign in to Scamp account from the Electron app

As a Scamp user, I want to sign in to my Scamp account from inside the app so I can access cloud features without leaving the app or manually copying tokens.

Auth backend: User accounts are already built on Better Auth (email/password live today). This issue is the Electron-side sign-in flow against that existing backend. Google/GitHub one-click sign-in is added separately in SCMP-77.

Behaviour

A "Sign in" button appears in the top-right of the toolbar when the user is not signed in — subtle, never intrusive, since the local app works fully without an account

Clicking "Sign in" opens the Scamp sign-in page in the user's default browser via shell.openExternal()

The user signs in via the Scamp sign-in page (email/password today; Google/GitHub once SCMP-77 lands)

On success, the sign-in page redirects to scamp://auth/callback?token=...

The Electron app registers the scamp:// protocol handler and intercepts the callback

The JWT from the callback is stored securely using Electron's safeStorage API — never written to a plain text file

The toolbar updates to show the user's avatar and name

Sessions refresh silently in the background — the user is never asked to sign in again unless the session explicitly expires

A "Sign out" option in the user menu clears the stored token and reverts to the signed-out state

IPC channels

Channel

Direction

Payload

auth:start

renderer → main

none

auth:complete

main → renderer

{ userId, email, name }

auth:signout

renderer → main

none

auth:status

renderer → main

none

auth:status:result

main → renderer

{ signedIn, user? }

Implementation notes

Register the scamp:// protocol in electron-builder config so the OS routes the callback URL to the app

safeStorage encrypts the token using the OS keychain — Keychain on Mac, DPAPI on Windows

On first launch after sign-in, call the cloud API to confirm the Better Auth session/user record is valid

The account panel shows the user's name, email, current tier, and a sign-out button

Done when

A user can click Sign in, complete the browser flow, and return to a signed-in state in the app. The JWT is stored and used automatically on the next launch.

## 2. Sync project to Scamp cloud

**User story**

As a signed-in Pro user, I want my project files to sync to the Scamp
cloud automatically so my work is backed up and I can access it from
any machine.

**Depends on:** Story 1 (sign in) and the cloud sync API (cloud
backlog).

**Behaviour — enabling sync**

- A "Sync" toggle appears in the project settings or the account panel
  for signed-in users
- Turning it on registers the project with the cloud (creates a Project
  record) and begins syncing
- Free tier users see an upgrade prompt — cloud sync is a Pro feature
- Once enabled, sync runs automatically in the background

**Behaviour — the sync itself**

- When a project file is written to disk (the existing debounced save),
  the sync service queues a cloud upload in the background
- Sync always runs after the local write is confirmed — local first,
  cloud second, never blocking the canvas
- File contents upload directly to Cloudflare R2 via a presigned URL —
  they never pass through the API server
- Project metadata (name, last synced, page list) is written to the
  cloud database via the API
- A sync status indicator in the toolbar shows one of three states:
  - `✓ Synced` — local and cloud agree
  - `↑ Syncing` — an upload is in progress
  - `⚠ Sync paused` — no connection or an auth issue

**Behaviour — cross-machine**

- On project open, the sync service checks the server's last-synced
  timestamp against the local project's last modified time
- If the server is newer (another machine synced more recently), a
  non-blocking banner appears:
  ```
  This project was updated on another machine.
  [ Download latest ]   [ Keep local version ]
  ```
- "Download latest" fetches the current files from R2 and writes them
  locally — chokidar detects the changes and reloads the canvas
- Last-write-wins conflict resolution for the first version — no merge,
  no diff

**Sync service**

A background service in the Electron main process manages all sync. It
runs independently of the canvas and never blocks the UI:

```ts
// src/main/cloudSync.ts
export const initCloudSync = (): void => {
  // Listen for local file writes
  // Queue uploads
  // Retry failed uploads on an interval
  // Poll for remote changes on project open
};
```

**IPC channels**

| Channel | Direction | Payload |
|---|---|---|
| `sync:enable` | renderer → main | `{ projectPath }` |
| `sync:disable` | renderer → main | `{ projectId }` |
| `sync:status` | main → renderer | `{ state, lastSyncedAt }` |
| `sync:conflict` | main → renderer | `{ serverTimestamp }` |
| `sync:downloadLatest` | renderer → main | `{ projectId }` |

**Implementation notes**

- The sync service uploads changed files only, not the whole project on
  every change — track which files changed since the last sync
- Failed uploads retry silently on a 30-second interval — never
  interrupt the user
- If the app is offline, sync pauses and resumes automatically when the
  connection returns

**Done when:** Saving on machine A and opening the project on machine B
shows the updated files. The sync status indicator reflects the current
state.

---

## 3. HTML import from a URL

**User story**

As a user, I want to import a page from a URL so I can bring an existing
web page into Scamp as a starting point rather than rebuilding it from
scratch.

**Behaviour — triggering the import**

- File menu → "Import from URL" opens a dialog:
  ```
  Import from URL
  [ https://example.com/about              ]
  Import as:  ○ New page   ○ Component
  [ Import ]
  ```
- The user pastes a URL and chooses whether to import as a new page or
  a component

**What the import does**

1. The Electron main process fetches the page HTML from the URL
2. It fetches any linked stylesheets referenced in the HTML
3. It parses the DOM into a tree structure
4. It resolves computed styles for each element by matching CSS rules
   to elements
5. It translates the DOM tree into Scamp's ElementTree — divs, text,
   images, and their styles
6. It generates the TSX and CSS Module files via `generateCode`
7. The imported page or component opens on the canvas

**Translation rules**

- HTML elements map to Scamp elements: `div` → rectangle, `p`/`span`/
  `h1`-`h6` → text, `img` → image
- Inline styles and linked CSS are resolved to computed values and
  written as the element's styles
- Flexbox and grid layouts are preserved where present
- Images are downloaded and saved to `public/assets/`, references
  updated to local paths
- Class names are regenerated to Scamp's `[type]_[id]` convention —
  original class names are preserved as a data attribute for reference
- Scripts, iframes, and interactive behavior are not imported — this is
  a structural and visual import, not a functional one

**Font import**

The importer detects and brings over web fonts so imported text
renders correctly:

- **Google Fonts** — if the page links to Google Fonts (a
  `<link>` to `fonts.googleapis.com`), the importer detects the font
  families and adds the same Google Fonts import to the Scamp project,
  so the fonts render identically
- **Other linked fonts** — `@font-face` rules and linked font files
  (WOFF, WOFF2) are detected; the font files are downloaded to
  `public/assets/fonts/` and the `@font-face` rules are added to the
  project's CSS
- **System and fallback fonts** — the full `font-family` stack from the
  source is preserved, including fallbacks, so text renders the same way
  the original page intended
- Detected fonts are surfaced to the user after import:
  ```
  Imported 2 fonts:
  · Inter (Google Fonts)
  · Söhne (self-hosted, copied to assets/fonts)
  ```
- If a font cannot be imported (licensed, behind auth, or unavailable),
  the importer preserves the font-family reference and notes that the
  font may need manual setup

**Expectations and limitations**

The import is a best-effort starting point, not a pixel-perfect clone.
A notice sets this expectation before import:

```
Importing brings in the structure and styles of a page as a
starting point. Complex layouts, scripts, and interactive behavior
will not carry over perfectly. You will likely need to clean up
the result.
```

- External fonts are detected and imported where possible (see Font
  import above); fonts that are licensed or behind auth may need manual
  setup
- CSS that relies on pseudo-elements, animations, or complex selectors
  may not translate fully
- Responsive breakpoints are imported at the fetched viewport width
  only
- Very large or complex pages may produce a messy element tree that
  needs cleanup

**Import as component**

- When imported as a component, the page content becomes a single
  component in the `components/` folder rather than a page
- Useful for importing a specific UI element (a header, a card) from an
  existing site

**IPC channels**

| Channel | Direction | Payload |
|---|---|---|
| `import:url` | renderer → main | `{ url, importAs }` |
| `import:url:progress` | main → renderer | `{ step, percent }` |
| `import:url:complete` | main → renderer | `{ pageId or componentId }` |
| `import:url:error` | main → renderer | `{ message }` |

**Implementation notes**

- Fetching and parsing happen in the main process — use a headless
  approach to resolve computed styles accurately. A lightweight
  headless browser (or a DOM + CSS resolver library) gives far better
  results than parsing raw HTML strings, because computed styles depend
  on the cascade
- Consider rendering the page in an offscreen `BrowserWindow` to get
  real computed styles from the browser engine, then walking the
  rendered DOM — this is the most accurate approach and Scamp already
  has Electron's browser engine available
- The import must produce output that round-trips through `parseCode` —
  run the generated files through the parser to validate before opening

**Done when:** Pasting a URL imports the page's structure and styles as
a new page or component that opens on the canvas and round-trips
correctly.

---

## 4. Figma import

**User story**

As a user, I want to import a Figma frame as a page or component so I
can bring my Figma designs into Scamp and turn them into real code
rather than rebuilding them manually.

**Behaviour — connecting to Figma**

- File menu → "Import from Figma" opens a dialog
- First-time use prompts for a Figma personal access token with
  instructions on how to generate one (Figma settings → personal access
  tokens)
- The token is stored securely in `safeStorage`
- The user pastes a Figma file URL or frame URL:
  ```
  Import from Figma
  [ https://figma.com/file/abc123/...       ]
  Import as:  ○ New page   ○ Component
  [ Import ]
  ```

**What the import does**

1. Scamp extracts the file key and node ID from the Figma URL
2. It calls the Figma REST API to fetch the frame's node tree
3. It translates Figma's node structure into Scamp's ElementTree
4. It downloads any images and icons used in the frame
5. It generates the TSX and CSS Module files via `generateCode`
6. The imported page or component opens on the canvas

**Translation rules**

Figma's node model maps to Scamp elements as follows:

| Figma node | Scamp element |
|---|---|
| Frame with auto-layout | Rectangle with flexbox |
| Frame without auto-layout | Rectangle with absolute-positioned children |
| Rectangle / shape | Rectangle |
| Text | Text element |
| Image fill | Image |
| Group | Rectangle (container) |
| Component / instance | Scamp component |

**Auto-layout translation (the clean path)**

Figma auto-layout maps well to flexbox:
- Auto-layout direction → `flex-direction`
- Spacing between items → `gap`
- Padding → `padding`
- Alignment → `justify-content` and `align-items`

Frames using auto-layout translate cleanly and produce good flexbox
layouts.

**Absolute positioning (the hard path)**

Most Figma designs are not fully auto-layout — many elements are
absolutely positioned. For these:
- Elements are translated with absolute positioning relative to their
  parent frame
- A warning notes that absolutely positioned elements may need manual
  layout work to become responsive:
  ```
  Some elements were imported with fixed positions because they
  did not use Figma auto-layout. You may want to convert these to
  flex layouts for responsive behavior.
  ```

**Style translation**

- Fills → background color or image
- Strokes → border
- Corner radius → border-radius
- Effects (drop shadow, blur) → box-shadow, filter
- Text styles → font-family, size, weight, line-height, color
- Opacity → opacity
- Figma variables/tokens → mapped to Scamp theme tokens where a
  matching token exists, otherwise resolved to raw values

**Components**

- Figma components and instances are recognized and can be imported as
  Scamp components
- A Figma component with variants maps to a Scamp component with
  variants where possible

**Expectations and limitations**

A notice sets expectations:

```
Figma import brings in the structure, styles, and content of a
frame as a starting point. Auto-layout frames translate best.
Absolutely positioned designs will need layout cleanup. Prototyping,
interactions, and some effects will not carry over.
```

- Prototyping links and interactions are not imported
- Some Figma effects have no direct CSS equivalent and are approximated
- Complex vector shapes are imported as SVGs
- Fonts must be available in the project or set up manually

**IPC channels**

| Channel | Direction | Payload |
|---|---|---|
| `import:figma:auth` | renderer → main | `{ token }` |
| `import:figma` | renderer → main | `{ figmaUrl, importAs }` |
| `import:figma:progress` | main → renderer | `{ step, percent }` |
| `import:figma:complete` | main → renderer | `{ pageId or componentId }` |
| `import:figma:error` | main → renderer | `{ message }` |

**Implementation notes**

- The Figma REST API returns a JSON node tree — no headless browser
  needed, unlike HTML import. The complexity is in the translation
  logic, not the fetching
- The translation from Figma nodes to ElementTree is the core work and
  should be a pure, testable function: `figmaNodeToElementTree(node)`
- Start with auto-layout frames as the well-supported path, then
  improve absolute positioning handling over time
- Image and icon assets are fetched via Figma's image export API and
  saved to `public/assets/`
- The output must round-trip through `parseCode` — validate before
  opening
- A future enhancement is a Figma plugin that pushes directly to Scamp
  rather than requiring a token and URL, but the API approach is the
  right starting point

**Done when:** A user can paste a Figma frame URL, and the frame is
imported as a page or component that opens on the canvas with its
structure, styles, and content translated, and round-trips through
`parseCode`.

---

## Notes on ordering and dependencies

```
1. Sign in       — foundation for all cloud features, no dependencies
                   beyond the cloud auth setup
2. Sync          — depends on sign in and the cloud sync API
3. HTML import   — independent, best-effort, uses Electron's browser
                   engine for accurate computed styles
4. Figma import  — independent, most complex translation logic, the
                   hardest to get right
```

Sign in and sync are sequential — sync needs auth. The two import
features are independent of the cloud work and of each other, but HTML
import is simpler than Figma import because Electron's browser engine
does the heavy lifting of resolving styles, whereas Figma import
requires translating an entire proprietary node model into Scamp's
element tree by hand.

Both import features share a requirement: the generated output must
round-trip through `parseCode`. Importing is only useful if the result
is a real, editable Scamp project — not a one-way dump. Validating the
round-trip before opening the imported result is essential for both.