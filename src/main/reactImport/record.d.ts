import type { ReactImportRecord } from '@shared/types';
/**
 * `.scamp/react-import.json`: where each element of a React import came
 * from. Electron-free; the IPC layer supplies the app's folder.
 * see docs/plans/react-import-plan.md
 */
export declare const RECORD_FILE: string;
export declare const readRecord: (projectPath: string) => Promise<ReactImportRecord | null>;
/**
 * Add a finished import to the record. A view or component imported again
 * replaces its entry; the app's folder is kept unless a new one is known.
 */
export declare const mergeRecord: (projectPath: string, update: {
    appName: string;
    folder: string | null;
    views: ReactImportRecord["views"];
    components: ReactImportRecord["components"];
}) => Promise<ReactImportRecord>;
/** The id in a class name (`dp_nav_item_0010` → `0010`), or the id as given. */
export declare const elementIdFrom: (element: string) => string;
/**
 * The agent's read of the app's source: the JSX around an element, with
 * line numbers; or, with no element, which source files the target drew
 * from and which of its elements each one wrote.
 */
export declare const sourceFor: (record: ReactImportRecord | null, target: string, element: string | undefined) => Promise<{
    ok: true;
    text: string;
} | {
    ok: false;
    error: string;
}>;
