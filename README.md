# aleph.wiki

**An external memory system for connection-based learning through semantic knowledge graphs.**

---

## What is aleph.wiki?

Aleph.wiki transforms scattered learning into a web of connected knowledge. When you can't remember where you learned something, when you forget crucial connections between ideas, when knowledge lives in isolated notes that never resurface - aleph.wiki captures not just what you learned, but how concepts relate and how your understanding evolved over time.

**The core value:** Connection-triggered recall. Seeing graph connections brings back the full learning context - not just isolated facts, but the relationships, insights, and progression of understanding.

### How it works

Interactive learning sessions capture concepts as semantic triples, building a persistent knowledge graph that grows across sessions. Using standard ontologies (SKOS, FOAF, PROV) plus the project vocabulary at `vocab/aleph.ttl`, aleph.wiki creates rich, queryable representations with cross-linked concepts, multilingual labels, and temporal relationships.

The system is designed for minimal interruption during learning. You provide brief inputs, and the assistant emits structured RDF (Turtle / JSON-LD) into a Solid Pod, capturing both the concepts and the context of each learning interaction. Over time, patterns emerge - game theory appears in biology, economics, and politics; information theory connects thermodynamics, communication, and epistemology.

## Why aleph.wiki?

### Core Innovations

**1. Ontology-Aware Multi-Layer Visualization**

Unlike standard network graphs that force all data into one view, aleph.wiki renders your knowledge based on its semantic properties:
- **Temporal data** → Timeline view showing how events unfold
- **Conceptual relationships** → Network graph for exploring connections
- **Provenance data** → Knowledge archaeology - see how your understanding evolved

The visualization layer is determined by the ontology, not manual categorization. Switch between views to see the same knowledge from different angles.

**2. Provenance Replay - Knowledge Archaeology**

Every learning session becomes part of the graph's history. Watch your knowledge graph grow over time, see which sessions added what, identify which topics you explored deeply versus touched lightly. Provenance isn't just audit trail - it's a way to understand how you learned.

**3. Minimal-Interruption Learning Experience**

Brief inputs during learning sessions. The AI assistant structures knowledge as RDF triples in the background. You think, explore, and ask questions. The system handles semantic correctness, relationship mapping, and temporal tracking.

### What Makes It Different

**vs. Obsidian/Roam:** Graph views exist, but limited to single network visualization. No temporal replay, no ontology-aware rendering.

**vs. Notion/Evernote:** Document-centric, no graph visualization, connections are manual.

**vs. Mem.ai/Reflect:** AI features for summarization, but not knowledge structuring as semantic web data.

**The Gap:** Personal knowledge management + semantic web rigor + ontology-aware visualization + provenance as learning tool. This combination doesn't exist in the current market.

## Quick Example

**Scenario:** You're at a dinner party. Someone mentions Iran protests. You learned about this months ago - where? What was the connection you found interesting?

Pull up aleph.wiki. Search "Iran protests." The graph shows:

```turtle
<concept:mahsa-amini-protests> a skos:Concept , schema:Event ;
    skos:prefLabel "2022 Iranian Protests"@en , "اعتراضات ایران ۱۴۰۱"@fa ;
    skos:related <concept:women-life-freedom> , <concept:morality-police> ;
    skos:broader <concept:human-rights-movements> , <concept:womens-rights> ;
    schema:startDate "2022-09-16"^^xsd:date ;
    prov:wasGeneratedBy <session:2024-08-15-evening> .
```

**What you see:** Not just the event, but the web of connections. The protests link to broader human rights movements, women's rights history, state authority concepts. The provenance shows you learned this in an August evening session. Click the session - the timeline replays what else you explored that night. The full context comes back.

**The moment:** You confidently join the conversation, making connections you'd completely forgotten existed in your notes. Connection-triggered recall in action.

## Architecture

- **Storage:** Solid Pod (Community Solid Server / JSS) under `/aleph/`. Conneg returns `text/turtle` for every RDF extension.
- **Client:** Vue 3 + Vite single-page app (`src/`). In-browser SPARQL store via `oxigraph` (WASM). Graph rendering via `d3`.
- **Agent:** Claude Code skill driven by the prompt framework in `prompts/` (seed → extend → view → chat-log → validate). Writes JSON-LD deltas back into the Pod.
- **Vocabulary:** `vocab/aleph.ttl` (terms), `vocab/aleph-shapes.ttl` (SHACL), `vocab/aleph-context.jsonld` (JSON-LD context).

