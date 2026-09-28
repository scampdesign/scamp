# The Scamp framework — structure, styles, and logic in separate files, on our own tooling

Status: **thought experiment, written up for review.** Nothing here is
built. It replaces the earlier views-and-logic plan and follows
`design-to-app-gap-report.md`, whose diagnosis (sections 1–4) stands.
Three decisions were settled in discussion on 2026-09-08 and are folded
in below: the canvas stays a view (no iframe), the server layer is Hono,
and rendering mode is chosen per route.

The framework repository is `scampdesign/scampjs`; its `CONTRACT.md` is
the home of the contract between the two repos. Package names were
settled there on 2026-09-10: `scampjs`, `create-scampjs`, and
`@scampjs/adapter-*` (the `@scamp` scope is held by another npm user).

## The idea, in one paragraph

A Scamp page becomes three files with one owner each — **structure**
(a view, Scamp-owned markup whose only inputs are props), **styles** (the
CSS module, Scamp-owned), and **logic** (a route file that loads data,
holds handlers, and renders the view; yours, never regenerated). Those
files run on a small framework Scamp ships and installs: Vite for the
dev server and build, Preact as the runtime, file-based routing over
`routes/`, and a `scamp` CLI. Scamp's previews use that dev server
instead of `next dev`. The framework is installable on its own, so a
project keeps working — and keeps its separation of concerns — outside
Scamp. The files stay plain JSX and CSS modules, so they also run
unchanged in Next, Remix, or any React app.

The split is the one Nue makes — content, structure, styling, logic
each in their own file, "the UNIX way." The tooling model is Astro's:
own the conventions and the build, ship a default runtime, never write
one.

## Framework means three layers, and we build one

| Layer | What it is | Decision |
|---|---|---|
| **Runtime** — VDOM, hooks, hydration, events | React, Preact, Solid | **Reuse Preact** (3 kB, `preact/compat` for React libraries). A runtime is a multi-year quality bar in a space with mature, tiny, MIT incumbents, and none of Scamp's value lives there. |
| **Conventions + tooling** — file layout, routing, dev server, build, deploy | Astro, SvelteKit, Fresh, Nue | **Build this.** Vite plus a routing plugin plus a CLI: one or two thousand lines. This is where the views/logic split, the previews, and `agent.md`-as-documentation live. |
| **The view grammar** — how a view binds props | — | **Free.** A view is a plain JSX function; the binding grammar is plain JS. No compiler, no DSL. |

## Why this shape

`design-to-app-gap-report.md` found two hard limits: Scamp regenerates
`page.tsx` wholesale so it cannot hold logic, and it only sees
`app/<name>/page.tsx`. The report proposed a JSX-aware parser and a
splice-not-regenerate generator. This plan doesn't need either:

- **The ownership boundary is a file boundary.** A view file contains
  only what Scamp emits, so Scamp keeps regenerating it with the parser
  it has. What remains is a binding grammar Scamp writes itself — a
  fixed form, matched the way `{propName}` text refs already are.
- **Routes are not Scamp's problem.** Scamp lists views. Route files
  live under `routes/` at any depth, with any segment syntax, and Scamp
  never enumerates them.
- **Previews stop depending on Next.** Today a preview means
  `npm install` (~400 MB of `node_modules`) then `next dev` behind a
  readiness detector. Vite + Preact is a few dozen packages and starts
  in well under a second. The parity harness gets the same speedup.
- **We own the conventions.** No `layout.tsx` that can't be touched, no
  "`page.tsx` must be the route", no React-Server-Component boundary
  deciding where `'use client'` goes. Views are components, a route
  exports a component and an optional `load()`, interactivity is hooks.
  Designers and agents can hold the whole model in their heads.
- **It's what the Noise With Friends agent built by hand.**
  `features/host/HostScreen.tsx` is a logic file that imports a design's
  CSS module. It copied the markup only because the design had no props
  to call.

## Project layout

```
my-project/
  views/
    Lobby/
      Lobby.tsx              ← structure  (Scamp-owned, regenerated)
      Lobby.module.css       ← styles     (Scamp-owned, regenerated)
    Host/ …
  components/
    LinkCard/ …              ← as today, with the same new prop kinds
  routes/
    index.tsx                ← /
    game/[token]/lobby.tsx   ← /game/:token/lobby   (logic; yours)
    game/[token]/host.tsx
    api/games/[token]/start.ts   ← API routes (Hono handlers; yours)
  design/
    theme.css                ← tokens, fonts (as today's app/theme.css)
    DESIGN.md
  scamp.config.json
  agent.md · CLAUDE.md
  package.json               ← "dev": "scamp dev", "build": "scamp build"
```

