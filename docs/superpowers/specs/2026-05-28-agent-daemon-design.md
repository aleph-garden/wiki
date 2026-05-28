# Agent daemon — design

**Status:** Draft
**Date:** 2026-05-28
**Author:** Christopher Mühl

## Motivation

The current agent loop polls via the MCP tool `aleph-pod__subscribe` exposed by the JSS server. A long-running interactive `claude` process holds the subscription. Drawbacks:

- One `claude` blocks on `subscribe`; further interactive sessions compete for it.
- Loop logic lives in the prompt (`prompts/agent-loop.md`), not in code — hard to test.
- No event-type routing — the prompt decides everything.
- No central validation layer: the agent can write inconsistent data.

Goal: a daemon registers itself for Solid Notifications, routes events to matching prompts, and spawns a short-lived Agent SDK query per event. Validating MCP tools run inside the daemon and only write to the pod after a SHACL check. The JSS MCP endpoint (`/mcp`) stays reachable in parallel.

## Requirements

- **Events:** container notifications on `/aleph/sessions/` over the JSS WebSocket (`solid-0.1` subprotocol).
- **Spawn:** `@anthropic-ai/claude-agent-sdk` (TypeScript) — works with the Claude Max subscription via the locally logged-in `claude` CLI. From 2026-06-15 it draws from the new Agent SDK credit pool instead of the interactive usage limit.
- **Tooling:** writes only via validating in-process daemon MCP tools. Reads/search via built-in `WebSearch` + `WebFetch`, plus `sparql_query` for Comunica federated queries.
- **Provenance:** one file per triple batch with an activity header (`WebSearchAssertion`, `SparqlAssertion`, `ImaginedAssertion`). Provenance granularity is at file level.
- **Concurrency:** one agent instance per session, serial queue.
- **Bootstrap:** on daemon start, drain unanswered user messages.
- **Stop condition:** the agent terminates when it stops calling tools (default SDK behavior).
- **Fallback:** if the agent terminates without calling `write_message`, the daemon writes a stub reply.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Bun process: agent-daemon                                  │
│                                                             │
│  ┌──────────────┐    sub /aleph/sessions/                   │
│  │ WS subscriber├───────────────────► JSS WebSocket         │
│  └──────┬───────┘                     (solid-0.1)           │
│         │ pub <url>                                         │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │ Event router │  filter: new user-msg + no reply yet      │
│  └──────┬───────┘                                           │
│         │ trigger {sessionId, msgN}                         │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │ Session queue│  per-session FIFO                         │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Agent runner: SDK query()                            │   │
│  │  ├─ Prompt: prompts/agent-event.md + trigger context │   │
│  │  ├─ Tools: WebSearch, WebFetch (built-in)            │   │
│  │  │         + in-process MCP "aleph":                 │   │
│  │  │           sparql_query, read_pod,                 │   │
│  │  │           write_message, assert_triples           │   │
│  │  └─ runs until no more tool calls                    │   │
│  └──────────────────────────────────────────────────────┘   │
│         │ MCP tool call → in-process                        │
│         ▼                                                   │
│  ┌──────────────┐  validate (SHACL) → PUT JSS               │
│  │ MCP tools    ├───────────────────► JSS HTTP              │
│  │ (validating) │  Comunica federated queries               │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴──────────────────┐
              ▼                                  ▼
   ┌──────────────────────┐         ┌──────────────────────┐
   │ JSS pod              │         │ Comunica engine      │
   │ /aleph/sessions/     │         │ (sources from config)│
   │ /aleph/concepts/     │         └──────────────────────┘
   │ /aleph/assertions/   │
   └──────────────────────┘
```

Topology decision: **single Bun process.** WS subscriber, MCP server (`createSdkMcpServer`), and agent runner share one heap — no stdio IPC, one log. `process-compose` runs the daemon as its own service next to `jss` and `vite`.

## Components

### WS subscriber (`src/daemon/subscriber.ts`)

```typescript
function subscribeContainer(
  podBase: string,
  path: string,
  onPub: (url: string) => void,
): () => void
```

- Connects to `ws://<podBase>/.notifications` with subprotocol `solid-0.1`.
- Sends `sub <podBase><path>` (e.g. `sub http://localhost:3000/aleph/sessions/`).
- Receives `pub <url>` → calls `onPub(url)`.
- Exponential backoff on disconnect (1s → 30s max), same as `src/lib/pod.ts`.

Uses the `ws` npm package (Node/Bun) instead of the browser WebSocket, but otherwise mirrors the browser client.

