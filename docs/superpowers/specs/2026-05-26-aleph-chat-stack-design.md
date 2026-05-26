# Aleph Chat Stack — Design

**Status:** draft
**Date:** 2026-05-26
**Author:** Toph (with Claude)

## Goal

LLM-Chat-Interaktion in Aleph Wiki. Lokaler Solid-pod hält den graph; Claude Code beobachtet und antwortet. Stack ist via `nix run .#dev` reproduzierbar bootbar, daten landen unter `$XDG_DATA_HOME/aleph-wiki`.

## Non-goals (v1)

- Concept-Editing via UI (chat-only)
- Accept/Reject-Workflow für proposed triples
- Multi-user, Auth-Flows, WebID-Login
- Anthropic-API-Nutzung (zero API-cost — nur Claude Code subscription)
- Mobile / multi-device sync
- Snapshot-rotation, edit-log compaction

## Decisions (locked in brainstorming)

1. **Auth:** Single-user, public ACL. Pod-root offen für localhost.
2. **CC trigger:** MCP long-poll (blocking). CC ruft `subscribe`, schläft bis JSS event feuert.
3. **Pod data:** Alles im pod. Demo-TTL beim Erst-Start in pod-resources migriert. Build-time-import in `rdf.ts` ersetzt.
4. **Nix apps:** zwei separate. `nix run .#dev` = vite + jss via process-compose. `nix run .#chat` = `claude` launcher mit MCP-config.
5. **UI scope v1:** nur chat (neue Sitzung, msg-input, live-update via WS).
6. **MCP-bridge:** keine. JSS v0.0.200+ hat eingebauten MCP-server (`jss start --mcp`).
7. **Provenance:** named-graphs pro pod-resource. PROV-O + `aleph:Edit` annotations self-described im graph.
8. **Canonicalization:** per-session, materialisiert nach `/canonical/Session_NNN.ttl`. Re-canonicalize überschreibt. Edit-history bleibt.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  nix run .#dev   (process-compose, foreground)              │
│                                                             │
│  ┌─────────┐         ┌──────────────────────┐               │
│  │  vite   │         │  jss --mcp           │               │
│  │  :5173  │ ──HTTP─►│  :3000               │               │
│  │  (Vue)  │ ◄──WS── │  data: $XDG_DATA_    │               │
│  │         │         │  HOME/aleph-wiki/pod │               │
│  └─────────┘         └──────────┬───────────┘               │
└─────────────────────────────────┼───────────────────────────┘
                                  │ HTTP+SSE on /mcp
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│  nix run .#chat   (separates Terminal)                      │
│                                                             │
│  claude (CC interaktiv)                                     │
│    └─ .mcp.json → http://localhost:3000/mcp                 │
│    └─ initial prompt: prompts/agent-loop.md                 │
│         "loop: subscribe → read → respond → write"          │
└─────────────────────────────────────────────────────────────┘
```

UI und CC sind beide pure JSS-clients. Kein shared state außer pod. Bridge entfällt — JSS v0.0.200+ ist self-contained MCP-server.

## Components

### JSS instance
- Binary: `javascript-solid-server` (npm-pkg, in nix via nodePackages oder pnpm overlay).
- Flags: `--mcp --port 3000 --data $XDG_DATA_HOME/aleph-wiki/pod --single-user`.
- Erst-Start bootstrap-script (`scripts/seed-pod.ts`, bun): liest `data/demo-game-theory.ttl`, splittet:
  - jede `?s a aleph:Concept` (+ deren outgoing triples) → eigene resource `/aleph/concepts/{localName(?s)}.ttl`
  - jede `?s a aleph:Session` (+ msgs via prov:wasGeneratedBy) → `/aleph/sessions/{id}/` container, `.meta.ttl` + ein file pro message
  - übrig bleibende meta-triples (vocab, layout-defaults) → `/aleph/index.ttl`
  - jede emittete resource bekommt graph-meta-block (`<> a aleph:Edit ; prov:wasGeneratedBy :BootstrapSeed ; ...`)
  - Idempotent: skip wenn `/aleph/index.ttl` existiert.
- WS notifications native (`solid-0.1`), exposed sowohl direkt als auch via MCP `subscribe` tool.

### Pod layout
```
$XDG_DATA_HOME/aleph-wiki/pod/aleph/
  /concepts/{ConceptName}.ttl       ← canonical view (regenerated)
  /sessions/Session_NNN/
    .meta.ttl                       ← session metadata + canonical pointer
    msg1.ttl ... msgN.ttl           ← append-only chat history
    edits/{ULID}.ttl                ← non-chat edits in dieser session (v2)
  /canonical/
    Session_NNN.ttl                 ← materialized state nach (re-)canonicalize
