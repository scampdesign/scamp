/**
 * Two-way sync between the Design System prose forms (the store's
 * `designProse`) and DESIGN.md:
 *
 *  - on open, load the file's authored prose into the store;
 *  - on any token / prose change, regenerate DESIGN.md (debounced 500ms),
 *    writing only when the content actually changed;
 *  - when DESIGN.md changes on disk, read the prose back — but ignore the
 *    echoes of our OWN writes (tracked via `lastWritten`) so a self-write
 *    can't be mistaken for an external edit and clobber in-flight edits.
 *
 * The token YAML is always derived from theme.css; only the prose round-trips.
 * see docs/archive/2026-07-23-design-system-plan.md
 */
export declare const useDesignMdSync: (projectPath: string, projectName: string) => void;