### Event router (`src/daemon/router.ts`)

```typescript
type Trigger = { sessionId: string; msgN: number };

async function routeEvent(url: string): Promise<Trigger | null>
```

Filter steps:

1. URL matches `/aleph/sessions/{id}/`? Otherwise null.
2. List the container, find the highest `msg{N}.jsonld`.
3. Read `msg{N}.jsonld`, check `speaker == "user"`.
4. If `msg{N+1}.jsonld` exists → null (already answered).
5. Otherwise: `Trigger { sessionId: id, msgN: N }`.

Pubs for other paths (`concepts/`, `assertions/`) are ignored in this scope.

### Session queue (`src/daemon/queue.ts`)

```typescript
class SessionQueue {
  enqueue(sessionId: string, work: () => Promise<void>): void
}
```

`Map<sessionId, Promise<void>>` — new work chains per session. Cross-session runs in parallel. Currently only one session at a time per requirements, but the queue is generic for future use.

### Agent runner (`src/daemon/runner.ts`)

```typescript
async function runAgent(trigger: Trigger, mcp: McpServer): Promise<void>
```

Calls `query()` from the Agent SDK with:

- `prompt`: rendered `prompts/agent-event.md` + trigger variables (`{{sessionId}}`, `{{msgN}}`).
- `options.allowedTools`: `['WebSearch', 'WebFetch', 'mcp__aleph__*']`.
- `options.mcpServers.aleph`: in-process MCP server instance.
- `options.permissionMode`: `'acceptEdits'` (no UI for approvals).

Iterates the async generator until the result message. Logs tool calls and errors. Tracks via closure whether `write_message` was called (for the fallback decision). Hard timeout 5 min via `AbortController`.

### MCP server (`src/daemon/mcp/`)

Created with `createSdkMcpServer({ name: 'aleph', tools: [...] })`. Tools:

```typescript
sparql_query({ query: string, sources?: string[] })
  → { bindings: object[] } | { error: 'sparql', detail: string }
// Comunica federated; sources default from config.
// 15s timeout per query.

read_pod({ path: string })
  → { body: string, contentType: string } | { error: '404' | string }
// GET against the pod with Accept: text/turtle.

write_message({ sessionId: string, msgN: number, body: string })
  → { ok: true, path: string } | { error: 'shacl' | 'conflict', report?: object }
// Wraps body in the JSON-LD reply template (see below),
// validates via SHACL, PUTs /aleph/sessions/{sid}/msg{N+1}.jsonld.

assert_triples({
  sessionId: string,
  kind: 'web' | 'sparql' | 'imagined',
  jsonld: object,
  provenance: {
    derivedFrom?: string,     // URL (kind='web')
    searchQuery?: string,     // (kind='web')
    query?: string,           // SPARQL string (kind='sparql')
    endpoints?: string[],     // (kind='sparql')
  },
})
  → { ok: true, path: string } | { error: 'shacl', report: object }
// Daemon builds the activity header (e.g. WebSearchAssertion),
// validates, PUTs /aleph/assertions/{sid}/{kind}_{ts}.jsonld.
```

**SHACL engine:** `rdf-validate-shacl` (npm). Loads `vocab/aleph-shapes.ttl` once on daemon start. Per write: parse graph → validate → if conformant, PUT; otherwise return a tool error with the violation report.

**Retry limit:** 3 failed validations per (sessionId, kind) — past that, a persistent error.

### Reply template (in `write_message`)

```jsonld
{
  "@context": "./context.jsonld",
  "@graph": [
    {
      "@id": "g:{sessionId}_msg{N+1}",
      "@type": "ChatMessage",
      "position": "{N+1}",
      "speaker": "agent",
      "body": "{body}",
      "wasGeneratedBy": "g:{sessionId}",
      "generatedAtTime": "{NOW}"
    },
    {
      "@id": "",
      "@type": "Edit",
      "editKind": "create",
      "wasGeneratedBy": "g:{sessionId}",
      "generatedAtTime": "{NOW}"
    }
  ]
}
```

### Assertion template (in `assert_triples`)

```jsonld
{
  "@context": "./context.jsonld",
  "@graph": [
    {
      "@id": "",
      "@type": "WebSearchAssertion",          // or SparqlAssertion, ImaginedAssertion
      "wasGeneratedBy": "g:{sessionId}_turn{N}",
      "derivedFrom": { "@id": "{provenance.derivedFrom}" },
      "searchQuery": "{provenance.searchQuery}",
      "generatedAtTime": "{NOW}"
    },
    /* ...agent-supplied triples from jsonld.graph... */
  ]
}
```

