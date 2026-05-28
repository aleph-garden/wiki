# Agent-Daemon — Design

**Status:** Draft
**Date:** 2026-05-28
**Author:** Christopher Mühl

## Motivation

Der aktuelle Agent-Loop polled per MCP-Tool `aleph-pod__subscribe` im JSS-Server. Ein langlebiger interaktiver `claude`-Prozess hält die Subscription. Nachteile:

- Ein `claude` blockiert auf `subscribe`, weitere interaktive Sessions konkurrieren.
- Loop-Logik liegt im Prompt (`prompts/agent-loop.md`), nicht im Code — schwer testbar.
- Kein Routing nach Event-Typ — der Prompt entscheidet alles.
- Keine zentrale Validierungs-Schicht: Agent kann inkonsistente Daten schreiben.

Ziel: Ein Daemon registriert sich selbst auf Solid-Notifications, routet Events auf passende Prompts und spawnt pro Event eine kurzlebige Agent-SDK-Query. Validierende MCP-Tools laufen im Daemon und schreiben erst nach SHACL-Check zum Pod. Der MCP-Endpoint in JSS (`/mcp`) bleibt parallel erreichbar.

## Anforderungen

- **Events:** Container-Notifications auf `/aleph/sessions/` über JSS-WebSocket (`solid-0.1` subprotocol).
- **Spawn:** `@anthropic-ai/claude-agent-sdk` (TypeScript) — funktioniert mit Claude Max Subscription via lokal eingeloggtem `claude`-CLI. Ab 15.06.2026 zieht das aus dem neuen Agent-SDK-Credit-Topf statt aus interaktivem Limit.
- **Tooling:** Schreib-Pfad ausschließlich über validierende Daemon-MCP-Tools (in-process). Lese-/Such-Pfad: built-in `WebSearch` + `WebFetch`, plus `sparql_query` für föderierte Comunica-Queries.
- **Provenance:** Pro Triple-Batch eine eigene Datei mit Activity-Header (`WebSearchAssertion`, `SparqlAssertion`, `ImaginedAssertion`). Granularität auf Datei-Ebene.
- **Concurrency:** Eine Agent-Instanz pro Session, serielle Queue.
- **Bootstrap:** Beim Daemon-Start unbeantwortete user-msgs nachholen.
- **Stop-Bedingung:** Agent endet wenn keine Tool-Calls mehr kommen (Standard SDK-Verhalten).
- **Fallback:** Wenn Agent ohne `write_message` terminiert → Daemon schreibt Stub-Reply.

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│  Bun-Prozess: agent-daemon                                  │
│                                                             │
│  ┌──────────────┐    sub /aleph/sessions/                   │
│  │ WS-Subscriber├───────────────────► JSS WebSocket         │
│  └──────┬───────┘                     (solid-0.1)           │
│         │ pub <url>                                         │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │ Event-Router │  Filter: ist neue user-msg + kein reply   │
│  └──────┬───────┘                                           │
│         │ trigger {sessionId, msgN}                         │
│         ▼                                                   │
│  ┌──────────────┐                                           │
│  │ Session-Queue│  per-session FIFO                         │
│  └──────┬───────┘                                           │
│         ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Agent-Runner: query() vom SDK                        │   │
│  │  ├─ Prompt: prompts/agent-event.md + Trigger-Kontext │   │
│  │  ├─ Tools: WebSearch, WebFetch (built-in)            │   │
│  │  │         + in-process MCP "aleph":                 │   │
│  │  │           sparql_query, read_pod,                 │   │
│  │  │           write_message, assert_triples           │   │
│  │  └─ läuft bis kein tool-call mehr                    │   │
│  └──────────────────────────────────────────────────────┘   │
│         │ MCP-Tool-Call → in-Process                        │
│         ▼                                                   │
│  ┌──────────────┐  Validate (SHACL) → PUT JSS               │
│  │ MCP-Tools    ├───────────────────► JSS HTTP              │
│  │ (validating) │  Comunica federated queries               │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴──────────────────┐
              ▼                                  ▼
   ┌──────────────────────┐         ┌──────────────────────┐
   │ JSS Pod              │         │ Comunica engine      │
   │ /aleph/sessions/     │         │ (sources aus config) │
   │ /aleph/concepts/     │         └──────────────────────┘
   │ /aleph/assertions/   │
   └──────────────────────┘
