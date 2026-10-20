# Repo audit, 2026-10-20

**Fixed:** 1 to 10 (2026-10-20).

**What this repo does:** Scamp is a desktop design app built on Electron. You draw on a canvas and it saves real TSX and CSS files to your project, and when an AI agent or another editor changes those files, the canvas reloads. It also runs a local server that AI agents connect to (MCP), a sign-in flow, a built-in AI agent, and imports from websites and React apps.

**Load assumed:** one person on their own computer, with an AI agent editing the same files at the same time, and untrusted content coming in from imported web pages and downloaded projects.

Four parallel read-only audits covered the save and sync pipeline, the main-process file and IPC layer, the MCP server and sign-in, and the component-variant code. The strongest findings were checked in the code.

## Must fix

1. **Fixed in `170895da`.** **An agent's edit wipes canvas changes that haven't been saved yet** (`src/renderer/src/syncBridge/externalEdit.ts:64-69, 196`)
   - **What this is:** when a file changes on disk, this handler reloads the canvas from the file.
   - **Problem:** it cancels the canvas's pending save and replaces the canvas with the file. It never merges.
     - The agent writes the CSS, and you change a colour 150 ms later.
     - The reload replaces your change, and the save indicator says "Saved".
     - The same happens to every edit you make during the 2.5-second pause after each agent write.
   - **Fix:** if a save is pending or the canvas changed during the pause, send it through the existing merge path (`onWriteConflict`) instead of `reloadElements`.
   - **If we skip it:** edits made while an agent works vanish silently; only undo brings them back.

2. **Fixed in `170895da`.** **Restoring the oldest snapshot restores nothing and deletes it** (`src/main/ipc/snapshotOps.ts:411-417`)
   - **What this is:** before restoring, Scamp saves a safety snapshot of the current state.
   - **Problem:** with 50 snapshots, saving the safety copy deletes the oldest one (the limit is 50). If that's the one you're restoring, nothing gets copied, but the restore still says it worked. "Undo AI session" uses the same path.
   - **Fix:** don't delete the snapshot being restored when trimming to 50. Return a failure when there are no files to copy.
   - **If we skip it:** the restore point you reached for is gone for good, and the app says it succeeded.

3. **Fixed in `170895da`.** **Following a link to another page drops recent edits** (`src/renderer/src/components/projectShell/useNavigationRequests.ts:40`)
   - **What this is:** clicking a link indicator on the canvas opens the linked page.
   - **Problem:** unlike opening a component, this doesn't save first. During an agent pause, the pending save is skipped, the new page loads, and the old page's edit is lost.
   - **Fix:** call `flushPendingPageWrite()` and `persistActiveSource()` before navigating, as `openComponent` does.
   - **If we skip it:** edits disappear when you follow a link right after an agent edit.

4. **Fixed in `68bc546d`.** **A variant property left with one value disappears on reload** (`src/renderer/lib/parseCode/tsx.ts:243`)
   - **What this is:** this pattern reads a component's union-typed props (like `"a" | "b"`) back as variant properties.
   - **Problem:** it requires at least two values. The panel lets you remove values down to just the default, which saves as `variant?: "default";`. On reload, that's no longer read as a variant property, and its rules are kept as raw CSS.
   - **Fix:** change the pattern's `+` to `*` so one value still counts.
   - **If we skip it:** a component quietly loses its variant property after a reload.

5. **Fixed in `68bc546d`.** **A hover, press or focus interaction is lost if its target value has no styles yet** (`src/renderer/lib/generateCode/css.ts:190-205`)
   - **What this is:** these interactions are saved only as a second selector on the target value's CSS rules.
   - **Problem:** with no rule to attach to, nothing is written. For example, add a value `open`, add "While hovering: default → open", save before styling it, and reload: the interaction is gone.
   - **Fix:** write an empty root rule for that value carrying the second selector, and have the parser accept it.
   - **If we skip it:** interactions vanish in an order of work that's natural to follow.

6. **Fixed in `68bc546d`.** **"From any value" interactions lose in the browser** (`src/renderer/lib/variantInteractions.ts:64`)
   - **What this is:** "From any value" is written without the property's attribute, for example `.root:hover .x`.
   - **Problem:** that has the same specificity as `.root[data-state="closed"] .x`, which is written later, so the later rule wins. A hovered `closed` instance stays closed in the browser, while Try interactions shows `open`.
   - **Fix:** write `.root[data-state]:hover .x` (attribute present, any value) and read that form back.
   - **If we skip it:** the canvas preview and the real page disagree.

