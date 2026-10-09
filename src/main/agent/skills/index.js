import { importCleanupSkill } from './importCleanup';
import { reactImportSkill } from './reactImport';
/** The skill a request names. */
export const skillFor = (request) => request.id === 'react-import' ? reactImportSkill() : importCleanupSkill(request.tokenMode);
