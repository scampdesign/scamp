import type { EmbeddedCheck } from '@shared/types';
type Props = {
    check: EmbeddedCheck;
    /** Run a fix the check offers, then check again. */
    onFix: (fix: NonNullable<EmbeddedCheck['fix']>, value?: string) => Promise<void>;
};
/** One line of the setup screen: what Scamp checked, and a fix when it has one. */
export declare const CheckRow: ({ check, onFix }: Props) => JSX.Element;
export {};
