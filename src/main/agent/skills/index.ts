import type { AgentSkillRequest } from '@shared/types';

import { importCleanupSkill } from './importCleanup';
import type { AgentSkill } from './skill';

/** The skill a request names. */
export const skillFor = (request: AgentSkillRequest): AgentSkill => importCleanupSkill(request.tokenMode);

export type { AgentSkill } from './skill';