SHACL constraints (to be added in `vocab/aleph-shapes.ttl`):

- `WebSearchAssertion` requires `derivedFrom` (URI).
- `SparqlAssertion` requires `query` + `endpoints`.
- `ImaginedAssertion` requires only `wasGeneratedBy`.

### Daemon bootstrap (`src/daemon/main.ts`)

```typescript
async function main() {
  const config = loadConfig();
  const mcp = createMcpServer(config);
  const queue = new SessionQueue();

  await drainUnanswered(config, queue, mcp);

  subscribeContainer(config.podBase, '/aleph/sessions/', async (url) => {
    const trigger = await routeEvent(url);
    if (!trigger) return;
    queue.enqueue(trigger.sessionId, () => runAgent(trigger, mcp));
  });
}
```

`drainUnanswered`: lists `/aleph/sessions/`, applies router logic to each session, queues every matching trigger.

### Config (`config/agent-daemon.toml` or `.env`)

```
POD_BASE=http://localhost:3000
COMUNICA_SOURCES=https://dbpedia.org/sparql,https://query.wikidata.org/sparql
PROMPT_PATH=prompts/agent-event.md
```

Comunica sources are user-configurable.

### process-compose entry

```yaml
agent-daemon:
  command: bun run src/daemon/main.ts
  depends_on:
    seed: { condition: process_completed_successfully }
  environment:
    - POD_BASE=http://localhost:3000
```

### New prompt (`prompts/agent-event.md`)

