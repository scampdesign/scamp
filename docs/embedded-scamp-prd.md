# PRD: Embedded Scamp (edit an existing React project)

**Status:** Draft
**Author:** Angie Hemans
**Date:** 2026-11-02
**Delivered through:** the Scamp desktop app (Electron), as a distinct product/mode
**Priority:** High (strategic)

---

## Summary

Embedded Scamp lets a user point Scamp at an existing React project and restyle it visually, in place, with the familiar Scamp WYSIWYG panel. Scamp runs the project's dev server inside its own browser view, the user navigates to a page, selects real rendered elements, and edits them. Edits apply instantly to the live DOM for experimentation, and a Scamp-authored prompt is queued to the Scamp Agent, which writes the change back to the real source files in the project's own styling idiom.

It is delivered through the Electron desktop app so it can orchestrate the whole toolchain (git, install, dev server) and guide non-technical users, and so it reuses Scamp's existing panel and agent rather than rebuilding them.

---

## How this differs from Scamp Desktop

Scamp Desktop owns its file format, so it relies on the clean `generateCode` / `parseCode` round-trip. Embedded Scamp operates on an arbitrary codebase Scamp did not generate, so that round-trip does not apply. The model here is different:

- The **canvas is the running app in a browser view**, not Scamp's render of its own model.
- Edits are **surgical changes to real source**, written by the agent, not regenerated from a Scamp model.
- The shared assets with Desktop are the **WYSIWYG panel UI and the agent**, not the core model engine.

---

## The core model: two layers

This is the heart of the design, so it is worth stating plainly.

- **Layer 1, live DOM edit (instant, ephemeral).** When the user styles a selected element, Scamp applies the change directly to the live DOM, the way a developer edits in the Chrome DevTools CSS panel. It is immediate and visual, and it touches no files. This is the experimentation space: the user can try things freely with nothing committed.
- **Layer 2, agent commit (real source).** Each DOM edit also adds a Scamp-authored prompt to the agent's queue. The agent, always listening under the hood, turns those prompts into real source edits in the project's styling idiom. The user controls when this happens: let it write continuously, or pause and batch a run.

So the DOM edit is the intent and the preview; the agent is the committer. Instant feedback is decoupled from the slower, faithful code write.

---

## Goals

- Let a user restyle an existing React app visually, with edits landing as faithful source changes in the project's own conventions.
- Remove the terminal and setup burden by having Scamp orchestrate git, install, configuration, and the dev server.
- Give instant visual feedback (DOM) separate from committed changes (agent), so the user can experiment safely.
- Keep every committed change reviewable and reversible through git.
- Offer lightweight git actions and project-wide design checks without becoming a full IDE or git client.

## Non-goals

- Reproducing Scamp Desktop's round-trip model on arbitrary code.
- A full git client or a full code editor.
- Guaranteeing every project boots. Some apps need services or env Scamp cannot supply (see risks).
- Supporting every styling system at launch (start narrow).

---

## User flow

### 1. Entry and folder selection

- An "Edit React project" entry point. The user selects the project folder on their machine.

### 2. Setup and preflight screen

Before loading anything, a setup screen confirms the user is ready and the project can run. It checks:

- **Accounts and access:** logged into git, logged into Scamp, and has access to the Scamp Agent.
- **Environment:** Node present (and a usable version), package manager detected, bundler detected (Vite first), env variables present where expected.
- **Backend heuristic:** a best-effort check for whether the app needs a backend or external services to run, surfaced as a warning rather than a hard block.
- **Instrumentation:** install the Embedded Scamp npm package and wire in the source-location plugin (the build-time plugin that tags elements with file and line so selection maps back to source). Auto-configure common setups; fall back to clear manual instructions where auto-config is not safe.

The screen reports what passed, what needs attention, and what Scamp will do (branch, install, configure), so a non-technical user understands each step.

### 3. Load and navigate

- Scamp creates a git branch for the session, starts the dev server as a managed process, and loads the running app in its browser view.
- The user navigates their app normally to the page they want to work on.

### 4. WYSIWYG editing (the two-layer model)

- The user clicks "Edit," selects a rendered element, and styles it with the Scamp panel.
- The change applies to the live DOM instantly (Layer 1).
- A Scamp-authored prompt describing the change is queued to the agent (Layer 2).

**Freeze state.** Transient UI (popover menus, tooltips, dropdowns, modals) disappears the moment focus or hover changes, which makes it impossible to select and style. The user can freeze the current state of the running app while navigating, so an open popover or tooltip stays pinned and can be edited like any other element. This is the general equivalent of holding a DevTools "emulate focused / active" state, broad enough to pin any transient UI the app renders.

**Edit this instance vs edit all instances.** A per-edit setting tells the agent how to treat a change to a component that has multiple instances: apply it to just this one instance, or to the component definition so every instance changes. The user sets this at edit or commit time, and the agent writes accordingly (a local override for this instance, or an edit to the shared component). The selection UI shows how many instances the component has, so the choice is informed.

### 5. The agent loop

- The agent is always listening for queued prompts and writes the corresponding source edits in the project's idiom.
- An on-screen indicator shows the agent's state: **thinking**, **writing code**, **done**.
- The user can **pause** the agent and **batch** the write run, so they can stack several experiments and commit them together.
- Safeguards gate the writes (see Safety).

### 6. Direct agent editing