```

Topologie-Entscheidung: **Single Bun-Prozess.** WS-Subscriber, MCP-Server (`createSdkMcpServer`) und Agent-Runner laufen im selben Heap, kein stdio-IPC, ein Log. Process-Compose startet den Daemon als eigenen Service neben `jss` und `vite`.

## Komponenten

### WS-Subscriber (`src/daemon/subscriber.ts`)

```typescript
function subscribeContainer(
  podBase: string,
  path: string,
  onPub: (url: string) => void,
): () => void
```

- Verbindet sich mit `ws://<podBase>/.notifications`, Subprotocol `solid-0.1`.
- Sendet `sub <podBase><path>` (z.B. `sub http://localhost:3000/aleph/sessions/`).
- Empfängt `pub <url>` → ruft `onPub(url)`.
- Exponentielles Backoff bei Disconnect (1s → 30s max), wie in `src/lib/pod.ts`.

Implementierung nutzt `ws`-npm-package (Node/Bun) statt Browser-WebSocket, ansonsten gleiche Logik wie der Browser-Client.

### Event-Router (`src/daemon/router.ts`)

```typescript
type Trigger = { sessionId: string; msgN: number };

async function routeEvent(url: string): Promise<Trigger | null>
```

Filter-Schritte:

1. URL matched `/aleph/sessions/{id}/`? Wenn nicht → null.
2. Liste Container, finde max `msg{N}.jsonld`.
3. Lese `msg{N}.jsonld`, prüfe `speaker == "user"`.
4. Wenn `msg{N+1}.jsonld` existiert → null (schon beantwortet).
5. Sonst: `Trigger { sessionId: id, msgN: N }`.

Pubs auf andere Pfade (`concepts/`, `assertions/`) werden im aktuellen Scope ignoriert.

### Session-Queue (`src/daemon/queue.ts`)

```typescript
class SessionQueue {
  enqueue(sessionId: string, work: () => Promise<void>): void
}
```

`Map<sessionId, Promise<void>>` — neue Arbeit chained pro Session. Cross-session läuft parallel. Aktuell läuft laut Anforderung nur eine Session gleichzeitig, die Queue ist generisch für spätere Erweiterung.

### Agent-Runner (`src/daemon/runner.ts`)

```typescript
async function runAgent(trigger: Trigger, mcp: McpServer): Promise<void>
```

Ruft `query()` vom Agent SDK mit:

- `prompt`: gerenderter `prompts/agent-event.md` + Trigger-Variablen (`{{sessionId}}`, `{{msgN}}`).
- `options.allowedTools`: `['WebSearch', 'WebFetch', 'mcp__aleph__*']`.
- `options.mcpServers.aleph`: in-process MCP-Server-Instanz.
- `options.permissionMode`: `'acceptEdits'` (kein UI für Approvals).

Iteriert async-Generator bis Result-Message. Loggt Tool-Calls und Errors. Trackt per Closure ob `write_message` aufgerufen wurde (für Fallback-Entscheidung). Hartes Timeout 5 min via `AbortController`.

### MCP-Server (`src/daemon/mcp/`)

Erstellt mit `createSdkMcpServer({ name: 'aleph', tools: [...] })`. Tools:

