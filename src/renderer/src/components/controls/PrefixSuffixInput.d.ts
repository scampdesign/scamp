import { type ReactNode, type Ref } from 'react';
type Props = {
    /** Current committed value — reflected into the input text. */
    value: string;
    /** Called on blur or Enter with the trimmed draft. The parent may
     * accept (call its own onChange) or ignore (draft reverts to `value`
     * via the useEffect sync). */
    onCommit: (value: string) => void;
    /** Optional per-keystroke observer. Mostly unused. */
    onDraftChange?: (draft: string) => void;
    /** Label inside the row's left edge (e.g. "W", "Sz") or a custom node. */
    prefix?: ReactNode;
    /** Value for the row's `data-prefix` attribute (the stable test/query
     *  hook). Defaults to `prefix` when it's a string; pass this when the
     *  prefix is an icon node so the field is still locatable. */
    dataPrefix?: string;
    /** Node at the row's right edge (unit indicator, picker button, caret). */
    suffix?: ReactNode;
    /** Removes the row's left padding + gap so a flush-mounted swatch or
     * border-radius prefix can sit against the outer border. */
    flushPrefix?: boolean;
    placeholder?: string;
    inputMode?: 'text' | 'numeric' | 'decimal';
    /** Tooltip shown on hover of the whole row. */
    title?: string;
    disabled?: boolean;
    /** ArrowUp / ArrowDown handler — parent implements numeric stepping. */
    onArrow?: (draft: string, direction: 1 | -1, shift: boolean) => void;
    /** Stop shortcut keys (V, R, T, I, …) from firing while the user types. */
    stopKeyPropagation?: boolean;
    inputRef?: Ref<HTMLInputElement>;
    /** Extra className on the <input>. Rare. */
    inputClassName?: string;
    /** Spellcheck on the input. Default false — most inputs hold identifiers. */
    spellCheck?: boolean;
    autoCapitalize?: 'off' | 'on' | 'none' | 'sentences' | 'words' | 'characters';
    autoCorrect?: 'off' | 'on';
    /**
     * When true, the displayed value is read from layout (e.g. an
     * element's measured `offsetWidth` while in `fit-content` mode)
     * rather than directly authored. Renders the value in a dimmed +
     * italic style so the user can tell at a glance "this number is a
     * read-out, not a stored value." Editing still works as a shortcut
     * — typing commits a new value to the parent's `onCommit`, which
     * may switch the field to a fixed mode.
     */
    computed?: boolean;
    /** Several selected elements disagree: show **Mixed**, and commit whatever is typed. */
    mixed?: boolean;
};
/**
 * Shared prefix + input + suffix row. Owns local draft state so the
 * caller only sees committed values. On blur, calls `onCommit` then
 * restores the draft to `value`; if the caller updates `value` in
 * response, the effect below syncs the draft forward — so a valid
 * commit reads as "draft moves to new value" and an invalid one reads
 * as "draft reverts".
 */
export declare const PrefixSuffixInput: ({ value, onCommit, onDraftChange, prefix, dataPrefix, suffix, flushPrefix, placeholder, inputMode, title, disabled, onArrow, stopKeyPropagation, inputRef, inputClassName, spellCheck, autoCapitalize, autoCorrect, computed, mixed, }: Props) => JSX.Element;
export {};
