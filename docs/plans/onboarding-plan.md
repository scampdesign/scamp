# Onboarding: learn Scamp by doing

**The story.** A new user opens Scamp, picks a projects folder, and
lands on a blank canvas with a page named `home`. Nothing tells them
what makes Scamp different: that what they draw is real code, that
editing the code changes the canvas, and that components and tokens
are how a design stays consistent. Those ideas are in the user docs,
but nobody reads docs before they draw.

We want a short, optional walkthrough that teaches the core ideas by
having the user do each one in a real project, and that gets out of
the way the moment they'd rather explore.

## What's there today

- **Start screen first run** (`StartScreen.tsx`, `welcomeState`): asks
  for a default projects folder, nothing else.
- **New Project** (`CreateProjectModal.tsx`): a name, then a blank
  `home` view.
- **Docs:** `docs/user_docs/getting-started.md` covers install, the
  start screen, and the project folder, then links onward.
- **Starter components** (Button, Modal, Menu) exist as demos, but
  nothing points a new user at them.
- **No in-app teaching**, no record of what a user has tried.

## Goals

- In about 10 minutes, a new user has done each core idea once in a
  real project.
- Every step is something the user does, checked by what actually
  changed, not a slide they click past.
- Skippable at any point, resumable later, and never in the way of
  someone who already knows Scamp.
- No new dependencies, and no network: it works offline, like the rest
  of the app.

## Non-goals

- Coach marks that spotlight UI elements over a dimmed screen. They
  break whenever the panel layout changes, and they teach where to
  click, not why.
- Video, or anything hosted.
- Teaching every feature. Breakpoints, states, animations, import,
  and the rest stay in the docs, linked from the last step.
- Analytics. Scamp has no usage telemetry, only opt-in crash
  reporting, and this plan doesn't add any (see open question 4).

## The core ideas: five lessons and one optional

Each lesson has a goal, one thing to do, the signal that marks it done,
and one sentence on why it matters. The signal comes from the canvas
store or an existing IPC event, so the lesson completes however the
user does it: by the suggested route, a shortcut, or their own way.

| # | Lesson | The user does | Done when | Why it matters |
|---|---|---|---|---|
| 1 | **Draw, and it's code** | Draws a rectangle, then opens the **Code** panel | A new element exists on the page, and the Code panel has been opened | Everything on the canvas is a TSX and CSS Module file in their folder |
| 2 | **Lay it out** | Selects two elements and groups them, then sets the group's direction or gap | A flex container with two or more children exists, and its direction or gap has changed | Layout is real flexbox, not absolute positions |
| 3 | **The code is the design** | Changes a value in the CSS panel, or edits the file in their own editor | An edit from the CSS panel, or an outside edit that reloaded the canvas | The file is the source of truth; agents and editors can change the design |
| 4 | **Make it reusable** | Turns an element into a component, then places a second instance | A component exists, and a page has two or more instances of it | Change the component once, and every instance follows |
| 5 | **Use your tokens** | Sets a color from a theme token | Some element's value references a `var(--…)` token | Tokens keep a design consistent and make themes possible |
| 6 | *Optional:* **Work with an agent** | Connects an MCP client, or asks the Scamp Agent for a change | The MCP server reports a client, or an agent change is applied | Agents edit the same files the canvas draws |

Lesson 6 is optional because it needs an API key, a sign-in, or an
outside tool. It's offered, not counted toward "done".

## The format: a tutorial project and a checklist

**Recommendation:** a tutorial project, plus a **Learn** checklist in
the sidebar.

### The tutorial project

- On first run, after the user picks a projects folder, the welcome
  state offers two buttons: **Take the tutorial** and **Start a blank
  project**.
- **Take the tutorial** creates `scamp-tutorial` in the projects folder
  (or `scamp-tutorial-2` if one exists) from a seeded template: a
  `home` view with a heading, a paragraph, and two plain cards. The
  lessons need material to group, componentize, and restyle.
- It's a normal project. The user can keep it, delete it, or ignore it.
  The seed lives with the other templates in `src/shared/templates/`.

### The Learn checklist

- A **Learn** section in the icon rail, beside **Pages**,
  **Components**, **History**, and **Agent**. It lists the lessons, each with its
  instruction, a check mark when done, and a **Show me** link to the
  relevant docs page.
- The current lesson expands to two or three short sentences. Done
  lessons collapse to their title.
- It works in **any** project, not only the tutorial, so someone who
  skipped the tutorial can still use it.
- When all five core lessons are done: a short closing card that links
  to the docs index and names what to learn next (variants,
  breakpoints, import), and a **Hide Learn** button.