```typescript
sparql_query({ query: string, sources?: string[] })
  → { bindings: object[] } | { error: 'sparql', detail: string }
// Comunica federated; sources default aus config.
// Timeout 15s pro query.

read_pod({ path: string })
  → { body: string, contentType: string } | { error: '404' | string }
// GET an Pod mit Accept: text/turtle.

write_message({ sessionId: string, msgN: number, body: string })
  → { ok: true, path: string } | { error: 'shacl' | 'conflict', report?: object }
// Wraps body in JSON-LD Reply-Template (siehe Reply-Template unten),
// validates via SHACL, PUT /aleph/sessions/{sid}/msg{N+1}.jsonld.

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
// Daemon baut Activity-Header (z.B. WebSearchAssertion),
// validiert, PUT /aleph/assertions/{sid}/{kind}_{ts}.jsonld.
```

**SHACL-Engine:** `rdf-validate-shacl` (npm). Lädt `vocab/aleph-shapes.ttl` einmal beim Daemon-Start. Pro Write: Graph parsen → validate → bei conformant: PUT, sonst Tool-Error mit Violation-Report.

**Retry-Limit:** 3 fehlgeschlagene Validations pro (sessionId, kind) — danach persistent error.

### Reply-Template (in `write_message`)

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

### Assertion-Template (in `assert_triples`)

```jsonld
{
  "@context": "./context.jsonld",
  "@graph": [
    {
      "@id": "",
      "@type": "WebSearchAssertion",          // oder SparqlAssertion, ImaginedAssertion
      "wasGeneratedBy": "g:{sessionId}_turn{N}",
      "derivedFrom": { "@id": "{provenance.derivedFrom}" },
      "searchQuery": "{provenance.searchQuery}",
      "generatedAtTime": "{NOW}"
    },
    /* ...agent-gelieferte triples aus jsonld.graph... */
  ]
}
```

SHACL-Constraints (in `vocab/aleph-shapes.ttl` zu ergänzen):

- `WebSearchAssertion` → `derivedFrom` Pflicht (URI).
- `SparqlAssertion` → `query` + `endpoints` Pflicht.
- `ImaginedAssertion` → nur `wasGeneratedBy`.

### Daemon-Bootstrap (`src/daemon/main.ts`)

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

`drainUnanswered`: listet `/aleph/sessions/`, wendet auf jede Session die Router-Logik an, queued alle gefundenen Trigger.

### Config (`config/agent-daemon.toml` oder `.env`)

```
POD_BASE=http://localhost:3000
COMUNICA_SOURCES=https://dbpedia.org/sparql,https://query.wikidata.org/sparql
PROMPT_PATH=prompts/agent-event.md
```

Comunica-Quellen sind user-konfigurierbar.

### Process-Compose-Eintrag

```yaml
agent-daemon:
  command: bun run src/daemon/main.ts
  depends_on:
    seed: { condition: process_completed_successfully }
  environment:
    - POD_BASE=http://localhost:3000
```

### Neuer Prompt (`prompts/agent-event.md`)

Pro Event ein One-Shot-Prompt. Variablen: `{{sessionId}}`, `{{msgN}}`. Inhalt: Aufgabe (auf user-msg in Session antworten), Tool-Beschreibung (`read_pod`, `sparql_query`, `WebSearch`, `WebFetch`, `assert_triples`, `write_message`), Provenance-Regeln (jede Aussage muss als Assertion mit passender Quelle abgelegt werden bevor sie in der Reply referenziert wird), Reply-Stil (kurz, plain text).

`prompts/agent-loop.md` bleibt unverändert für den manuellen MCP-Modus erhalten.

## Datenfluss (End-to-End-Beispiel)

User schreibt in Session `s_abc`, Position 3 (`msg3.jsonld`, `speaker: user`, body: "Was ist Solid?"):

1. JSS schreibt `msg3.jsonld` → JSS publisht WS `pub http://localhost:3000/aleph/sessions/s_abc/`.
2. Daemon.subscriber empfängt → `routeEvent`:
   - listet `/aleph/sessions/s_abc/` → `[meta.ttl, context.jsonld, msg1.jsonld, msg2.jsonld, msg3.jsonld]`
   - max N = 3, lese `msg3.jsonld`, speaker == "user", `msg4.jsonld` existiert nicht
   - return `{ sessionId: "s_abc", msgN: 3 }`
