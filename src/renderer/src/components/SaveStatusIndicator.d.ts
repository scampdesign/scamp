/**
 * Header indicator showing whether canvas edits are in sync with disk.
 * Driven by `useSaveStatusStore`. Seven states; in every state the
 * pill opens a popover that includes a manual Pause / Resume toggle
 * (this replaces the old standalone `SyncPauseToggle` button).
 *
 *   - saved          — canvas == disk. Popover offers Pause sync.
 *   - unsaved        — canvas has uncommitted edits, debounce pending.
 *                      Popover offers Pause sync.
 *   - saving         — write IPC in flight. Popover offers Pause sync.
 *   - error          — write failed. Popover shows the message and
 *                      Retry; also offers Pause sync.
 *   - paused         — sync engine intentionally suspended. Popover
 *                      explains why (manual /
 *                      external-edit) and offers Resume.
 *   - diverged       — pause cleared; canvas + disk don't match;
 *                      user picks Save canvas or Discard canvas.
 *   - reloaded-from-disk
 *                    — last write hit a conflict and Scamp adopted
 *                      disk; user's in-flight edit was discarded.
 */
export declare const SaveStatusIndicator: () => JSX.Element;