- **Hide Learn** removes the section from the rail. **Settings** gets a
  **Show the Learn checklist** toggle to bring it back.

### Why not the alternatives

| Format | Problem |
|---|---|
| Coach marks over a dimmed UI | Brittle against layout changes; teaches clicks, not ideas; blocks the user |
| A modal carousel of slides | Read and forgotten; nothing is practiced |
| Lessons only inside the tutorial project | Users who start blank never see them |
| Checklist only, no tutorial project | Lessons 2 and 4 need content; a blank canvas makes the user build it first |

## Where state lives

- **Progress is per user, not per project.** Lesson 3 done in one
  project counts everywhere. Stored in app settings (main process,
  `settings.json`) as:

  ```ts
  onboarding: {
    /** Lesson ids done, in the order they were done. */
    completed: string[];
    /** The user chose Hide Learn. */
    hidden: boolean;
  }
  ```

  Read and written through the existing `settings:get` and
  `settings:update` channels; the renderer never
  touches disk. A missing field (old installs) reads as nothing done and
  not hidden. Existing users with recent projects start hidden, so the
  checklist doesn't appear to people who already use Scamp (see open
  question 1).
- **Live tracking** is a small Zustand slice, `onboarding`, that loads
  the setting, subscribes to the canvas store for each lesson's signal,
  and writes back when a lesson completes.
- **The lesson definitions** (id, title, text, docs link, and a pure
  `isDone(before, after)` check over store snapshots) live in
  `src/renderer/lib/onboardingLessons.ts`. They're pure, so they're unit
  tested as CLAUDE.md requires.

## Code

| Where | What |
|---|---|
| `src/renderer/lib/onboardingLessons.ts` | Lesson definitions and their pure completion checks |
| `src/renderer/store/canvas/slices/` or a new `onboardingSlice.ts` | Progress, subscriptions, write-back |
| `src/shared/types.ts` | `Settings.onboarding` |
| `src/main/ipc/` settings handler | Default and migration for the new field |
| `src/shared/templates/` | The tutorial project's seed view |
| `src/main/ipc/projectScaffold.ts` | Create the tutorial project from the seed |
| `src/renderer/src/components/StartScreen.tsx` | **Take the tutorial** in the welcome state; a **Learn Scamp** link in the sidebar for later |
| `src/renderer/src/components/learn/LearnSection.tsx` | The checklist section in the icon rail |
| `src/renderer/store/canvasSlice.ts` | `'learn'` added to `SidebarSection` |
| Settings screen | **Show the Learn checklist** toggle |
| `docs/user_docs/getting-started.md` | A "Take the tutorial" section |
| `docs/CHANGELOG.md` | The release note |

Lessons 3 and 6 reuse existing signals: the outside-edit reload in
`syncBridge`, and the MCP connection state behind `McpStatusPill`. No
new IPC channels are needed beyond what the settings field requires.

## Copy

All lesson text is user-facing, so it follows the Google developer
documentation style in CLAUDE.md: sentence case, second person, present
tense, bold UI names, no "just", "simply", or "easy". Each lesson is at
most three sentences: what to do, how, and why it matters. The draft
copy for all six lessons goes in this plan for review before any code
(phase 1).

## Phases

1. **Copy and seed.** Write every lesson's text and the tutorial seed
   view; review here before code.
2. **Lessons and progress.** `onboardingLessons.ts` with unit tests;
   the settings field; the slice. No UI yet.
3. **The Learn section.** The checklist in the icon rail, with
   **Show me** links, the closing card, and **Hide Learn**, plus the
   Settings toggle.
4. **The tutorial project.** The welcome-state buttons, the scaffold,
   and the start screen's **Learn Scamp** link.
5. **Docs and release.** Getting-started section, changelog.

Each phase ships on its own: after phase 3, the checklist works in any
project even without the tutorial.

## Tests

- **Unit** (`test/onboardingLessons.test.ts`): each lesson's check,
  done and not done, from store snapshots, including the unhappy paths:
  a rectangle drawn then undone, a group with one child, a component
  with one instance, a token reference that isn't a `var(--…)`.
- **Unit:** reading old settings without `onboarding`.
- **E2E** (`test/e2e/onboarding/`): first run offers the tutorial and
  creates the project; drawing a rectangle checks lesson 1 and survives
  a restart; **Hide Learn** removes the section and the Settings toggle
  restores it. Run only these spec files, not the whole suite.

## Open questions

1. **Existing users.** Hide the checklist for anyone with recent
   projects (proposed), or show it once to everyone after the update
   with a clear **Hide Learn**?