7. **Fixed in `68bc546d`.** **The canvas layers variant states in a different order than the browser** (`src/renderer/lib/stateCascade.ts:58-64`)
   - **What this is:** this decides how one frame of the variant set looks on the canvas.
   - **Problem:** it applies `outline`, then `outline:hover`, then `small`. In CSS, `outline:hover` (`.root[data-variant="outline"] .el:hover`) outranks `small` (`.root[data-size="small"] .el`). If both set the background, the browser shows outline's hover colour and the canvas shows small's. **Make default** uses this same function, so it rebuilds styles against the wrong order.
   - **Fix:** apply all single values' base styles, then all their states, then the combinations' base styles, then their states.
   - **If we skip it:** the canvas shows a look the real page never has.

8. **Fixed in `68bc546d`.** **Variant styles on a nested component instance are never saved** (`src/renderer/store/canvas/patchRouting.ts:111-125`)
   - **What this is:** in a variant frame, edits go into that value's styles.
   - **Problem:** for an instance inside the component, the edit is stored, but the code generator skips instances (`css.ts:194`). It shows on the canvas, then disappears on reload.
   - **Fix:** in `routeVariantPatch`, don't route style edits on a component instance into the variant. (Done: the edit lands on the instance's own styles, so it shows in every frame.)
   - **If we skip it:** resizing an icon instance in the `outline` frame looks saved but isn't.

9. **Fixed in `8e7d7fba`.** **An imported page can crash or hang the app through an image download** (`src/main/ipc/image.ts:112-122`)
   - **What this is:** website import downloads every image the page uses.
   - **Problem:**
     - **Memory:** the whole response is read into memory before the size limit is checked.
     - **Timeouts:** there's no timeout, and the import fetches images one at a time.
     - **Addresses:** nothing blocks `localhost` or private network addresses.

     A page whose image response never ends runs the app out of memory; a slow one stalls the import.
   - **Fix:**
     - Refuse an oversized `content-length` up front.
     - Read the body in chunks, stopping at the limit.
     - Add `AbortSignal.timeout(30_000)`.

     Done, except blocking `localhost` and private addresses: a React import fetches its images from a local dev server.
   - **If we skip it:** importing a hostile or broken site can crash Scamp.

10. **Fixed in `8e7d7fba`.** **On Linux, the sign-in token and API key can be stored with a publicly known key** (`src/main/auth/tokenStore.ts:72, 95`)
    - **What this is:** the token and key are encrypted with Electron's `safeStorage` before being written to disk.
    - **Problem:** it only checks that encryption is "available". On Linux without a keyring, Electron's fallback "available" mode encrypts with a fixed key anyone can look up. A backup or another program could then read the 30-day token and your Anthropic key. The missing check was confirmed; the fallback behaviour wasn't tested on a real machine.
    - **Fix:** on Linux, also require `safeStorage.getSelectedStorageBackend() !== 'basic_text'`. Otherwise keep them in memory only.
    - **If we skip it:** secrets sit on disk in a form that's easy to decrypt.

## Should fix

11. **Undo can restore a deleted page into a new page with the same name** (`src/renderer/store/historySlice.ts`, `usePageManagement.ts:226`)
    - **What this is:** undo history is kept per page file path.
    - **Problem:** deleting a page never clears its history. Delete "about", create a new "about", draw something, and press undo: you get the old page back, and it's saved to disk.
    - **Fix:** clear that page's history when you delete it, and do the same for components.
    - **If we skip it:** undo writes back content you deleted.

12. **A failed save can leave a page half-written** (`src/main/ipc/file.ts:47-54`)
    - **What this is:** saving a page writes the TSX file, then the CSS file.
    - **Problem:** if the CSS write fails (a full disk, say), the new TSX stays on disk with the old CSS. The canvas then reloads that mix, and your new elements lose their styles.
    - **Fix:** if the CSS write fails, write the old TSX back before reporting the error.
    - **If we skip it:** a disk error damages a page instead of just failing to save.

13. **A snapshot restore that fails partway leaves the project mixed** (`src/main/ipc/snapshotOps.ts:417-422`)
    - **What this is:** files are copied back one at a time.
    - **Problem:** if file 5 fails, files 1 to 4 are already replaced. The canvas isn't told, so it still shows the state from before the restore.
    - **Fix:** on failure, copy the safety snapshot back and tell the canvas the pages changed.
    - **If we skip it:** disk and canvas disagree, and the next save overwrites part of the restore.

14. **MCP tokens are written in files other users may be able to read** (`src/main/mcp/mcpOps.ts:72`, `src/main/mcp/agentConfig.ts:272`)
    - **What this is:** the token agents use to call Scamp is saved in project files such as `.scamp/mcp.json` and `.mcp.json`.
    - **Problem:**
      - **Readable files:** they're written with default permissions, usually readable by everyone on the machine.
      - **Kept tokens:** a token that arrives inside someone else's project is kept forever.

      On a shared machine, another user could read your canvas and imported source through the local server.
    - **Fix:** write these files with `{ mode: 0o600 }`, and issue a new token when an opened project brings its own.
    - **If we skip it:** it's a small leak on shared machines.

