/**
 * The tools the built-in agent is offered, in the provider's shape.
 *
 * The read tools are the MCP server's own descriptors, so the two never
 * describe the canvas differently. Left out: the component scaffold, which
 * hands back files to write — the built-in agent edits through the store,
 * never by writing files.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */
const EXCLUDED = new Set(['scamp_get_component_scaffold']);
const isObjectSchema = (schema) => schema['type'] === 'object';
export const agentToolsFrom = (descriptors) => descriptors
    .filter((d) => !EXCLUDED.has(d.name))
    // Sorted so the list is byte-identical every request — it sits at the
    // front of the cached prefix, and a reordering would miss the cache.
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((d) => isObjectSchema(d.inputSchema)
    ? [{ name: d.name, description: d.description, input_schema: d.inputSchema }]
    : []);
