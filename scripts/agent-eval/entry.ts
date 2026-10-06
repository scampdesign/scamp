// Everything the import-cleanup eval needs from the app, bundled together
// by esbuild so the eval reads the TypeScript sources — never a stale shim.
export { captureFn, capturePolicy, prepareFn } from '../../src/shared/captureScript';
export { reduceCapture } from '../../src/renderer/lib/importReduce';
export { generateCode } from '../../src/renderer/lib/generateCode';
export { parseCode } from '../../src/renderer/lib/parseCode';
export { buildHtmlExport } from '../../src/renderer/lib/htmlExport';
export { lintView } from '../../src/renderer/lib/viewLint';
export { parseThemeFile } from '../../src/renderer/lib/parseTheme';
export { classNameFor } from '../../src/renderer/lib/generateCode';
export { createHeadlessCanvas } from '../../src/renderer/lib/agentHeadless';
export { DEFAULT_THEME_CSS } from '../../src/shared/templates/themeCss';
export { runTurn } from '../../src/main/agent/harness';
export { agentToolsFrom } from '../../src/main/agent/agentTools';
export { WRITE_TOOLS } from '../../src/main/agent/writeTools';
export { TOOL_DESCRIPTORS } from '../../src/main/mcp/tools';
export { AGENT_SYSTEM_PROMPT } from '../../src/main/agent/systemPrompt';
export { importCleanupSkill } from '../../src/main/agent/skills/importCleanup';
export { createAnthropicProvider } from '../../src/main/agent/anthropicProvider';
export { createScriptedProvider } from '../../src/main/agent/scriptedProvider';
export { needsConfirmation } from '../../src/main/agent/confirmPolicy';
export { AGENT_MODEL } from '../../src/main/agent/config';