15. **One agent can open any number of hidden render windows** (`src/main/canvasQueries.ts:132`, `src/main/agent/overflowRender.ts:64`)
    - **What this is:** every `scamp_find_overflow` call opens a hidden browser window.
    - **Problem:** there's no limit on how many run at once. An agent stuck in a loop can start dozens and stall the app.
    - **Fix:** run these one at a time, behind a single-slot lock.
    - **If we skip it:** one misbehaving agent can freeze Scamp.

16. **Deleting a clicked element leaves a broken click interaction** (`src/renderer/lib/variantInteractions.ts:109`)
    - **What this is:** a click interaction remembers which element is clicked.
    - **Problem:** deleting that element doesn't remove the interaction. The panel lists it as "On click on the component", but it isn't saved, and it disappears on reload.
    - **Fix:** when an element is deleted, drop the interactions that point at it.
    - **If we skip it:** the panel shows an interaction that doesn't exist in the files.

17. **Variant property names that JavaScript or React reserve are allowed** (`src/renderer/lib/variantAxes.ts:115`)
    - **What this is:** the check for a new property name only blocks `children`.
    - **Problem:**
      - **JavaScript keywords:** `class`, `for` or `default` write a component that doesn't compile.
      - **React names:** `key` or `ref` are stripped by React, so the value never reaches the component.
    - **Fix:** reuse `RESERVED_PROP_NAMES` from `agentEdits.ts:669` and add JavaScript's reserved words.
    - **If we skip it:** one rename produces a component that won't build.

18. **The variant set can keep resizing itself until React gives up** (`src/renderer/src/canvas/VariantSet.tsx:44-63`)
    - **What this is:** each frame grows to reach its furthest element.
    - **Problem:** the trigger is a root that fills its container with a child sticking out on the right, like a corner badge at `right: -8px`.
      - Growing the frame widens the root, which moves the child further out.
      - The frame grows again, without end, until React stops with "Maximum update depth exceeded".
    - **Fix:** don't grow a frame along a side where the root fills the artboard.
    - **If we skip it:** that component's editor can crash.

19. **Project code in the preview can open unlimited browser tabs** (`src/renderer/preview/PreviewApp.tsx:216`, `src/main/previewWindow.ts:147-152`)
    - **What this is:** the preview allows pop-ups and sends each one to your default browser.
    - **Problem:** no click is needed. Agent-written code running `window.open` on a timer floods the browser.
    - **Fix:** only open pop-ups that come from a user click, or remove `allowpopups`.
    - **If we skip it:** a bad or buggy project can spam your browser.

## Nice to have

20. **The variant set re-renders far more than it needs to** (`src/renderer/src/canvas/ElementRenderer.tsx:545-551`)
    - **What this is:** each element looks up its parent's resolved styles.
    - **Problem:** the lookup builds a new object every time, so elements re-render on every store change. With 36 frames, a drag re-renders every element in every frame on every mouse move.
    - **Fix:** look up the raw parent and work out its styles with `useMemo`.
    - **If we skip it:** large variant sets get sluggish to edit.

11 smaller items were left out, including:
- **Sign-in:** a web page can make a sign-in fail.
- **Network timeouts:** the sign-in token exchange has no timeout.
- **Defence in depth:** some file paths aren't checked against the project folder, where another bug would have to pass them a bad path first.
- **Variant CSS:** two duplicate CSS rules for the same variant merge badly.
- **Snapshot label:** "agent_edit" snapshots are taken after the agent's edit, not before.
- **Interaction order:** after a reload, interactions come back in a different order.

**Verdict:** fix 1, 2 and 3 first: they lose your work silently. Then 4 to 8, which make variants save or display wrong.

**Lean:** about -60 lines, -0 dependencies possible:
- **Shared grammar:** keep one copy of the property-name and value rules instead of five.
- **Duplicate helpers:**
  - `variantGrid` should call `keyFor`.
  - Reuse `fullPicks` in two components.
  - Merge the two "is this key valid" checks.
  - `parseVariantKey` duplicates `variantKeyParts`.

**Not checked:**
- **Not run:** nothing was run; every finding comes from reading code.
- **Not checked in a browser:** findings 6 and 7 are CSS specificity arguments.
- **Not checked on a real machine:** finding 10's Linux fallback behaviour.
- **Not read:**
  - Project scaffolding and migration, theme and settings handlers.
  - The image optimiser and the updater.
  - The dev-server and React-import app server.
  - The merge-write internals, the canvas's HTML sanitizers, and the built-in agent's provider and session code.
  - Most of the import pipeline and the renderer UI outside the variant code.
