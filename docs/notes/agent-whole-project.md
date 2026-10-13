# The Scamp Agent edits the whole project

The built-in agent used to edit only what was open on the canvas. Asked to
fix every page of a React import, it told the user to open each page and
send "continue". Now every element tool, plus `scamp_get_element_tree`
and `scamp_get_element_by_id`, takes an optional `view`.

## Where an edit lands

`destinationFor` in `syncBridge/agentToolResponder.ts`:

| Asked for | Lands |
|---|---|
| No `view`, the conversation's page is open | The canvas (live store) |
| `view` names the open view | The canvas |
| `view` names another view or component | Its files (`agentOffCanvas.ts`) |
| No `view`, the user has since opened another page | The conversation's view, in its files |
| A legacy page that isn't open | Refused; it has no stored tree |

Theme tokens are project-wide and ignore `view`.

## Behind the canvas

`agentOffCanvas.ts`:

1. Reads the view with `readComponent`, once per turn (a draft).
2. Applies the same `@lib/agentEdits` function the canvas uses.
3. Writes with `cssWriteFor` / `tsxWriteFor` (the save path's incremental
   patch) and `expected*Content`. If the file changed since the draft was
   read, the edit is refused and the draft dropped, so the agent re-reads
   it.
4. Updates `componentTrees`, so reads and instances on the open page
   reflect the edit at once.

These edits run one at a time. The harness sends a reply's tool calls
together (`Promise.all`), and each edit must start from the last one's
files. Drafts are cleared when the turn ends.

## Keeping the project current

A file *change* doesn't make the watcher re-read the project (only
add/unlink do), so `project.components` would keep the old content and
the next open of that view would load it. The answer carries
`refreshProject`; main debounces a `ProjectPagesChanged` (250 ms) and
the renderer re-reads. On Linux the atomic write's rename usually reaches
chokidar as an add, which re-reads anyway, so
`test/e2e/agent/agent-other-view.spec.ts` passes with or without the
refresh there. The refresh is for watchers that report it as a change.

A re-read gives the open file a new object whenever disk differs from
what was loaded, and that used to re-run the loader, clearing the
selection and racing a pending save. `useActiveTarget` now skips the
reload when the incoming content equals `pageSource`, or the save
pipeline's last-synced content (`lastSyncedSource()` — what Scamp last
wrote or read for the open target). The second matters while an edit is
still waiting to save: `pageSource` already carries it, so a re-read of
unchanged disk looked different and reloaded over the edit (a paste just
after adding a page vanished this way). A file that changed for real —
another writer, or Scamp rewriting it for a component rename — matches
neither and still reloads.

## Undo

Edits on the canvas are one Cmd+Z per turn, as before. Edits behind the
canvas aren't in any page's history (each page's history is its own);
the conversation's Undo AI changes snapshot covers them, and the edit's
result says so.

## Limits

- The headless eval canvas (`agentHeadless.ts`) holds one view, so it
  refuses any other.
- `scamp_use_component` puts an existing component in place of a
  container on any view. Together with `scamp_extract_component`, it's
  how a shared shell reaches every page.
