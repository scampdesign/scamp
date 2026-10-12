type Props = {
    initialValue: string;
    /** Why a proposed name can't be used, or null. */
    nameError: (name: string) => string | null;
    onConfirm: (name: string) => void;
    onCancel: () => void;
};
/** Inline name field for a page group. Enter or blur saves; Escape cancels. */
export declare const PageGroupNameInput: ({ initialValue, nameError, onConfirm, onCancel }: Props) => JSX.Element;
export {};