```

Jede `.ttl`-resource = ein **named graph** (graph-URI = resource-URL). Triple-level provenance via graph-meta-triples im selben file.

### Vue UI changes
- `src/lib/rdf.ts`: ersetzt `import demoTtl` mit runtime-fetch. `initStore()` lädt pod-recursive in oxigraph als quad-store. Re-load bei WS-event.
- Neu: `src/lib/pod.ts` — HTTP-client für JSS (fetch resources, PUT, WS-subscribe + reconnect).
- `src/components/AlephConsole.vue`: input-field wird live. Bei Submit: PUT `/aleph/sessions/{active}/msg{N+1}.ttl` mit TTL aus `prompts/04-chat-log.md` template.
- Neuer button "Neue Sitzung" im chrome (`AlephChrome.vue`) → PUT `/aleph/sessions/Session_NNN/.meta.ttl`, setzt active session.
- Banner-component für pod-offline / WS-reconnect-status.

### CC client setup
- `.mcp.json` im project-root:
  ```json
  {
    "mcpServers": {
      "aleph-pod": {
        "type": "http",
        "url": "http://localhost:3000/mcp"
      }
    }
  }
  ```
- `prompts/agent-loop.md`: system-style initial-prompt. Beschreibt loop ("`subscribe` aufrufen, bei `resource_changed` lesen, antworten gemäß prompts/02+04, `write_resource`").
- `.#chat` launcher: setzt PWD aufs project, hängt prompt-file an `claude` an, exec interaktiv.

### Nix flake structure
- `apps.dev`: process-compose mit `jss --mcp ...` + `vite` parallel. Logs gestreamt, Ctrl-C cleant beide.
- `apps.chat`: launcher-script, env-prep, `exec claude`.
- `apps.default = self.apps.${system}.dev`.
- `devShells.default`: bun, nodejs, javascript-solid-server, claude-code, process-compose in PATH.
- `packages.aleph-wiki-static`: Vite-build artifact (optional, für deployment später).

## Data Flows

### A — Neue Sitzung
```
User clicks "Neue Sitzung"
  → UI: NNN = nextFreeSession()
  → PUT /aleph/sessions/Session_NNN/.meta.ttl
     (aleph:Session, prov:startedAtTime, prov:wasAttributedTo)
  → JSS WS notify → UI fetches new resource → store updated
  → JSS WS notify → CC's subscribe SSE: event ignored (kein msg yet)
  → UI setzt activeSessionId
```

### B — User msg → agent reply
```
User schreibt, Enter
  → UI: N = current msg count + 1
  → PUT /aleph/sessions/Session_NNN/msg{N}.ttl
     (aleph:ChatMessage speaker="user" body=... position=N
      prov:wasGeneratedBy :Session_NNN prov:generatedAtTime ...)
     Header: If-None-Match: *  (race-protection)
  → JSS notify ─► UI WS handler patches oxigraph
  → JSS notify ─► CC SSE event arrives
     CC: speaker=user, msg{N+1} fehlt → respond
     CC: read_resource auf /aleph/sessions/Session_NNN/, /aleph/concepts/...
     CC: composes reply gemäß prompts/04-chat-log.md schema
     CC: write_resource PUT /aleph/sessions/Session_NNN/msg{N+1}.ttl
         (speaker="agent")
  → JSS notify → UI re-fetch → agent-msg gerendert
```

