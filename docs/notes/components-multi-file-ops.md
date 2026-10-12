---
title: Multi-file component operations (convert / rename / delete)
related:
  - src/renderer/src/components/ProjectShell.tsx
  - src/renderer/lib/componentRename.ts
  - src/renderer/lib/componentUsage.ts
  - src/renderer/lib/extractComponent.ts
  - src/main/ipc/componentOps.ts
---

# Multi-file component operations

Convert-to-component, rename-component, and delete-component all need to coordinate writes across several files in the project. They share three patterns:

1. **Best-effort sequential.** Each handler does its IPC writes one at a time, awaiting each before the next. A failure mid-flow can leave the project in a mixed state (e.g. component file written but pages not yet rewritten). The parser's missing-component placeholder makes that recoverable on next open. True stage-and-swap atomicity would be the next step but isn't implemented yet.
2. **Functional `onProjectChange` updaters.** Multi-step handlers fire `onProjectChange` more than once per call. With value-based React 18 batching, sequential calls would clobber each other (the second `setProject(obj)` REPLACES the queued first one). Always use the functional form: `onProjectChange((prev) => ...)`. The bridge in `App.tsx` accepts both forms and wraps the type mismatch against `useState<ProjectData | null>`.
3. **`armTargetSwapSuppression`.** Rename and delete remove the outgoing file from disk before the React state transition finishes propagating into the canvas store. Without suppression, the sync bridge's "flush outgoing target" would write to a deleted path. See [components-sync.md](./components-sync.md) for the mechanism.

## Convert-to-component

`handleConvertToComponent(elementId, name)`:

1. `generateComponentFromSubtree(...)` — pure helper. Lifts the subtree into a standalone elements map (renaming the root to `ROOT_ELEMENT_ID`) and runs it through `generateCode({ isComponent: true })`.
2. `await window.scamp.createComponent({ projectPath, componentName: name, tsxContent, cssContent })`. The IPC creates the folder + writes both files; refuses if the folder already exists.
3. `state.replaceSubtreeWithInstance(elementId, name)` — canvas-store mutation. The source subtree is removed from the page's element map; a fresh `component-instance` element is spliced into the parent's `childIds` at the same position, inheriting the source root's x/y.
4. `onProjectChange((prev) => ({ ...prev, components: [...prev.components, created] }))`. Functional updater required — the next step also fires `onProjectChange`.
5. `openComponent(name, activePageName)` — navigates into the new component's editor. Internally calls `flushPendingPageWrite` (to land any pending page edit on disk) and `persistActiveSource` (to mirror the in-memory page state back into `project.pages`, since the React-state snapshot was set at project open and would otherwise be stale).

### Why this matters (the bug that motivated the fix)

The earlier implementation called both `onProjectChange` calls with object-literal `{...project, …}` updates. React 18 batched them and the second one's stale `project` closure clobbered the first — the new component disappeared from `project.components` between commit and effect run. The load-component useEffect couldn't find the component, called `resetForNewPage`, and the subsequent page reload pulled `project.pages[home].tsxContent` — which by then held the component's body (chokidar re-read raced in disk state). The on-disk page file ended up byte-identical to the component file.

Both call sites are now functional updaters. The convert flow composes correctly regardless of how many `setProject` calls fire in the same handler.

## Rename component

`handleRenameComponent(oldName, newName)`:

1. `armTargetSwapSuppression()` — the rename will trigger a target swap via `loadComponent`, and the outgoing path is about to disappear.
2. `flushPendingPageWrite()` + `persistActiveSource()`, then `readProject` — the pages and components come from disk, not `project` (which holds each page as it was when last loaded, so rewriting it dropped edits made since). Main's `ProjectRead` waits for in-flight writes, so the flush is in what it reads.
3. `rewriteComponentForRename(tsx, css, oldName, newName)` — pure helper. Parses + regenerates with the new `pageName` / `cssModuleImportName` / `[Name]Props` type.
4. For every page read in step 2: `rewritePageForComponentRename(tsx, css, oldName, newName, page.name, project.format)`. Walks `component-instance` elements, updates `componentName` on matches, regenerates. Skip pages that don't reference `oldName` (`changed: false`) so unrelated files stay byte-stable on disk.
5. `createComponent` with the new name → writes the new files.
6. `writeFile` for each rewritten page, with the content read in step 2 as the expected content (`writeIfUnchanged`). A page that changed in between is refused, and the rename stops there.
7. `deleteComponent` (old name) → removes the old folder.
8. `onProjectChange` (single call) updates `project.components` + `project.pages`.
9. If the user was inside the renamed component's editor, re-point `activeComponent` to the new path.
10. `renameComponentReferences(oldName, newName)` on the canvas store so the active page's in-memory state stays consistent without a reload.

Failure path: `disarmTargetSwapSuppression()` so the flag doesn't leak to an unrelated future swap, log the error, surface inline in the rename input.

## Delete component

`handleConfirmDeleteComponent`:

1. `armTargetSwapSuppression()` — same reason as rename.
2. `flushPendingPageWrite()`, then `readProject`. For each affected page: parse → strip `component-instance` elements matching the deleted name → regenerate → `writeIfUnchanged` (as rename). Unaffected pages skipped.
3. `deleteComponent` IPC removes the folder. Done last so a partial page-write failure doesn't leave a dangling import against a missing folder.
4. If the user was editing the deleted component, `setActiveComponentState(null)` to drop them back to whatever page they came from.
5. `onProjectChange` updates `project.components` (filtered) + `project.pages` (rewritten).

Failure path: `disarmTargetSwapSuppression()`, log, leave the dialog open for retry.

## Detach (Phase 8)

`detachInstance(instanceId)` is the inverse of the convert flow but stays renderer-only — no file IPC. Walks the component tree via `componentTrees[name]`, deep-clones every element with fresh canvas ids (re-rolling on collision), bakes `propOverrides` into the matching text elements as literal text, splices the cloned root into the instance's position, drops the instance. The page's regenerator naturally drops the component's `import` line when no other instance remains.
