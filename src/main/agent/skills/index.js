import { importCleanupSkill } from './importCleanup';
/** The skill a request names. */
export const skillFor = (request) => importCleanupSkill(request.tokenMode);