### C — Canonicalize (v2, designed v1)
```
User clicks "Canonicalize this session"
  → UI: liest alle msgs + edits in session
  → resolved amend/retract-ketten lokal in oxigraph
  → emittet flat TTL
  → PUT /aleph/canonical/Session_NNN.ttl  (überschreibt)
  → PATCH /aleph/sessions/Session_NNN/.meta.ttl
     (set aleph:lastCanonicalizedAt, aleph:canonicalView)
  → JSS notify → UI re-fetch
```

Edits bleiben unangetastet → timeline-rebuild jederzeit möglich.

### Cold start
- UI: `initStore()` fetched `/aleph/` recursive → oxigraph populated als quad-store → SPARQL queries laufen wie heute (mit `GRAPH ?g` falls provenance abgefragt wird).
- CC: subscribe an `/aleph/sessions/` → SSE open → idle bis event. Bei restart sieht CC alle pending user-msgs ohne reply, beantwortet sie nacheinander.

## Vocab additions (`vocab/aleph-vocab.ttl`)

```turtle
aleph:Edit a owl:Class ;
    rdfs:subClassOf prov:Activity ;
    rdfs:label "Edit" .

aleph:editKind a owl:DatatypeProperty ;
    rdfs:domain aleph:Edit ;
    rdfs:range xsd:string ;
    rdfs:comment "create | amend | retract" .

aleph:supersedes a owl:ObjectProperty ;
    rdfs:domain aleph:Edit ;
    rdfs:range aleph:Edit .

aleph:Snapshot a owl:Class ;
    rdfs:subClassOf prov:Entity ;
    rdfs:label "Canonical session snapshot" .

aleph:includesEdits a owl:ObjectProperty ;
    rdfs:domain aleph:Snapshot ;
    rdfs:range rdf:List .

aleph:lastCanonicalizedAt a owl:DatatypeProperty ;
    rdfs:domain aleph:Session ;
    rdfs:range xsd:dateTime .

aleph:canonicalView a owl:ObjectProperty ;
    rdfs:domain aleph:Session ;
    rdfs:range aleph:Snapshot .
```

SHACL-shapes (`vocab/aleph-shapes.ttl`) entsprechend ergänzen für `aleph:Edit` und `aleph:Session`.

## Provenance via Named Graphs

Jede pod-resource = ein graph. Self-describing meta-triples im selben file:

```turtle
@prefix : <https://aleph.wiki/g/> .
@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<> a aleph:Edit ;
   prov:wasGeneratedBy :Session_042 ;
   prov:generatedAtTime "2026-05-26T14:23:01Z"^^xsd:dateTime ;
   prov:wasAttributedTo :Toph ;
   aleph:editKind "create" .

:Session_042_msg3 a aleph:ChatMessage ;
   aleph:position 3 ;
   aleph:speaker "user" ;
   aleph:body "explain Nash equilibrium across fields" ;
   prov:wasGeneratedBy :Session_042 ;
   prov:generatedAtTime "2026-05-26T14:23:01Z"^^xsd:dateTime .
```

SPARQL "wer hat triple X geschrieben":
```sparql
SELECT ?session ?at ?actor WHERE {
  GRAPH ?g { :ConceptName aleph:exemplifies :Strategy . }
  ?g prov:wasGeneratedBy ?session ;
     prov:generatedAtTime ?at ;
     prov:wasAttributedTo ?actor .
}
```

## Error Handling

