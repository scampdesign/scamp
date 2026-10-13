import {
  failure,
  isNotification,
  parsePayload,
  RPC,
  success,
  type JsonRpcMessage,
  type JsonRpcResponse,
} from './jsonRpc';

/**
 * MCP semantics over the JSON-RPC envelope: the handshake, tool discovery,
 * and tool invocation.
 *
 * Transport-free on purpose — it takes a parsed message and returns a
 * response, so the whole protocol is testable without binding a port. The
 * HTTP layer (Phase 4) only decides status codes.
 * see docs/plans/mcp-server-plan.md, docs/notes/mcp-protocol.md
 */

/**
 * Revisions we've actually read and implemented, newest first.
 *
 * Phase 0 found real Claude Code (2.1.222) asking for `2025-11-25` — newer
 * than anything here — accepting our `2025-06-18` answer and connecting
 * normally. So this list going stale degrades to "we answer with ours and
 * the client decides", not to a broken server. Do NOT add a version here
 * without implementing whatever it changed; the point of the list is that
 * every entry is one we can honour.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;

export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const SERVER_INFO = { name: 'scamp', version: '1.0.0' } as const;

/**
 * Sent back on `initialize`. Clients surface this to the model, so it
 * reaches an agent that never read `agent.md`. It carries the one fact
 * that gets missed most — reusable UI belongs in `components/`, not on
 * a page — and points at where the full rules live.
 */
export const SERVER_INSTRUCTIONS = [
  'Scamp is a design tool that renders this project\'s TSX + CSS Module files live on a canvas.',
  'Reusable UI belongs in Scamp components — `components/<Name>/<Name>.tsx` + `<Name>.module.css` — not on a page of examples.',
  'When the user asks for components, a kit, or a library, create component folders; call scamp_get_component_scaffold for the exact starter files.',
  'A page whose design lives under `views/<Name>/` (kind `view` in scamp_list_pages) is edited there; its `app/<slug>/page.tsx` is a one-line wrapper Scamp regenerates — never edit the wrapper.',
  'Before writing the route or page that renders a view, call scamp_get_view_props for its exact props type and sample data — compute values in the route, bind them in the view. In a Scamp-framework project, scamp_list_routes shows every route file and API handler under routes/.',
  'Do not run a build or install packages to verify your work: Scamp renders files as you save them. After writing or editing a view, call scamp_check_view — a file can parse perfectly and still arrive degraded, and scamp_get_element_tree reports structure only, so it looks correct in every one of those cases. After a change across several files, call scamp_check_project to check every page, view, and component at once.',
  'Full rules, including the component file format, are in agent.md at the project root.',
].join(' ');

export type ToolDescriptor = {
  name: string;
  description: string;
  /** JSON Schema. Typed loosely because it is data, not a contract we call. */
  inputSchema: Record<string, unknown>;
};

/** MCP's tool-result shape. `isError` reports a TOOL failure, never a
 *  protocol one — see `callTool` below. */
export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export type ToolInvoker = (
  name: string,
  args: Record<string, unknown>
) => Promise<ToolResult>;

export type ProtocolDeps = {
  tools: ReadonlyArray<ToolDescriptor>;
  invoke: ToolInvoker;
};

export const textResult = (text: string): ToolResult => ({
  content: [{ type: 'text', text }],
});

export const errorResult = (text: string): ToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
});

/**
 * Answer the client's requested version if we implement it, else our latest.
 *
 * The spec allows the client to walk away when it doesn't like our answer,
 * and Phase 0 confirmed real clients instead accept an older version and
 * carry on. Either way the correct behaviour is to state what we support
 * rather than to fail the handshake.
 */
export const negotiateVersion = (asked: unknown): string =>
  typeof asked === 'string' &&
  (SUPPORTED_PROTOCOL_VERSIONS as ReadonlyArray<string>).includes(asked)
    ? asked
    : LATEST_PROTOCOL_VERSION;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Invoke a tool, converting every failure into an `isError` RESULT.
 *
 * This is the distinction hand-rolled servers most often get wrong: an
 * unknown tool name, bad arguments, or a thrown handler are all *tool*
 * outcomes the model should see and can react to. JSON-RPC errors are for
 * protocol faults only — a client that gets one for a bad tool argument
 * learns nothing and cannot retry sensibly.
 */
const callTool = async (
  deps: ProtocolDeps,
  params: unknown
): Promise<ToolResult> => {
  const { name, arguments: args } = asRecord(params);
  if (typeof name !== 'string' || name.length === 0) {
    return errorResult('Missing tool name.');
  }
  if (!deps.tools.some((tool) => tool.name === name)) {
    const known = deps.tools.map((t) => t.name).join(', ');
    return errorResult(`Unknown tool: ${name}. Available tools: ${known}`);
  }
  try {
    return await deps.invoke(name, asRecord(args));
  } catch (err) {
    // A thrown handler is a bug on our side, but the agent still needs a
    // usable answer rather than a dead turn.
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Tool ${name} failed: ${message}`);
  }
};

/**
 * Dispatch one message. Returns `null` for notifications — they get no
 * response at all, which the HTTP layer turns into a 202.
 */
export const dispatch = async (
  msg: JsonRpcMessage,
  deps: ProtocolDeps
): Promise<JsonRpcResponse | null> => {
  const { method, params } = msg;

  // Notifications are acknowledged by silence. `notifications/initialized`
  // is the only one MCP requires us to tolerate, but unknown notifications
  // must NOT produce a JSON-RPC error either — there is no id to answer to.
  if (isNotification(msg)) return null;

  const id = msg.id as string | number;

  switch (method) {
    case 'initialize':
      return success(id, {
        protocolVersion: negotiateVersion(asRecord(params)['protocolVersion']),
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });

    case 'ping':
      return success(id, {});

    case 'tools/list':
      // No pagination: the tool set is fixed and small, so a `nextCursor`
      // would be a field that is always absent.
      return success(id, { tools: deps.tools });

    case 'tools/call':
      return success(id, await callTool(deps, params));

    default:
      return failure(id, RPC.MethodNotFound, `Method not found: ${method}`);
  }
};

export type HandledPayload = {
  /** Null when there is nothing to send — every message was a notification. */
  response: JsonRpcResponse | JsonRpcResponse[] | null;
};

/**
 * Parse and dispatch a raw request body.
 *
 * The single entry point the HTTP layer needs: it decides only the status
 * code (202 when `response` is null, else 200).
 */
export const handlePayload = async (
  raw: string,
  deps: ProtocolDeps
): Promise<HandledPayload> => {
  const parsed = parsePayload(raw);

  if (parsed.kind === 'error') return { response: parsed.response };

  if (parsed.kind === 'single') {
    return { response: await dispatch(parsed.message, deps) };
  }

  const responses: JsonRpcResponse[] = [];
  for (const message of parsed.messages) {
    const response = await dispatch(message, deps);
    if (response !== null) responses.push(response);
  }
  return { response: responses.length === 0 ? null : responses };
};
