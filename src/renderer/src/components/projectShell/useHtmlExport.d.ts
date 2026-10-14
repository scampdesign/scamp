import { type HtmlExportStatus } from '@lib/htmlExportStatus';
/**
 * Exports the whole project as a folder of static HTML + CSS.
 *
 * Page and component sources are re-read from disk rather than taken from
 * the store: the export must reflect what's actually saved, and re-reading
 * is both simpler and more truthful than rebuilding source from the live
 * element model.
 *
 * The status is surfaced to the caller rather than only logged. Revealing
 * the folder is not reliable feedback on its own — on Linux `shell.openPath`
 * can no-op with no error — so a success that the user can't see is
 * indistinguishable from a failure they can't see either.
 *
 * see docs/archive/2026-08-27-html-export-plan.md
 */
export type HtmlExportState = {
    exportHtml: () => Promise<void>;
    status: HtmlExportStatus;
    /** Success summary or failure reason, for the button label and tooltip. */
    message: string | null;
    /** Where the export landed — Scamp names the folder, so this is news. */
    location: string | null;
};
export declare const useHtmlExport: (projectPath: string, projectName: string) => HtmlExportState;