| Situation | Behavior |
|---|---|
| JSS down at boot | UI banner "Pod offline — start `nix run .#dev`". No fallback to demo-import. |
| WS disconnect | Exponential backoff reconnect (1s, 2s, 4s, max 30s). Banner shows status. |
| CC SSE disconnect | MCP tool returns error → prompt instructs CC "wait 5s, re-subscribe". |
| PUT conflict (412) | Refetch session, recount N, retry mit höherem N. Max 3 retries, dann user-error. |
| Malformed TTL from CC | JSS returns 400. CC retries up to 2x with corrected output, dann fallback agent-msg "agent error: konnte nicht antworten". |
| Oxigraph parse fail | Skip bad resource, warn in status. Other triples bleiben gültig. SHACL-status reflects. |
| 403 WAC denied | Log + banner "ACL-konflikt — pod nicht in single-user?". Defensive. |
| CC process crash | Stack runs on, UI works ohne agent. Banner "agent offline" wenn keine reply nach 30s + speaker=user. Recovery: re-run `.#chat`, CC sees pending msgs. |

**Idempotenz:** Append-only nummerierte resources → CC restart safe. Doppel-replies vermieden durch existence-check vor write.

## Testing

### Unit / integration
- `pod.ts` HTTP-client: mock JSS, test PUT/GET/WS event handling
- TTL-template renderers (msg, session.meta, edit): snapshot tests gegen prompts/schema
- Canonicalize builder: feed synthetic edit stream, assert deterministisches output
- N+1 race retry: simulate 412, assert recovery

### E2E (gegen echte JSS-instanz)
- Bootstrap: empty pod → seed → expected resources exist, demo concepts queryable
- Chat-loop smoke: script putted user-msg, mock CC putted reply, assert UI-store contains both
- Subscribe-test: open SSE, PUT resource via second client, assert event delivered <500ms

### Manual smoke (release gate)
- `nix run .#dev` boots clean ohne pod-dir → seeds → UI serviert
- "Neue Sitzung" → pod has new session resource
- Chat-input PUT → erscheint in console
- `nix run .#chat` startet → CC sieht event → reply erscheint in UI
- Pod-dir löschen → re-boot → fresh seeded state

### Out of scope v1
- Canonicalize-flow E2E (v2)
- Concept-edit via UI (v2)
- Multi-session aggregat view
- CC-prompt-engineering iteration (live tuning, nicht test-suite)

## Open questions / risks

- **JSS version pinning:** `javascript-solid-server` v0.0.200+ required. Falls in nixpkgs nicht aktuell genug: own package-derivation oder npm-via-bun.
- **MCP HTTP-transport in CC:** muss verifiziert werden dass `.mcp.json` mit `type: "http"` und remote URL clean funktioniert (vs stdio default).
- **Oxigraph quad-load:** aktueller `rdf.ts` loaded plain TTL. Multi-resource loads als verschiedene graphs benötigt entweder per-resource `Store.load(...)` mit graph-name oder Trig. Implementation-detail, kein blocker.
- **CC-prompt-Verlässlichkeit:** dass CC stur den loop durchzieht ohne offtopic-drift. Mitigation: prompt mit hartem template, plus error-mode-fallback.

## Migration from current state

- `data/demo-game-theory.ttl` bleibt als seed-source im repo.
- `rdf.ts` build-time-import wird durch runtime-pod-fetch ersetzt — der demo-TTL erreicht uns über pod statt direkt.
- Bestehende SPARQL-queries laufen unverändert (default graph reicht für view-queries, nur provenance-queries brauchen explizite `GRAPH`).
- `data/` ggf. um `seed/` ergänzt mit normalized per-concept files für bootstrap.

## Implementation order (für plan-phase)

1. Vocab + SHACL erweitern (`aleph:Edit`, `aleph:Snapshot`, etc.)
2. `pod.ts` HTTP-client + WS-subscribe + reconnect
3. `rdf.ts` umbau auf runtime-pod-fetch + quad-store
4. Bootstrap-script (demo-ttl → pod-resources)
5. UI: "Neue Sitzung" button + chat-input PUT-handler
6. `.mcp.json` + `prompts/agent-loop.md`
7. Nix flake: apps.dev (process-compose), apps.chat (launcher), devShell
8. Manual smoke-test end-to-end
9. (v2 later) Canonicalize button + builder
