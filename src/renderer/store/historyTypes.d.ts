import type { PropertyGroup, ScampElement } from '@lib/element';
/**
 * Discriminated taxonomy of canvas mutations the history panel
 * surfaces. Labels are generated from this kind plus the entry's
 * resolved metadata at display time — see `formatHistoryLabel`.
 */
export type HistoryActionKind = 'draw-rect' | 'add-text' | 'add-image' | 'add-input' | 'add-component-instance' | 'convert-to-component' | 'detach-instance' | 'load' | 'delete' | 'delete-contents' | 'cut' | 'move' | 'resize' | 'patch' | 'raw-css' | 'rename' | 'rename-page' | 'add-page' | 'delete-page' | 'paste' | 'duplicate' | 'group' | 'ungroup' | 'wrap-link' | 'reorder' | 'toggle-group' | 'external-edit'
/** One Scamp Agent turn's edits, undone together. */
 | 'agent-edit'
/** A component's variant axes or values added, renamed, or removed. */
 | 'variants';
/**
 * One entry in a page's history stack. Stores the post-action
 * snapshot of the elements map plus the metadata needed to render
 * a human-readable label and to drive coalescing decisions.
 *
 * `elementIds` is empty for page-scope actions (`add-page`,
 * `delete-page`) and `external-edit`. For the common single-
 * element actions it has one id; for batch actions (group,
 * deleteSelected) it has many.
 *
 * `snapshot` is a full copy of the elements map after the action
 * committed. Restoring this entry replaces the live elements map
 * with this snapshot. v1 uses full snapshots; if memory becomes
 * a problem we can switch to JSON-Patch deltas without changing
 * the metadata shape.
 */
export type HistoryEntry = {
    id: string;
    timestamp: number;
    kind: HistoryActionKind;
    elementIds: ReadonlyArray<string>;
    /**
     * For `kind: 'patch'`: the keys of the patch object that
     * triggered this entry. Used for coalescing (same element,
     * same property keys, within 500ms → fold into the previous
     * entry) AND for the label (`Changed background`).
     */
    propertyKeys?: ReadonlyArray<keyof ScampElement>;
    /** For `rename` / `rename-page`: the previous name. */
    previousName?: string;
    /** For `add-page` / `delete-page` / `rename-page`. */
    pageName?: string;
    /** For `toggle-group`: the group that was flipped and whether
     *  it's now ON or OFF. Drives the label
     *  ("Hid Shadow — rect_a1b2" / "Showed Shadow — rect_a1b2"). */
    toggleGroup?: PropertyGroup;
    toggleGroupOn?: boolean;
    /** Full elements map after this action committed. */
    snapshot: Record<string, ScampElement>;
};
/** One page's worth of history. */
export type PageHistory = {
    /** Ordered list, oldest first, newest last. Capped at MAX_HISTORY_ENTRIES. */
    entries: HistoryEntry[];
    /**
     * Index of the entry the user is currently AT. `entries[cursor]`
     * is the state the canvas is showing. `cursor === -1` means
     * "no entries yet" (fresh page, no actions taken).
     */
    cursor: number;
};
/** Bump if users ask for more session memory. */
export declare const MAX_HISTORY_ENTRIES = 50;
/** Same-element/same-property edits within this window coalesce. */
export declare const COALESCE_WINDOW_MS = 500;