3. `queue.enqueue("s_abc", () => runAgent(trigger, mcp))`.
4. Runner ruft `query()` mit gerendertem Prompt.
5. Agent-Loop:
   - **Turn 1 — Kontext lesen:** `read_pod` für meta.ttl + msg1/2/3.
   - **Turn 2 — Recherche:** `WebSearch`, `WebFetch`, `sparql_query`.
   - **Turn 3 — Write back:**
     - `assert_triples(kind=web, ...)` → PUT `/aleph/assertions/s_abc/web_{ts}.jsonld`
     - `assert_triples(kind=sparql, ...)` → PUT `/aleph/assertions/s_abc/sparql_{ts}.jsonld`
     - `write_message(sessionId, msgN=3, body)` → PUT `/aleph/sessions/s_abc/msg4.jsonld`
   - **Turn 4 — kein Tool-Call mehr** → SDK liefert Result → Runner return.
6. Queue resolved, `s_abc` frei für nächsten Trigger.

### Wichtige Eigenschaften

- **Provenance pro Datei** trennt LLM-Erfindung, Web-Quelle und SPARQL-Quelle. Query `?s prov:wasGeneratedBy/a ?type` filtert.
- **Live-Sub bleibt offen während Agent läuft.** Weitere Pubs queuen sich, kein Drop.
- **Self-Trigger-Schutz:** Agent schreibt msg4 → JSS publisht erneut → Router liest msg4, speaker == "agent" → skip. Kein Loop.
- **Pubs auf assertions/-Pfade gehen ins Leere:** Router filtert auf `sessions/`.

## Fehlerbehandlung

### Fallback-Reply

Runner trackt per Closure ob `write_message` erfolgreich war. Nach Query-Ende:

```typescript
if (!messageWritten) {
  await writeFallback(sessionId, msgN + 1,
    "Agent konnte keine Antwort generieren.");
}
```

`writeFallback` nutzt dasselbe Reply-Template + SHACL-Check wie das MCP-Tool.

### SHACL-Violation in MCP-Tool

Tool returnt `{ error: "shacl", report: [...] }`. Agent sieht Tool-Error im Loop und versucht es erneut. Pro (sessionId, kind) max 3 Versuche, danach persistent error.

### Pod-PUT-Fehler

- `412 Precondition Failed` (msg-Position taken): structured error → Agent rechnet N via `read_pod` neu und retried.
- `5xx` / network: MCP-Tool retried intern 3× mit Backoff (250ms, 500ms, 1s).

### Comunica-Fehler

`sparql_query` returnt `{ error: 'sparql', detail }`. Default-Timeout 15s.

### SDK-Fehler

- Auth missing: Daemon crasht früh mit Hinweis `claude login required`.
- Rate-Limit (429): SDK propagiert → Runner schreibt Fallback "rate-limited, try again later".
- Agent läuft >5 min: `AbortController` → Fallback.

### WS-Disconnect

Subscriber reconnected mit exp. Backoff. Nach Reconnect: erneuter Drain-Pass holt verpasste Events.

### Daemon-Crash

Kein persistenter State im Daemon. Beim Neustart drained Bootstrap alles Offene. Doppel-Replies durch idempotente PUT-Position vermieden (msg{N+1} existiert → Router skipped).

### Race: neue user-msg während Agent läuft

Queue serialisiert pro Session. Neue msg läuft erst wenn vorheriger Reply geschrieben ist. Router-Filter (`speaker == "user" && !msg{N+1}.exists`) findet die neue Position selbständig.

## Tests

### Unit-Tests (`tests/daemon/`)

