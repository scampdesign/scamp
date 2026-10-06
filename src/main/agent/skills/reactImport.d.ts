import type { AgentSkill } from './skill';
/**
 * React import tidy-up: the part of importing a React app that needs the
 * source, not the render. The deterministic import already made the app's
 * components, its lists into repeats, and kept its tokens; one render
 * can't say what a page shows only sometimes, or what the app calls its
 * lists. The source can.
 * see docs/plans/react-import-plan.md, Phase 6
 */
export declare const REACT_IMPORT_VERSION = 1;
export declare const reactImportSkill: () => AgentSkill;
