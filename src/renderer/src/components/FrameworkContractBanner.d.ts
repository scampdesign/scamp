import type { FrameworkInfo } from '@shared/types';
type Props = {
    framework: FrameworkInfo;
    onDismiss: () => void;
};
/**
 * Shown above the canvas of a scamp-format project whose installed
 * `scampjs` implements a contract this build can't read or write: a
 * save would write a shape the framework doesn't understand, so the
 * user needs to know before editing.
 *
 * A MISSING `scampjs` is not a banner. Designing doesn't need it —
 * the app reads and writes the files itself — and the first preview
 * installs the project's dependencies anyway.
 * see docs/archive/2026-09-16-framework-phase-1-plan.md, step 6
 */
export declare const FrameworkContractBanner: ({ framework, onDismiss }: Props) => JSX.Element | null;
export {};
