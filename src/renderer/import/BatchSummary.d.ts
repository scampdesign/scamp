import type { BatchState } from './useImportBatch';
type Props = {
    batch: BatchState;
    onStop: () => void;
    onUndo: () => void;
    onDismiss: () => void;
};
/**
 * Where a multi-page import is, route by route, and the one-step undo
 * once it has finished.
 * see docs/plans/react-import-plan.md
 */
export declare const BatchSummary: ({ batch, onStop, onUndo, onDismiss }: Props) => JSX.Element;
export {};
