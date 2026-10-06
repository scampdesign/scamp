import type { AgentTokenMode as TokenMode } from '@shared/types';
import type { AgentSkill } from './skill';
/**
 * Import cleanup: turn a page Scamp imported from a website into a clean,
 * editable Scamp page — without changing how it looks.
 *
 * The deterministic importer stays the first pass and works with no key;
 * this is the layer on top. When a step here fires on most pages, that's
 * a case for teaching the importer, so every user gets it.
 * see docs/plans/builtin-agent-plan.md
 */
export declare const IMPORT_CLEANUP_VERSION = 2;
export declare const importCleanupSkill: (tokenMode: TokenMode) => AgentSkill;
