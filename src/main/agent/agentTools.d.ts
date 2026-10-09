import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ToolDescriptor } from '../mcp/protocol';
export declare const agentToolsFrom: (descriptors: ReadonlyArray<ToolDescriptor>) => BetaTool[];
