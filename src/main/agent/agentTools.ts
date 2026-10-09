import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import type { ToolDescriptor } from '../mcp/protocol';

/**
 * The tools the built-in agent is offered, in the provider's shape.
 *
 * The read tools are the MCP server's own descriptors, so the two never
 * describe the canvas differently. Left out: the component scaffold, which
 * hands back files to write — the built-in agent edits through the store,
 * never by writing files.
 * see docs/plans/builtin-agent-plan.md
 */
const EXCLUDED: ReadonlySet<string> = new Set(['scamp_get_component_scaffold']);

const isObjectSchema = (schema: Record<string, unknown>): schema is BetaTool['input_schema'] =>
  schema['type'] === 'object';

export const agentToolsFrom = (descriptors: ReadonlyArray<ToolDescriptor>): BetaTool[] =>
  descriptors
    .filter((d) => !EXCLUDED.has(d.name))
    // Sorted so the list is byte-identical every request — it sits at the
    // front of the cached prefix, and a reordering would miss the cache.
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((d) =>
      isObjectSchema(d.inputSchema)
        ? [{ name: d.name, description: d.description, input_schema: d.inputSchema }]
        : []
    );