## Repository Structure

- **`src/`** - Vue 3 frontend: components, `lib/rdf.ts` (oxigraph store), `lib/pod.ts` (Solid client), `queries/`.
- **`vocab/`** - Project ontology, SHACL shapes, JSON-LD context.
- **`prompts/`** - Agent prompt framework (`01-seed`, `02-extend`, `03-view`, `04-chat-log`, `05-validate`, `agent-loop`).
- **`scripts/`** - One-off utilities, e.g. `seed-pod.ts` for bootstrapping a fresh Pod from `data/`.
- **`data/`** - Reference TTL bundles (e.g. `demo-game-theory.ttl`) used as golden output for the prompt loop.
- **`tests/`** - Vitest unit + integration tests.
- **`.claude/`** - Claude Code configuration for this repo.

## Requirements

- [Bun](https://bun.sh) for dev / install / scripts.
- A running Solid Pod (defaults to `http://localhost:3000`, override via `VITE_POD_BASE`). The bundled flow assumes [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer) ("JSS") with `--conneg` enabled. Single-user password is seeded as `aleph.wiki`.
- [Claude Code](https://claude.com/claude-code) - for the agent loop that produces graph deltas.

## Usage

**⚠️ Early Development Warning:** APIs, file formats, and on-disk layout may change without notice.

### Setup

```bash
bun install --frozen-lockfile     # reproducible install (bun.lock is source of truth)
bun run scripts/seed-pod.ts       # bootstrap Pod with vocab + demo data
bun run dev                       # Vite dev server
```

### Learning Flow

1. Start a Claude Code session with the `agent-loop` prompt (`prompts/agent-loop.md`).
2. Ask questions or provide topics you want to explore.
3. The agent emits one JSON-LD delta per turn into `/aleph/sessions/{SessionId}/extendN.jsonld` on the Pod.
4. The frontend re-reads the touched resource and re-renders the graph.
5. Future sessions build on previous concepts, creating cross-session links.

### Dependency pinning

`package.json` uses caret ranges; reproducibility is guaranteed by `bun.lock`. Always install with `--frozen-lockfile` in CI.

## Self-Hosting Status & Limitations

Anyone can open the hosted app (e.g. `https://aleph.wiki`) and point it at their **own** Solid Pod — local or remote. `localhost` is a [potentially-trustworthy origin](https://w3c.github.io/webappsec-secure-contexts/), so an HTTPS-hosted SPA may talk to `http://localhost:3000` without mixed-content errors and without local TLS. The remaining gaps:

1. **Runtime config in place; no WebID yet.** The Pod URL is set via a setup screen on first load and persisted to `localStorage` under `aleph.podBase` (override default via `VITE_POD_BASE` at build time). Click the pod chip in the chrome to edit or forget. WebID-OIDC login that discovers `pim:storage` from the user's profile is still to do.
2. **CORS must allow the app origin.** A user's Pod must respond with `Access-Control-Allow-Origin` matching the app origin (or `*` for public reads). JSS does not document its default CORS policy — verify empirically before assuming it works out of the box.
3. **No-auth path requires permissive ACL.** The app issues unauthenticated `fetch` calls. Pointing it at a private pod will fail until either (a) the pod runs in single-user / open-WAC mode (e.g. `acl:agentClass foaf:Agent` on the relevant containers), or (b) a Solid-OIDC login flow is added.
4. **WebSocket notifications.** `pod.ts` opens `ws://<pod>/.notifications` for `http://` pods and `wss://` for HTTPS pods. Browsers treat `ws://localhost` as secure-context, so local pods work from any origin.
5. **Sync to a public Pod is out of scope of the app itself.** JSS supports a Git HTTP backend (`git clone`/`push` on pod containers) and [`remoteStorage`](https://datatracker.ietf.org/doc/html/draft-dejong-remotestorage-22). Neither is wired into the app; offline-first round-trips between a local Pod and a public one require manual `git push` or an external sync job.
6. **JSS vs. CSS.** The "Architecture" section above references both Community Solid Server and JSS interchangeably; they are separate projects. The bundled flow targets JSS (`jss.live`) — CSS may work but is not tested.

## License

AGPL-3.0 - see [LICENSE](./LICENSE) for details.
