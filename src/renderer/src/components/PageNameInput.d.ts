type Props = {
    initialValue?: string;
    /** Other page names in the project — drives collision feedback. */
    existingNames: ReadonlyArray<string>;
    onConfirm: (name: string) => void;
    onCancel: () => void;
    /** If present, range selected on mount so the user can retype quickly. */
    selectRange?: [number, number];
    /** External error message (e.g. IPC failure) shown under the input. */
    error?: string | null;
    /** When true, input is read-only and shows a loading indicator. */
    busy?: boolean;
};
/**
 * Inline text input for naming or renaming a page. Used by the
 * "Add page" flow and the "Duplicate" flow. Autofocuses on mount;
 * validates on every keystroke and surfaces the first error under the
 * field. Enter confirms (when valid), Escape cancels, blur cancels.
 */
export declare const PageNameInput: ({ initialValue, existingNames, onConfirm, onCancel, selectRange, error: externalError, busy, }: Props) => JSX.Element;
export {};
