/**
 * "Optimising image…" while an import converts.
 *
 * The conversion runs in a child process, so nothing is actually
 * blocked — but a large photo takes a second or two, and silence for
 * that long reads as a hang rather than as work.
 * see docs/archive/2026-08-14-image-import-speed-plan.md
 */
export declare const ImageImportIndicator: () => JSX.Element | null;
