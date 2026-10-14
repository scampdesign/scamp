import { type ContextInput } from './contextModel';
/**
 * The live context file Scamp writes to `.scamp/context.md` — the open
 * target and the selected element, in markdown an agent can read at the
 * start of a turn instead of asking the user to describe what they clicked.
 *
 * A renderer over `contextModel`, nothing more. The facts live there so this
 * and the copy-context one-liner can't disagree.
 * see docs/archive/2026-08-05-live-context-file-plan.md
 */
export type { ContextInput, ContextTarget } from './contextModel';
/**
 * Render the whole file.
 *
 * Sections that would be empty are omitted rather than emitted with a
 * placeholder — an agent reading "Custom properties: none" learns nothing,
 * while an absent heading is unambiguous.
 */
export declare const buildContextMarkdown: (input: ContextInput) => string;
