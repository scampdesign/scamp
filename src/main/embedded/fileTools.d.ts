import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AgentToolInvoker } from '../agent/harness';
/** The project-relative path a tool may touch, or why it may not. */
export declare const guardPath: (folder: string, path: unknown, forWrite: boolean) => {
    ok: true;
    rel: string;
    abs: string;
} | {
    ok: false;
    error: string;
};
export declare const EMBEDDED_READ_TOOLS: BetaTool[];
export declare const EMBEDDED_TOOLS: BetaTool[];
export declare const EMBEDDED_WRITE_TOOL_NAMES: Set<string>;
/** A tool invoker for one project; `touched` collects every file it wrote. */
export declare const embeddedToolInvoker: (folder: string, touched: Set<string>, readOnly: boolean) => AgentToolInvoker;