A view is a component that happens to be page-sized — it is a page's
design. The sidebar lists **Pages** (each backed by a view) and
**Components**, and the only difference between the two file kinds is
the canvas default (page width vs. hug). `app/` disappears.

## Worked example: the lobby

The screen from the Noise app: a room code, the player links with copy
buttons, a Start button disabled until everyone has joined.

### Structure — `views/Lobby/Lobby.tsx` (Scamp-owned)

```tsx
import styles from './Lobby.module.css';
import LinkCard from '@/components/LinkCard/LinkCard';
import RoundTag from '@/components/RoundTag/RoundTag';

type LobbyProps = {
  code?: string;
  joinedLabel?: string;
  players?: Array<{ id: string; label: string; url: string; status: string }>;
  canStart?: boolean;
  onCopy?: (id: string) => void;
  onStart?: () => void;
  className?: string;
};

export default function Lobby({
  code = "KZQ4",
  joinedLabel = "2 of 4 joined",
  players = [
    { id: "1", label: "Player 1 · Alex", url: "https://…/game/KZQ4/player-1", status: "Joined" },
    { id: "2", label: "Player 2 · Bea", url: "https://…/game/KZQ4/player-2", status: "Open" },
  ],
  canStart = false,
  onCopy,
  onStart,
  className,
}: LobbyProps) {
  return (
    <div data-scamp-id="root" className={`${styles.root} ${className ?? ''}`}>
      <header data-scamp-id="page_header_e1c1" className={styles.page_header_e1c1}>
        <p data-scamp-id="kicker_e1c2" className={styles.kicker_e1c2}>Step 3 of 3</p>
        <h1 data-scamp-id="page_title_e1c3" className={styles.page_title_e1c3}>Share the links</h1>
      </header>

      <section data-scamp-id="code_card_e1d0" className={styles.code_card_e1d0}>
        <p data-scamp-id="code_label_e1d1" className={styles.code_label_e1d1}>Room code</p>
        <h2 data-scamp-id="code_value_e1d2" className={styles.code_value_e1d2}>{code}</h2>
      </section>

      <section data-scamp-id="links_section_e1e0" className={styles.links_section_e1e0}>
        <div data-scamp-id="links_head_e1e1" className={styles.links_head_e1e1}>
          <h2 data-scamp-id="section_title_e1e2" className={styles.section_title_e1e2}>Player links</h2>
          <RoundTag data-scamp-instance-id="inst_7d19" label={joinedLabel} />
        </div>
        <div data-scamp-id="links_list_e1e3" className={styles.links_list_e1e3}>
          {players.map((player) => (
            <LinkCard data-scamp-instance-id="inst_2c40" key={player.id} label={player.label} url={player.url} status={player.status}>
              <button data-scamp-id="copy_button_e1f1" className={styles.copy_button_e1f1} type="button" onClick={() => onCopy?.(player.id)}>Copy link</button>
            </LinkCard>
          ))}
        </div>
      </section>

      <button data-scamp-id="start_button_e1f9" className={styles.start_button_e1f9} type="button" disabled={!canStart} onClick={onStart}>Start the game</button>
    </div>
  );
}
```

Against what `generateCode` writes for a component today, four things
are new: `{players.map(…)}` around a Scamp subtree, `{player.label}`
bindings inside it, attribute bindings (`disabled={!canStart}`), and
handler props (`onClick={onStart}`). The ids, classes, `?: string` props
with defaults, `className` passthrough, and instance overrides are all
existing output.

**The defaults are the sample data.** That is how components already
work: `label = "Get started"` is both what the canvas shows and what
renders if nobody passes a label. Lists follow the same rule. Nothing
lives in a hidden sidecar — open the file anywhere and you see what the
canvas sees.

### Styles — `views/Lobby/Lobby.module.css` (Scamp-owned)

Unchanged from today: one block per class, the same generator and
parser, the same breakpoint and state handling.

### Logic — `routes/game/[token]/lobby.tsx` (yours)