- **Router:** valider Trigger, speaker=agent → null, reply existiert → null, falscher Pfad → null, leerer Container → null.
- **Queue:** Parallel-enqueue gleiche sessionId → seriell; verschiedene sessionIds → parallel; throw in work blockt nachfolgende nicht.
- **MCP `write_message`:** valides body → korrekter PUT-Pfad + Wrapper; SHACL-Violation; 412 → error: conflict; setzt `messageWritten`.
- **MCP `assert_triples`:** kind=web mit derivedFrom → Datei + Header; kind=sparql ohne query → SHACL-Violation; kind=imagined → minimal-Header.
- **SHACL-Engine:** lädt `vocab/aleph-shapes.ttl`, valider Graph conformant, fehlende Pflichten non-conformant, Snapshot der Violation-Struktur.
- **Fallback:** Mock-SDK ohne `write_message` → Daemon schreibt Stub; mit → kein Stub; Stub durchläuft SHACL.

### Integration-Tests (`tests/daemon/integration/`)

JSS wird in-process oder über process-compose-Profil `test` gestartet.

- **End-to-End Reply:** Setup leere Session, PUT user-msg, Daemon mit Mock-SDK (deterministischer Output), erwarten msg2.jsonld + Assertion-Datei.
- **Bootstrap-Drain:** 2 unbeantwortete Sessions, Daemon starten, beide bekommen Reply.
- **Self-Trigger-Loop:** Daemon antwortet → JSS publisht → Router skipped, Counter = 1 SDK-Aufruf pro user-msg.
- **Reconnect:** WS kappen, während Disconnect msg schreiben, Daemon reconnected, Drain holt msg.

### Mocks

- **MockSdk:** ersetzt `query()` durch async-Generator mit vordefinierten Tool-Calls.
- **MockPod:** Bun-HTTP + WS-Emitter, in-memory Map. Für Router/Queue-Tests ohne JSS.

### Out of Scope für Tests

Comunica selbst, Claude SDK intern, JSS Solid-Konformität, LLM-Antwortqualität.

## Verhältnis zum bisherigen `agent-loop.md`-Modell

Der Loop-Prompt schreibt zwei Outputs pro Turn:

- Reply als `/aleph/sessions/{sid}/msg{N+1}.jsonld`
- Extend-Delta als `/aleph/sessions/{sid}/extend{N+1}.jsonld`

Der Daemon ersetzt das durch:

- Reply als `/aleph/sessions/{sid}/msg{N+1}.jsonld` (unverändert).
- Statt einem Extend-Delta in der Session: **null oder mehrere Assertion-Files** in `/aleph/assertions/{sid}/{kind}_{ts}.jsonld`, einer pro Quelle/Activity.

Begründung: Extend-Deltas in der Session vermischen Reply-Kontext und neue Wissens-Aussagen. Getrennter Pfad macht Provenance auf File-Ebene möglich und entkoppelt Wissens-Akkumulation vom Chat-Verlauf.

## Out of Scope

- Per-Session Subscriptions (aktuell nur Container).
- Notifications auf `concepts/` und `assertions/`.
- Multi-Agent gleichzeitig pro Session.
- RDF-Star für Triple-Level-Provenance (File-Level reicht).
- Persistenter Queue-State (in-memory + Bootstrap-Drain reicht).
- Eigene Suchmaschine (built-in `WebSearch` reicht).
- **Frontend-Reader für `/aleph/assertions/`.** UI rendert heute aus `concepts/`; Assertion-Files sind ein neuer Pfad, der erst in einem Folge-Spec ans Frontend angeschlossen wird.
- **Migration alter `extend{N}.jsonld`-Files** aus Sessions in den neuen Assertion-Pfad.

## Offene Risiken

- **Agent-SDK-Credit ab 15.06.2026** kann limitierter sein als bisheriges interaktives Limit. Monitoring nötig.
- **SHACL-Engine-Wahl** (`rdf-validate-shacl`) vs. Alternativen — Performance bei jedem Write prüfen.
- **`prompts/agent-event.md`-Schreiben** muss Provenance-Regel sehr explizit machen, sonst macht der Agent freihand-Triples ohne Assertion.
