import type { ImportReportGroup } from '@shared/types';
export declare const cleanupRequest: (viewName: string, report: ReadonlyArray<ImportReportGroup>) => string;
/**
 * The first message of a React import tidy-up: the view, and what the
 * import kept as copies or simplified — the leftovers the source may
 * explain, like a navigation whose selected item differs by page.
 * see docs/plans/react-import-plan.md, Phase 6
 */
export declare const reactTidyRequest: (viewName: string, appName: string, notes: ReadonlyArray<string>) => string;
