/**
 * Turns a whole project into the text files of an HTML export.
 *
 * Pure, and deliberately so: it takes the project's source as strings and
 * returns files as strings, leaving every disk operation to the main
 * process. That keeps the part with all the decisions in it — which page
 * links where, which stylesheet an instance's rules land in, how deep a
 * relative path has to climb — testable without Electron or a temp dir.
 *
 * see docs/archive/2026-08-27-html-export-plan.md
 */
/** A file to write, at a path relative to the export root. */
export type ExportFile = {
    path: string;
    contents: string;
};
export type ExportSourceFile = {
    name: string;
    tsxContent: string;
    cssContent: string;
};
export type HtmlExportInput = {
    /** Used as each page's `<title>`, matching `layout.tsx`'s metadata. */
    projectName: string;
    pages: ReadonlyArray<ExportSourceFile>;
    components: ReadonlyArray<ExportSourceFile>;
    /** Raw `theme.css`, copied to the export root. */
    themeCss: string;
};
export type HtmlExportResult = {
    files: ExportFile[];
    /** Pages that couldn't be parsed, so the caller can say which were skipped. */
    skipped: Array<{
        pageName: string;
        reason: string;
    }>;
};
/** Name of the shared stylesheet at the export root. */
export declare const THEME_FILE = "theme.css";
export declare const buildHtmlExport: (input: HtmlExportInput) => HtmlExportResult;