- The user can also edit by instruction: select an element and tell the agent in plain language how to change it ("make this match the primary button," "tighten the spacing"), rather than driving every change through the panel.

### 7. Project-wide design checks

- The agent can scan the whole project for design-related issues, not just the current element:
    - Is the project using its own style guide / design tokens consistently, or are there one-off values?
    - Accessibility concerns (contrast, missing labels, focus handling, etc.).
    - Other design checks (inconsistent spacing scales, duplicated component styles, etc.).
- Results are presented as a reviewable report the user can act on.

### 8. theme.css editing (later)

- If the project has a `theme.css` (or equivalent token file), let the user edit those tokens so changes propagate across the app. Scoped for much later, noted here so the model accounts for it.

### 9. Lightweight git actions

- From the UI, the user can do the git tasks a designer needs: create and switch branches, push to GitHub, and pull from GitHub.
- This is deliberately not a full git client, just the functions needed to work on designs and get changes in and out.

---

## Safety and safeguards

- **Branch isolation:** all work happens on a Scamp-created branch, never directly on the user's main branch.
- **Experiment layer is free:** Layer 1 DOM edits touch no files, so experimenting commits nothing until the user lets the agent write.
- **Pause and batch:** the user controls when the agent writes, and can hold a run.
- **Diff review as the undo:** every agent write is a source diff on the branch. Show the diff, let the user accept, discard, or revert. Git is both the safety net and the trust story.
- **Mapping limits:** when a selected element cannot be mapped to editable source (rendered from a loop or data, or from a third-party UI library), Scamp says so clearly rather than guessing.
- **Instance vs all instances:** an explicit setting (see the editing flow) controls whether an edit applies to just the selected instance or to the component definition everywhere. The user is shown how many instances exist and chooses; the agent writes a local override or edits the shared component to match.

---

## Styling-idiom fidelity

The agent must write changes in the project's own convention, or the output feels foreign and gets rejected. It detects and respects the host's approach (Tailwind utility classes, CSS Modules, styled-components, vanilla CSS, and so on) and edits in that idiom. Start narrow: support one or two stacks well first (Tailwind, dominant and class-based; and/or CSS Modules, already Scamp-native), then expand.

---

## Relationship to existing work

- **Scamp Agent beta (SCMP-103) and harness (SCMP-105):** Embedded Scamp reuses the agent; "always listening to a queue" and "direct agent editing" are extensions of that work, now writing a foreign codebase.
- **Session safety (SCMP-107):** the pause/diff/revert model is the same spirit, with git as the snapshot layer.
- **Add Scamp to an existing project (SCMP-102):** related but distinct. SCMP-102 has the user design Scamp-native views that the host app imports; Embedded Scamp edits the host app's own existing components in place.
- **Import cleanup skill (SCMP-108):** the "write in the project's idiom" and "project-wide design checks" work shares DNA with the cleanup skill's rules.

---

## Hard problems and risks (carry forward)

- **Getting arbitrary projects to boot** is the biggest practical risk, worse for non-technical users. Many apps need env files, a backend, or specific toolchain versions. The preflight screen surfaces this, but Scamp cannot always fix it.
- **Node and package-manager toolchain** on the user's machine may differ from what the project needs.
- **Config injection** across frameworks (Vite, Next, CRA, Remix, SWC vs Babel) is fiddly; support the top one or two and fall back gracefully.
- **Element-to-source mapping** breaks under heavy abstraction; needs clear "not editable here" states.
- **Non-technical reality:** Scamp removes the terminal and setup steps once the app runs, but booting a non-trivial app locally is itself technical. The early sweet spot is technical-enough users or cleanly-booting projects (portfolios, marketing sites, self-contained front ends), widening as the boot path hardens.

---

## Open questions

- What is the minimum set of stacks for v1 styling fidelity? (Leaning Vite + React with Tailwind and/or CSS Modules.)
- How much of the preflight can be auto-fixed vs reported? Where is the line between "Scamp fixes it" and "Scamp tells you to"?
- Is Embedded Scamp a separate SKU/product, a mode inside the desktop app, or both? It is delivered through the Electron app regardless.
- For the agent write loop, is continuous-write or batch-by-default the better starting behavior?
- Does the project-wide design check run on demand only, or continuously in the background?

---

## Phasing

1. Entry, folder select, and the preflight/setup screen (accounts, environment checks, backend heuristic, package install, config injection).
2. Branch creation, managed dev server, and the app loaded in the browser view with navigation.
3. Selection + source mapping, Layer 1 live DOM editing via the panel, and freeze-state for transient UI (popovers, tooltips, menus).
4. The agent queue and write loop: always-listening agent, think/writing/done indicator, pause and batch, diff review, and the edit-this-instance vs edit-all-instances setting.
5. Direct agent editing by instruction.
6. Lightweight git actions (branch create/switch, push, pull).
7. Project-wide design checks (style-guide consistency, accessibility, more).
8. Later: theme.css / token editing.

---

## Done when

A user can pick a React project, pass a guided setup that gets it installed, configured, and running inside Scamp, navigate to a page, select elements, and restyle them with instant DOM feedback while the Scamp Agent commits faithful source changes to an isolated git branch, with a clear agent-status indicator, pause-and-batch control, diff review, lightweight git actions, and the ability to edit by instruction or run project-wide design checks. The user can freeze a transient state to edit popovers and tooltips, and choose per edit whether a change affects one instance or all instances of a component.