A route file exports the component and, optionally, a `load()` that
runs on the server (or at build time, for a static site) and hands the
component its `data`. `load()` receives a **framework-defined context**
— `params`, `request`, and `env` — never a Hono context, so a route
file imports nothing from Hono and stays portable (see "The server
layer"). Handlers are ordinary hooks — there is no server/client
component boundary to negotiate.

```tsx
import { useState } from 'preact/hooks';
import Lobby from '@/views/Lobby/Lobby';
import { useGameState } from '@/features/useGameState';
import { useCopy } from '@/features/ui/useCopy';
import { loadGame } from '@/lib/game';
import type { LoadContext, RouteProps } from 'scampjs/runtime';

export async function load({ params, env }: LoadContext<{ token: string }>) {
  return { game: await loadGame(env.DB, params.token) };
}

export default function LobbyRoute({ params, data }: RouteProps<typeof load>) {
  const { snap, act } = useGameState(params.token, data.game);
  const { copy } = useCopy();
  const [starting, setStarting] = useState(false);
  if (!snap) return null;

  return (
    <Lobby
      code={snap.token}
      joinedLabel={`${snap.joined} of ${snap.playerCount} joined`}
      players={snap.links.map((p) => ({ id: p.seat, label: `Player ${p.seat} · ${p.name}`, url: p.url, status: p.claimed ? 'Joined' : 'Open' }))}
      canStart={snap.joined === snap.playerCount && !starting}
      onCopy={(id) => copy(id, snap.links.find((p) => p.seat === id)?.url ?? '')}
      onStart={async () => { setStarting(true); await act('/start'); }}
    />
  );
}
```

What the logic file does *not* contain: markup, class names, layout.
"Compute in logic, bind in the view." Formatting ("2 of 4 joined")
happens here and arrives as a string; the view never does arithmetic.

## The Data tab, extended

Inside the component editor today, the Data tab lists every text element
with a **Prop / Locked** toggle and, for a prop, its name and default.
Views use the same tab with four more row kinds, each under the same
*sample = default* rule:

```
DATA

Text
  Step 3 of 3            Locked
  Share the links        Locked
  Room code              Locked
  KZQ4                   Prop   code
  Player links           Locked

Attributes
  start_button · disabled   Prop   canStart   ☐ (inverted)        ← sample: false
  inst_7d19   · label       Prop   joinedLabel = "2 of 4 joined"

Events
  copy_button · onClick     Prop   onCopy(player.id)
  start_button · onClick    Prop   onStart

Repeat
  links_list_e1e3 → LinkCard    over  players  as player   key player.id
    sample rows (2)                                             [ + row ]
      id    label                url                    status
      1     Player 1 · Alex      https://…/player-1     Joined
      2     Player 2 · Bea       https://…/player-2     Open

Show
  (none)
```

- **Text** — unchanged. Inside a repeat, a prop text element binds to a
  field of the row (`player.label`); the toggle offers the row's fields.
- **Attributes** — any typed attribute the Element section already
  exposes (`href`, `src`, `disabled`, `placeholder`, `type`…) can be
  Locked or a Prop. Booleans get an *inverted* checkbox so
  `disabled={!canStart}` reads as "can start".
- **Events** — `onClick` on buttons and links, `onChange` on inputs.
  Always a prop; the sample is "nothing happens". Inside a repeat the
  handler receives the row's key.
- **Repeat** — a container or instance marked as repeating over a list
  prop. The canvas renders one copy per sample row; the rows are edited
  in place as a small table. Key defaults to `id` if present, else index.
- **Show** — renders only when a boolean prop is true; the tab's toggle
  flips the sample.

Right-click on the canvas gains **Repeat this…** and **Show only
when…** beside **Make slot**, writing the same rows.

### What the canvas does with a binding

The canvas evaluates bindings against the sample values and nothing
else. The evaluator understands prop names and member paths
(`player.label`, `players.length`) — not JavaScript. No user code runs
inside the canvas; the parity harness renders a view with its samples on
both sides; anything needing real logic is computed in the route file
and bound as a string, which is the discipline the split exists for.

### Types

The props type is generated from the Data tab: `string` for text and
attribute props, `boolean` for show and boolean attributes,
`Array<{…}>` inferred from the sample rows (a field is a number if every
sample parses as one), `() => void` or `(key: string) => void` for
handlers. All optional, all defaulted — a view always renders. A route
that wants a richer type owns it and satisfies the view's structurally;
the view never imports from the app.

## The framework itself

Published as `scampjs`, with four commands. (`scamp` on npm is
an unrelated RabbitMQ client from 2021, so the working name can't ship;
see "Repositories and packaging".)

| Piece | Built on | What Scamp adds |
|---|---|---|
| `scamp dev` | Vite dev server, Preact preset, **Hono** | file-based routing over `routes/` (`[param]`, `[...rest]`, `(group)`), `load()` executed in the Hono app that also serves Vite's assets, the `@/` alias, `design/theme.css` injection, a `/_views/<Name>` route that renders any view with its defaults (the preview target — a built-in Storybook) |
| `scamp build` | Vite build | per-route rendering mode (see "Rendering modes"): static routes prerendered, server routes bundled into the Hono app, client routes shipped as an SPA entry; islands hydration with Preact |
| `scamp preview` | Vite preview + Hono | serves the build the way an adapter would |
| `scamp add <recipe>` | the exported templates | applies an optional recipe to an existing project — `drizzle` first (see "The data layer"); adapters may follow |
| Runtime helpers (`scampjs/runtime`) | Preact + a small router | `RouteProps`, `Link`, `useParams`, `navigate` — a few hundred lines |
| Server layer (`routes/api/*.ts`, `load()`) | Hono | one `Request → Response` surface for API routes, loaders, and SSR, so the same code runs on Cloudflare, Node, Bun, Deno, or Vercel. Route files never import it: `load()` gets a framework context, and an API route can be a plain handler. See "The server layer". |
| Deploy adapters | Hono adapters | static first; Cloudflare Workers/Pages, then Node, Vercel, Netlify — thin, because Hono already runs on all of them |

Size target: the framework package small enough to read in an afternoon.
Anything that grows past that is a sign we're rebuilding a runtime or a
platform, and should be an adapter to an existing one instead.

### Previews inside Scamp

`devServerManager.ts` already owns spawning a dev server, allocating a
port, detecting readiness, and the preview window. It swaps `next dev`
for `scamp dev`; the `npm install` on first preview shrinks from
hundreds of megabytes to a few dozen packages. Preview of a view opens
`/_views/Lobby`; preview of a route opens the route.

### Standalone use

`npm create scampjs` scaffolds the layout above without Scamp installed.
Anyone who wants the separation of concerns — structure, styles, logic
in three files, sample data as defaults — can use it as a plain
framework, and open the project in Scamp later, or never.

### The portability promise

The framework is a convenience; **the files are the product.** A view is
a plain JSX function with a CSS module; `preact/compat` makes it render
under React unchanged, and `views/` + `components/` + `design/theme.css`
drop into a Next, Remix, or Vite-React project as they are. Someone
building a backend-heavy app on Next keeps the Scamp files and writes
Next route files against them — exactly what the Noise app did, minus
the copying. This is the answer to lock-in and it should be a stated
promise in the docs and in `agent.md`.

## Repositories and packaging

The framework lives in **its own repository**, published to npm, and
both the Electron app and user projects consume it as an ordinary
dependency. The plan implied this; it's a decision, so it's stated.

### Why a separate repo

- **User projects can only depend on a published package.** A project's
  `package.json` can't point at the Electron repo, so the framework has
  to be an npm package regardless. Publishing from inside the app repo
  would tie every framework release to an app release, and the two move
  at different speeds.
- **The licenses differ.** The app is proprietary under the Scamp
  Software License, which forbids copying and redistribution. The
  framework ends up inside every user's shipped app, and the standalone
  story only works if it's MIT or Apache. Two licenses in one repo is
  confusing; two repos is clean — and more so now than when this was
  written, because the app's licence no longer permits what the
  framework's has to.
- **The size target depends on it.** "Small enough to read in an
  afternoon" is only true when the package is visible on its own, not
  buried under Electron, node-pty, patch-package, and the shim system.
- **Its tests don't want Electron.** Vite, Hono, and build-mode tests
  run in plain Node and should not add to the app's CI.

A monorepo would make contract changes atomic across both sides, which
matters most in phase 1. Still separate: the contract grows by adding
fields, the app tolerates a slightly newer framework, and converting
two repos into a workspace later is cheap where splitting one is not.

### Packages and names

| Package | Contents | Status on npm |
|---|---|---|
| `scampjs` | `scamp dev` / `build` / `preview`, file routing, `load()`, `/_views`, the Hono app, `scampjs/runtime` helpers, exported templates | free |
| `create-scampjs` | `npm create scampjs` — scaffolds a project from the framework's exported template | free |
| `@scampjs/adapter-*` | Deploy adapters, one package each, added as they land (phases 4–5) | — |

Claim the `@scampjs` npm org before anything else ships. The scope also
gives the runtime and adapters natural homes if they ever split out.

### The contract between the two repos

The coupling surface is small and explicit. Keep it that way, and
version it.

| Contract | What it covers | Owner |
|---|---|---|
| **Files** | `views/`, `routes/`, `components/`, `design/theme.css`; the binding grammar (`bind`, `on`, `repeat`, `showIf`); the `_scamp` view metadata; the render-mode declaration | framework repo (documented there; the app's parser and generator implement it) |
| **CLI** | `scamp dev` port and readiness output; the `/_views/<Name>` preview route; request-log format; the migration report shape | framework repo |
| **Templates** | The project template and the component template, exported as `scampjs/templates` so `create-scampjs` and the app's **New project** produce identical files from one source | framework repo |
| **Compatibility** | The app declares a supported framework range; new projects are scaffolded pinned inside it; the app checks the installed version on open and offers an upgrade, in the style of the Next migration report | app repo |

Bump the contract version whenever a table row changes shape; the app
reads it from the framework's `package.json` on project open.

### What the app does not do

It does not bundle the framework. Today `devServerManager` installs Next
into a project on first preview; the framework arrives the same way,
just smaller. The app needs the package itself only as a devDependency,
for the parity harness and the e2e specs that run `scamp dev`.

## The canvas stays a view

Decided: the canvas remains in-document, as it is today — `ElementRenderer`
renders the model, the injected stylesheet carries the container
queries, the parity harness proves the result against a browser. **No
iframe.** Scamp pursued one and backed it out (`canvas-injected-stylesheet.md`:
"four cross-realm `instanceof` bugs, a measurement rewire, and a
state-timing seam"), and nothing in this plan needs it.

Bindings fit that canvas without touching the frame: the evaluator
resolves `{player.label}` against sample data *before* an element is
rendered, so the canvas only ever sees a plain element with plain text;
repeat renders a subtree N times; show-if renders it or not. Each
binding kind is something the canvas reimplements rather than
evaluates, which is why the grammar stays at five kinds. If it ever
needs "arbitrary expressions", that is a sign the split has drifted, not
a reason to reopen the iframe.

## The server layer

Hono is the framework's one server surface, and it runs the same code
on Cloudflare Workers, Node, Bun, Deno, and Vercel — the property a
framework with adapters needs. It is a dependency of the framework,
**not of a project's code**: a project with only static routes and no
`load()` never runs it (the build is HTML and CSS, the deploy is a
folder), and a project that does use it never has to import it.

- **`load()`** runs inside a Hono app — in dev the same app serves
  Vite's assets; in production it is the server bundle — but the route
  file sees only a framework context:

  ```ts
  type LoadContext<P = Record<string, string>> = {
    params: P;          // route params
    request: Request;   // the standard Request: URL, headers, cookies
    env: Env;           // bindings and secrets; each adapter fills it
  };
  ```

  `env` is how D1, KV, a Postgres URL, or any secret reaches a loader,
  on every target: the Cloudflare adapter passes the Worker bindings,
  the Node adapter passes `process.env` plus anything the adapter
  config declares. Projects augment `Env` in a `scamp-env.d.ts` so
  `env.DB` is typed. Because `load()` never touches Hono, the same
  function can be lifted into a Next or Remix loader with one wrapper.

- **`routes/api/*.ts`** export one handler per file. The default form
  is a plain function over the standard types, which the framework
  mounts; it needs no import:

  ```ts
  // routes/api/games/[token]/start.ts
  import { startGame } from '@/lib/game';

  export const POST = async ({ params, env }: LoadContext<{ token: string }>) => {
    const game = await startGame(env.DB, params.token);
    return Response.json({ game });
  };
  ```

  Exporting a Hono app instead is the opt-in for routing inside the
  file, middleware (sessions, auth, CORS, validation), and Hono's typed
  client. The Noise app's `app/api/games/[token]/…` tree ports to
  either shape almost line for line.

  ```ts
  import { Hono } from 'hono';
  export default new Hono().post('/', async (c) => { /* … */ });
  ```

- **Typed fetches.** For projects that export Hono apps, Hono's client
  (`hc`) gives route files a type-safe client for their own API, so a
  `load()` calling `/api/games/:token` gets the response type without
  a hand-written contract — one fewer shape for an agent to guess.

### Full-stack in Scamp's UI, precisely

Scamp does not become a visual backend builder. It makes the backend
**first-class**: API routes listed in the sidebar and opened in the code
panel, a route scaffold, the dev server running them, request logs in
the existing app-log view, `.dev.vars` handled, and `agent.md` teaching
the conventions so an agent writes the backend inside the project's own
shape instead of beside it.

The bridge that makes this feel designed is the sample data. A view's
props type *is* the contract a `load()` must satisfy. So **Generate
route** writes a `routes/<path>.tsx` whose `load()` returns the view's
sample data, typed, and the agent's job is to replace the sample with a
real query. The design defines the data shape; the backend fills it.
That is the full-stack story a designer can drive.

## The data layer

The framework bundles no ORM and no database driver, for the same
reason it bundles no runtime: none of Scamp's value lives there, and
the good options are mature and small. What it does is make **one path
easy**, and that path is Drizzle.

Why Drizzle: TypeScript-first, schema as code, no runtime beyond the
driver, and it runs on every target the adapters list — Cloudflare D1,
Postgres (Neon, Supabase, plain `pg`), SQLite (libsql or
better-sqlite3), and Bun. Prisma needs driver adapters on Workers and
carries a runtime; Kysely is a fine alternative if someone wants a
query builder without schema-as-code, and nothing below prevents it.

### The recipe

`npm create scampjs` and Scamp's **New project** ask one optional
question — *Database: none · SQLite (Drizzle) · Postgres (Drizzle) ·
Cloudflare D1 (Drizzle)* — and the same recipe is available later as
`scamp add drizzle` for a project that started without one. Choosing
one writes:

| File | Contents |
|---|---|
| `db/schema.ts` | Drizzle tables; starts with one example table so the shape is visible |
| `lib/db.ts` | `db(env)` — builds the client from `env` (`env.DB` for D1, `env.DATABASE_URL` for Postgres, a local file path for SQLite), so the same call works in dev and on every adapter |
| `drizzle.config.ts` | Dialect and paths for `drizzle-kit` |
| `.dev.vars` | The local connection value, gitignored |
| `package.json` | `db:generate`, `db:migrate`, `db:studio` scripts |
| `scamp-env.d.ts` | The `Env` augmentation, so `env.DB` is typed in `load()` and API routes |
| `agent.md` | A **Database** section: where the schema lives, how to query in `load()`, how to write in an API route, and the migration commands |

Local dev defaults to SQLite on disk for the SQLite and D1 choices
(D1 is SQLite, so the schema is identical and `wrangler` takes over on
deploy) and to the `DATABASE_URL` in `.dev.vars` for Postgres.

### Where it sits in the split

`load()` reads through `db(env)`; API routes write through it; the
route file maps rows to the view's props. **The view's props are not
the schema.** A `Lobby` wants `{ id, label, status }`; the `players`
table has `seat`, `name`, and `claimed_at`. The mapping belongs in the
route file — that is "compute in logic, bind in the view" applied to
data, and it keeps a redesign from ever touching a migration.

```tsx
export async function load({ params, env }: LoadContext<{ token: string }>) {
  const rows = await db(env).query.players.findMany({
    where: eq(players.gameToken, params.token),
  });
  return { players: rows };
}
```

**Generate route** stays as described: it writes a `load()` that
returns the view's sample data, typed. With a database present it
also drops a commented Drizzle query in the same shape, so an agent's
job is to uncomment and finish it.

### What Scamp's UI does

Nothing new. The database is code the developer or agent owns, listed
under Routes alongside API routes, with `db:*` scripts runnable from the
terminal panel. Scamp does not become a schema editor.

## Rendering modes, per route

Rendering is a property of the route, not the view — the same `Lobby`
can be prerendered on one route and client-rendered on another. One
export per route file, default `static`:

```ts
export const render = 'static';   // prerender at build; ship HTML + CSS; hydrate islands
export const render = 'server';   // SSR per request through Hono; then hydrate
export const render = 'client';   // SPA: ship the JS, render in the browser
```

`client` is right for the game screens — behind a token, live data, no
SEO value. `server` for anything personalised that still wants
first-paint HTML. A `static` route with `load()` prerenders when its
params are enumerable (an exported `params()`), and falls to `server`
otherwise.

### Islands for free

Scamp knows which views declare **event props**, so it knows which
views need JavaScript at all. A static route whose views have no events
ships **zero JavaScript** — HTML and CSS only. A route with one
interactive view hydrates just that view, the way Astro and Fresh do
islands, except Scamp gets the island boundaries from the Data tab
instead of asking the author. A marketing site built in Scamp is lighter
than the same site in Next by default, without anyone thinking about it.

In the UI: a **Routes** list beside Views showing each route's mode as a
segmented control, and the route scaffold asking once. Agents set it in
the file.

## What changes in Scamp

| Area | Change |
|---|---|
| Model | `ScampElement` gains `bind` (attribute → prop), `on` (event → prop), `repeat` (`{ over, as, key }`), `showIf`. Text elements' existing `prop` covers text. |
| Sample data | Prop defaults extend from strings to booleans and arrays of flat records; the Data tab edits them. |
| Generator | Emits `{list.map((row) => (…))}`, `attr={prop}`, `onX={prop}`, `{flag && (…)}`, and the inferred props type. Canonical forms only. |
| Parser | Reads those four forms — a fixed grammar — and nothing else new. Anything outside it is preserved verbatim, as now. |
| Canvas | A path evaluator over sample values; repeat renders N copies; show-if hides. |
| Data tab | The four new row kinds. |
| Discovery | `views/` joins `components/`; `app/` is gone; `routes/` is never scanned. |
| Preview | `scamp dev` replaces `next dev`; view preview at `/_views/<Name>`; request logs from the Hono app in the app-log view. |
| Routes | A **Routes** list beside Views: each route's file, its render mode (segmented control), and its API routes. **Generate route** writes a `routes/<path>.tsx` whose `load()` returns the view's sample data, typed. |
| Scaffold + migrate | New projects always get the layout above, with the optional database choice from "The data layer". Existing Next.js projects keep working unchanged and migrate on request — see "Migration, and the Next.js projects". |
| `agent.md` | One new section: the three-file contract, the binding grammar, "compute in logic, bind in the view", that route files are never regenerated, and the portability promise. |

## Migration, and the Next.js projects

Three commitments, in order of weight:

1. **New projects always get the Scamp structure.** From the release
   that ships phase 2, `New project` scaffolds `views/`, `routes/`,
   `design/`, and the framework — never `app/`.
2. **Existing Next.js projects keep working, unchanged.** Opening one
   reads and writes `app/<name>/page.tsx` exactly as today: same
   parser, same generator, same preview through `next dev`. Nothing
   about a project changes because Scamp updated. `ProjectFormat` gains
   a third value — `'legacy' | 'nextjs' | 'scamp'` — and
   `detectProjectFormat` reads `scamp` from the presence of `views/`
   and a `scamp` dependency, the way it already tells `nextjs` from
   `legacy`.
3. **Migration is offered, not imposed.** Scamp has done this once
   already — `migrateLegacyToNextjs` moved the flat layout into
   `app/`, with `NextjsMigrationBanner` offering it on open and a
   `nextjsMigrationDismissed` flag remembering "not now". The same
   shape again: a banner on a Next.js project, one button, a snapshot
   first, a report after.

### What the migration does

Per file, mechanical, and reversible from the snapshot it takes first:

| From | To |
|---|---|
| `app/page.tsx` + `page.module.css` | `views/Home/Home.tsx` + `.module.css`; `routes/index.tsx` rendering `<Home />` |
| `app/<name>/page.tsx` + `.module.css` | `views/<Name>/<Name>.tsx` + `.module.css`; `routes/<name>.tsx` rendering the view |
| `components/**` | unchanged — already the right shape; the `className` passthrough and text props carry over as-is |
| `app/theme.css`, `DESIGN.md` | `design/` |
| `app/layout.tsx`, `next.config.ts` | removed; the framework owns the document shell |
| `package.json` | `next`/`react`/`react-dom` swapped for `scampjs`/`preact`; scripts rewritten; every other dependency kept |
| `public/assets/**`, `scamp.config.json`, `.gitignore`, `agent.md`, `CLAUDE.md` | kept; `agent.md` refreshed to the new template on the next open, as it is today |
| `.scamp/` | kept — snapshots, thumbnails, and the MCP registration are format-independent |

The generated view is byte-identical in its markup to the page it came
from; only the import line and the props signature change. So a
migrated project's canvas looks the same the moment it reopens, and
the parity harness can assert that.

### What the migration cannot do

Anything the user or an agent wrote *around* the design, because Scamp
never owned it. The Noise With Friends app is the instructive case:

- `features/*Screen.tsx` — copies of the designs with logic. The
  migration leaves them in place and lists them in the report; the
  right move is for an agent to rewrite each as a `routes/…` file that
  renders the now-propped view, which `agent.md` will describe. That is
  work, but it is the work the split exists to make one-way.
- `app/api/**` route handlers — Next's `Request → Response` shape is
  close to Hono's, but not identical (`params`, `NextResponse`). Listed
  in the report; ported by hand or by an agent, or the project stays on
  Next for its backend and uses the migrated views through the
  portability promise.
- `app/game/[token]/…/page.tsx` wrappers — become `routes/game/[token]/…`
  with the same one-line body. Mechanical enough that the migration can
  offer to do it, marked as a guess.

The report follows `migrateLegacyToNextjs`'s `unmovedFiles` pattern:
every file the migration didn't understand, with a sentence on what to
do with it.

### Sunsetting Next.js support

Not on a date; on evidence. The legacy read path stays narrow (the
current parser and generator, no new features added to it), and the
Next-specific parts of Scamp — `readProjectNextjs`, the `next dev`
preview, `app/`-shaped snapshot enumeration — get a documented list so
they can be removed together. Removal waits until the migration has
been offered for a few releases and telemetry (the existing anonymous
counts, if opted in) shows Next projects at a negligible share. Until
then, opening a Next project is a first-class, tested path, and the
e2e suite runs the core specs against both formats.

## Phases

1. **Views + bindings on the current Next output.** The model, Data tab,
   generator, parser, canvas evaluator, `views/`, migration. Next stays
   the preview and the runtime; a `routes/`-less project still works
   with the earlier `app/<name>/page.tsx` wrapper. This proves the
   binding model where projects already are and is a prerequisite for
   everything after.
2. **`scamp dev` as a preview backend.** Create the framework repo and
   claim the `@scampjs` npm org first (see "Repositories and
   packaging"). Vite + Preact + Hono: routing, `load()`, `/_views`.
   Wire it into `devServerManager`. Measure cold
   start, install size, and run the parity harness against it.
3. **`scamp build` with rendering modes and islands, `npm create scampjs`,
   docs.** The standalone story. Static and client modes first; server
   mode lands with the first adapter. **New projects switch to the Scamp
   structure here; the migration banner ships alongside**, so nobody is
   on a format Scamp can't take them off of.
4. **API routes, Generate route, the Drizzle recipe, and the Cloudflare
   adapter** — the full-stack story, where the Noise app went. The
   Routes list in the sidebar and request logs come with it.
5. **Further adapters** (Node, Vercel, Netlify) as demand shows.

Each phase is shippable on its own. Phase 1 is valuable even if the
framework never ships.

## Trade-offs, stated plainly

- **Ecosystem.** Next brings API routes, image optimisation, RSC, and a
  deploy story for free; the Noise app used Cloudflare D1 through
  OpenNext. A Scamp framework has to earn each of those, and some apps
  will still choose Next — which the portability promise allows. Scope
  phases 3–4 to what Scamp projects actually need, not to parity with
  Next.
- **Maintenance.** A public framework is a product: docs, semver, issue
  triage from people who never open Scamp. Staying at conventions +
  tooling on Vite keeps it small; it is still a standing commitment.
- **Preact vs. React.** Preact fits the brief and `compat` covers most
  libraries; some React-19-era libraries assume React proper. Make the
  runtime a config line so a project can swap.
- **The expressive ceiling.** No inline conditionals beyond show-if, no
  inline formatting, no arbitrary JSX inside a view. Nue draws the same
  line. The escape hatches — the route file, or a hand-written
  `components/` island — must be obvious in the docs.
- **Sample data ships.** Defaults are in the file, so a view rendered
  without props shows its samples in production — today's behaviour
  for component text, and arguably right. If a list of fake players in
  a bundle bothers anyone, the alternative is a `.scamp/samples/<View>.json`
  sidecar at the cost of self-describing files.
- **Two conventions for a while.** Scamp reads both layouts until Next
  support is sunset on evidence, not on a date. The legacy path gets no
  new features, has a documented removal list, and stays tested — the
  cost is real but bounded, and the alternative (forcing a migration)
  breaks the "nothing about your project changes because Scamp
  updated" promise that local-first depends on.

## Open questions

Settled: the framework is its own repo and npm package, `scampjs`
— see "Repositories and packaging". Also settled: `load()` and plain
API handlers receive a framework `LoadContext` with `env`, never a Hono
context (see "The server layer"); no ORM is bundled, and Drizzle is the
one-question recipe (see "The data layer").

1. **`views/` or co-located?** `views/` makes views route-independent,
   which is the point. Recommendation: `views/`.
2. **Defaults in the file or a samples sidecar?** Recommendation: in the
   file, as components do today.
3. **Binding grammar size.** All five kinds, or text/attribute/event/
   repeat first? Recommendation: all five; the Noise app needed show-if
   on every screen.
4. **Default render mode.** Recommendation: `static`, with islands —
   the lightest output and the one a marketing page wants; app screens
   opt into `client` or `server` per route.
5. **Components get the same four row kinds?** Yes — a `BuzzerButton`
   with an `onPress` prop is why the Noise app rebuilt its buzzer by
   hand, and views and components share the machinery.
6. **Should the migration offer to port `app/api/**` handlers to Hono?**
   The shapes are close enough for a best-effort rewrite that flags
   every `NextResponse` and `params` use. Recommendation: offer it,
   marked as a guess, with the originals kept until the user deletes
   them.
