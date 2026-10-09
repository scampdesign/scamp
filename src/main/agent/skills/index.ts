import type { AgentSkillRequest } from '@shared/types';

import { importCleanupSkill } from './importCleanup';
import { reactImportSkill } from './reactImport';
import type { AgentSkill } from './skill';

/** The skill a request names. */
export const skillFor = (request: AgentSkillRequest): AgentSkill =>
  request.id === 'react-import' ? reactImportSkill() : importCleanupSkill(request.tokenMode);

export type { AgentSkill } from './skill';
