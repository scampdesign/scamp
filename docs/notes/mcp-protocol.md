# The MCP protocol, as Scamp implements it

We hand-roll MCP on Node's `http` rather than taking
`@modelcontextprotocol/sdk`. This note exists so nobody has to re-derive the
protocol from the spec to make a change — it records **what we implement, what
we deliberately skip, and what a real client was observed doing.**

Code: `src/main/mcp/jsonRpc.ts` (envelope) and `protocol.ts` (semantics).
Plan and decision history: `docs/archive/2026-08-06-mcp-server-plan.md`.

## Why hand-rolled

The SDK pulls 17 transitive dependencies — Express 5, hono, jose, ajv, zod,
cors — into the **main process bundle**, to expose eight read-only functions
on localhost. Against CLAUDE.md's lean-bundle rule that's a poor trade for
~250 lines we can own.

The risk we accepted is protocol drift. It's survivable because **version
negotiation is tolerant**, which we verified rather than assumed — see below.

## What we implement

| Method | Behaviour |
|---|---|
| `initialize` | Returns `{protocolVersion, capabilities: {tools: {}}, serverInfo}` |
| `notifications/initialized` | No response. HTTP 202, empty body |
| `ping` | Empty result |
| `tools/list` | All eight descriptors with JSON Schema |
| `tools/call` | `{content: [{type: 'text', text}], isError?}` |
| anything else | JSON-RPC `-32601` |

Transport: `POST /mcp` only. `GET` and `DELETE` → **405**. Malformed JSON →
`-32700`. Body over 1 MB → 413. Binds `127.0.0.1`.

## What we deliberately skip

No SSE, no `Mcp-Session-Id` (stateless), no resources, no prompts, no
pagination cursor, no `structuredContent`, no server→client requests.

JSON-RPC **batches** are supported even though the current MCP revision
dropped them — it's a `.map`, and clients have already been observed running
ahead of the spec we coded to.

## The one rule that is easy to get wrong

**Tool failures are results, not JSON-RPC errors.**

An unknown tool name, a bad argument, a thrown handler, a renderer timeout —
all return a normal `result` with `isError: true`. JSON-RPC errors are only
for protocol faults: unknown method, malformed request.

A client that receives `-32601` because it passed a bad tool argument learns
nothing it can act on and cannot retry sensibly. `protocol.ts` funnels every
tool outcome through `callTool`, which is where this is enforced.

## Version negotiation

`SUPPORTED_PROTOCOL_VERSIONS` lists only revisions we have actually read and
implemented, newest first. We answer with the client's version if it's in the
list, otherwise our latest.

**Observed, not assumed:** Claude Code 2.1.222 asked for `2025-11-25` — newer
than anything in our list — accepted our `2025-06-18`, and connected
normally. So the list going stale degrades to "still works", not to a broken
server.

**Do not add a version to that list without implementing whatever it
changed.** The list's contract is that every entry is one we can honour;
negotiation already covers the gap for the rest.

## What a real client actually sends

From a Phase 0 trace against Claude Code 2.1.222. Several of these are load-
bearing and would be easy to get wrong from the spec alone:

- Subsequent requests carry `MCP-Protocol-Version: <negotiated>` — the version
  we agreed on, **not** the one it asked for. Don't validate it against our
  latest.
- It issues `GET /mcp` with `Accept: text/event-stream`, trying to open a
  server stream. Our 405 is correct; it carries on.
- `Accept` arrives as `application/json, text/event-stream` — **with a
  space**. Parse it; never string-compare.
- No `Origin` header at all, which is what makes our Origin rejection safe.

## Security

Two checks, both before anything else, `Origin` first:

1. **Any request carrying an `Origin` header is rejected (403).** A web page
   the user has open can `fetch()` a localhost port, and DNS rebinding defeats
   naive host checks; the spec requires local servers to validate this.
2. **A per-project token is required** (`X-Scamp-Token`, 401 otherwise). The
   token is stable across launches and lives in `.scamp/mcp.json` — it ends up
   in the agent's config file, which is not re-read at runtime, so rotating it
   would break every registration on every restart.

Origin is checked first so a browser learns nothing about token validity.