2. **Order of lessons 4 and 5.** Tokens before components is simpler;
   components before tokens is more impressive. Proposed: components
   first, as written. no tokens first
3. **Lesson 6.** Keep it as an optional sixth lesson, or leave agents to
   the closing card's "what next" links? all lessons are optional 
4. **Knowing whether it works.** Without telemetry, we can't see where
   people drop off. Options: none (proposed, fits local-first), or a
   one-time "Was this useful?" link to a feedback form on the closing
   card.we can add something like this later
5. **The crash-reporting prompt.** First launch already asks about
   crash reporting. Proposed order: the folder, then the crash-reporting
   prompt, then the tutorial offer, so no two dialogs overlap. no crash reporting first.

## Decisions

Recorded 2026-10-29.

1. **Skippable entirely, and re-runnable from Settings** (asked for).
   **Skip** on the first-run offer hides everything; **Settings →
   Tutorial → Start the tutorial** makes a fresh tutorial project and
   starts the checklist over.
2. **Existing users don't see it.** The offer appears only when the
   folder is picked on the first-run screen; a settings file without
   the field reads as hidden. (Open question 1.)
3. **Components before tokens**, as written. (Open question 2.)
4. **The agent lesson stays, optional.** (Open question 3.)
5. **No telemetry or feedback link.** (Open question 4.)
6. **Order:** crash-reporting prompt, folder, then the offer, which is
   what App already does. (Open question 5.)

## What was built

- **Settings:** `Settings.onboarding` (`offered`, `hidden`,
  `completed`), parsed in `settingsOps.ts`; read and written through
  the existing `settings:get` and `settings:update`.
- **Lessons:** `lib/onboardingLessons.ts`. Each check reads a history
  entry, the record every user action already leaves, so a lesson
  completes however it's done and a page load never counts.
- **Progress:** `store/onboardingSlice.ts`, and
  `watchHistoryForLessons`, installed by `ProjectShell`. Only an entry
  newer than the last one read counts, so undo, redo, and switching
  pages complete nothing.
- **The tutorial project:** `CreateProjectArgs.template: 'tutorial'`;
  main takes the first free `scamp-tutorial` name and writes
  `shared/templates/tutorialProject.ts` over the home view.
- **UI:** the first-run offer in `StartScreen.tsx`; the **Learn** rail
  section and `projectShell/LearnPanel.tsx`; the **Tutorial** section
  in `SettingsPage.tsx`; `lib/startTutorial.ts` shared by both entry
  points.
- **Tests:** `test/onboardingLessons.test.ts` (16),
  `test/tutorialProject.test.ts` (2: the seed round-trips, and has the
  cards the lessons use), `test/settingsOps.test.ts` (3 new), and
  `test/e2e/onboarding/onboarding.spec.ts` (4).
- **Docs:** `getting-started.md`, `settings.md`, and the changelog.

**Changed from the draft above:**

- **Lesson 1** completes on drawing a rectangle; it no longer also
  waits for the Code panel, which has no history signal. The lesson
  points at the panel instead.
- **Lesson 2** completes on grouping; the group is already a flex
  container, so changing its direction isn't required.
- **Lesson 3** is one signal: a CSS-mode edit is written to the file
  and read back as an outside edit, the same entry an editor's change
  makes.
- **Lesson 6** completes on an agent edit; an MCP connection alone
  doesn't count.
- **The start screen's Learn Scamp link** wasn't built; **Settings**
  is the one place to restart, as asked.
- **Show me** opens the lesson's page in the user docs on GitHub, the
  same repository the Help menu's bug report uses.
- **Any lesson reopens.** Clicking a title expands it, so a done
  lesson can be read again; finishing one moves to the next.
- **A way back.** While the tutorial is under way, every other sidebar
  section ends with a **Tutorial** pill that returns to the steps. The
  component lesson leaves the page for the component editor, which is
  where users got lost.
- **Spotlight.** Each lesson lists selectors for the control it asks
  for (`Lesson.highlights`); `TutorialSpotlight` rings the first one on
  screen, polling every 250 ms because the targets come and go with
  selection and popovers. The selectors lean on existing attributes
  (`data-tool`, `data-section`, `data-panel-section`, `aria-*`) plus
  one new `data-picker-tab` on the color picker's **Tokens** tab.

**Not covered by tests:** lessons 2–5 end to end. Their checks are unit
tested against the entries the actions record (`group`,
`external-edit`, `add-component-instance`, and a `patch` listing
`backgroundColor`), and the e2e drives lesson 1 through the real UI.
A token picked while a breakpoint other than desktop is active is
stored on the breakpoint, so it doesn't complete lesson 5.
