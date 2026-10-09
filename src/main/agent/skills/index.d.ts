import type { AgentSkillRequest } from '@shared/types';
import type { AgentSkill } from './skill';
/** The skill a request names. */
export declare const skillFor: (request: AgentSkillRequest) => AgentSkill;
export type { AgentSkill } from './skill';