A one-shot prompt per event. Variables: `{{sessionId}}`, `{{msgN}}`. Contents: task (reply to the user message in the session), tool descriptions (`read_pod`, `sparql_query`, `WebSearch`, `WebFetch`, `assert_triples`, `write_message`), provenance rules (every claim must be filed as an assertion with the right source before it's referenced in the reply), reply style (short, plain text).

`prompts/agent-loop.md` stays in place for the manual MCP mode.

## Data flow (end-to-end example)

User writes in session `s_abc` at position 3 (`msg3.jsonld`, `speaker: user`, body: "What is Solid?"):

1. JSS writes `msg3.jsonld` → JSS publishes WS `pub http://localhost:3000/aleph/sessions/s_abc/`.
2. Daemon subscriber receives → `routeEvent`:
   - lists `/aleph/sessions/s_abc/` → `[meta.ttl, context.jsonld, msg1.jsonld, msg2.jsonld, msg3.jsonld]`
   - max N = 3, reads `msg3.jsonld`, `speaker == "user"`, `msg4.jsonld` does not exist
   - returns `{ sessionId: "s_abc", msgN: 3 }`
3. `queue.enqueue("s_abc", () => runAgent(trigger, mcp))`.
4. Runner calls `query()` with the rendered prompt.
5. Agent loop:
   - **Turn 1 — read context:** `read_pod` for meta.ttl + msg1/2/3.
   - **Turn 2 — research:** `WebSearch`, `WebFetch`, `sparql_query`.
   - **Turn 3 — write back:**
     - `assert_triples(kind=web, ...)` → PUT `/aleph/assertions/s_abc/web_{ts}.jsonld`
     - `assert_triples(kind=sparql, ...)` → PUT `/aleph/assertions/s_abc/sparql_{ts}.jsonld`
     - `write_message(sessionId, msgN=3, body)` → PUT `/aleph/sessions/s_abc/msg4.jsonld`
   - **Turn 4 — no more tool calls** → SDK delivers the result → runner returns.
6. Queue resolved, `s_abc` free for the next trigger.

### Important properties

- **File-level provenance** separates LLM imagination, web sources, and SPARQL sources. `?s prov:wasGeneratedBy/a ?type` filters them.
- **Live subscription stays open while the agent runs.** Further pubs queue up — nothing dropped.
- **Self-trigger guard:** the agent writes msg4 → JSS publishes again → router reads msg4, `speaker == "agent"` → skip. No loop.
- **Pubs on `assertions/` paths go nowhere:** the router only acts on `sessions/`.

## Error handling

### Fallback reply

The runner tracks via closure whether `write_message` succeeded. After the query ends:

```typescript
if (!messageWritten) {
  await writeFallback(sessionId, msgN + 1,
    "Agent could not generate a reply.");
}
```

`writeFallback` uses the same reply template and SHACL check as the MCP tool.

### SHACL violation in MCP tool

The tool returns `{ error: "shacl", report: [...] }`. The agent sees the tool error in the loop and tries again. Max 3 attempts per (sessionId, kind) before returning a persistent error.

### Pod PUT errors

- `412 Precondition Failed` (msg position taken): structured error → the agent recomputes N via `read_pod` and retries.
- `5xx` / network: the MCP tool retries internally 3× with backoff (250ms, 500ms, 1s).

### Comunica errors

`sparql_query` returns `{ error: 'sparql', detail }`. Default timeout 15s.

### SDK errors

- Auth missing: the daemon crashes early with a `claude login required` hint.
- Rate limit (429): the SDK propagates → the runner writes a fallback "rate-limited, try again later".
- Agent runs >5 min: `AbortController` → fallback.

### WS disconnect

The subscriber reconnects with exponential backoff. After reconnect: another drain pass picks up missed events.

### Daemon crash

The daemon holds no persistent state. On restart, bootstrap drains anything pending. Duplicate replies are avoided by the idempotent PUT position (if `msg{N+1}` exists, the router skips).

### Race: new user msg while agent is running

The queue serializes per session. A new message only runs after the previous reply has been written. The router filter (`speaker == "user" && !msg{N+1}.exists`) finds the new position on its own.

## Tests

### Unit tests (`tests/daemon/`)

- **Router:** valid trigger, `speaker=agent` → null, reply exists → null, wrong path → null, empty container → null.
- **Queue:** parallel enqueue on the same `sessionId` → serial; different `sessionId`s → parallel; throw in work does not block subsequent work.
- **MCP `write_message`:** valid body → correct PUT path + wrapper; SHACL violation; 412 → `error: conflict`; sets `messageWritten`.
- **MCP `assert_triples`:** kind=web with `derivedFrom` → file + header; kind=sparql without `query` → SHACL violation; kind=imagined → minimal header.
- **SHACL engine:** loads `vocab/aleph-shapes.ttl`, valid graph conformant, missing required properties non-conformant, snapshot of the violation structure.
- **Fallback:** mock SDK without `write_message` → daemon writes the stub; with `write_message` → no stub; stub passes SHACL.

### Integration tests (`tests/daemon/integration/`)

JSS runs in-process or via the `test` process-compose profile.

- **End-to-end reply:** set up an empty session, PUT a user message, start the daemon with a mock SDK (deterministic output), expect `msg2.jsonld` + an assertion file.
- **Bootstrap drain:** 2 unanswered sessions, start the daemon, both receive a reply.
- **Self-trigger loop:** the daemon answers → JSS publishes → the router skips, counter = 1 SDK call per user message.
- **Reconnect:** cut the WS, write a msg while disconnected, daemon reconnects, drain picks it up.

### Mocks

- **MockSdk:** replaces `query()` with an async generator that yields predefined tool calls.
- **MockPod:** Bun HTTP + WS emitter backed by an in-memory map. Used for router/queue tests without JSS.

### Out of scope for tests

Comunica itself, Claude SDK internals, JSS Solid conformance, LLM answer quality.

## Relationship to the existing `agent-loop.md` model

The loop prompt writes two outputs per turn:

- a reply at `/aleph/sessions/{sid}/msg{N+1}.jsonld`
- an extend delta at `/aleph/sessions/{sid}/extend{N+1}.jsonld`

The daemon replaces that with:

- the reply at `/aleph/sessions/{sid}/msg{N+1}.jsonld` (unchanged).
- instead of a single extend delta in the session: **zero or more assertion files** under `/aleph/assertions/{sid}/{kind}_{ts}.jsonld`, one per source/activity.

Why: extend deltas in the session mix reply context with new knowledge claims. A separate path makes file-level provenance possible and decouples knowledge accumulation from the chat thread.

## Out of scope

- Per-session subscriptions (currently only container).
- Notifications on `concepts/` and `assertions/`.
- Multiple agents per session at once.
- RDF-Star for triple-level provenance (file level is enough).
- Persistent queue state (in-memory + bootstrap drain is enough).
- A custom search engine (built-in `WebSearch` is enough).
- **Frontend reader for `/aleph/assertions/`.** The UI currently renders from `concepts/`; assertion files are a new path that will be wired into the frontend in a follow-up spec.
- **Migration of legacy `extend{N}.jsonld` files** from sessions into the new assertion path.

## Open risks

- The **Agent SDK credit from 2026-06-15** may be more constrained than the current interactive limit. Needs monitoring.
- **SHACL engine choice** (`rdf-validate-shacl`) vs. alternatives — verify per-write performance.
- **`prompts/agent-event.md` wording** has to make the provenance rule very explicit, otherwise the agent will produce freehand triples without an assertion.
