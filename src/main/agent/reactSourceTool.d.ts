import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
/**
 * The React app's source, for the agent: the JSX an imported element came
 * from, read from the app's folder through `.scamp/react-import.json`.
 * Answered in main (`reactImport/record.ts`), which alone reads the disk.
 * Built-in only, like the write tools.
 * see docs/plans/react-import-plan.md
 */
export declare const REACT_SOURCE_TOOL: BetaTool;
