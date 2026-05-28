# Agent-Daemon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single Bun process that subscribes to JSS container notifications on `/aleph/sessions/`, routes each new unanswered user message to a short-lived Claude Agent SDK query, and writes validated replies + provenance-tagged assertions back to the pod through in-process, SHACL-checked MCP tools.

**Architecture:** One Bun heap holds the WebSocket subscriber, an in-process MCP server (`createSdkMcpServer`), and the per-event agent runner. Events flow Subscriber → Router (filter to genuinely-new user msgs) → per-session serial Queue → Runner (`query()` from `@anthropic-ai/claude-agent-sdk`). The agent's only write path is the MCP tools, each of which validates a JSON-LD document against `vocab/aleph-shapes.ttl` before `PUT`-ing to JSS. Read/search is built-in `WebSearch`/`WebFetch` plus a Comunica-backed `sparql_query`.

**Tech Stack:** Bun 1.3.x, TypeScript, `@anthropic-ai/claude-agent-sdk@^0.3` (spawns the locally logged-in `claude` binary → runs on the Claude Max subscription, **no `ANTHROPIC_API_KEY` needed** — verified empirically 2026-05-28, `apiKeySource=none`), `zod` (tool input schemas), `ws` (already present), `@comunica/query-sparql` (federated SPARQL), `rdf-validate-shacl` + `rdf-ext` + `jsonld` + `n3` (SHACL validation of JSON-LD writes), `vitest` (already the test runner).

**Auth note for executors:** The daemon authenticates by spawning the user's logged-in `claude` CLI (must be on `PATH`; verified `claude 2.1.154`). No API key. The only standing risk is the post-2026-06-15 Agent-SDK credit pool — out of scope here, monitor in production.

---

## File Structure

**New source files (all under `src/daemon/`):**

- `types.ts` — shared types: `Config`, `Trigger`, `DaemonDeps`, `RunContext`.
- `config.ts` — `loadConfig()` reads env (`POD_BASE`, `COMUNICA_SOURCES`, `PROMPT_PATH`, `AGENT_MODEL`).
- `shacl.ts` — `ShaclValidator`: loads `vocab/aleph-shapes.ttl` once; `validateJsonLd(doc)` → `{ conforms, results }`. Owns the JSON-LD→RDF conversion.
- `templates.ts` — pure builders: `buildReplyDoc()`, `buildAssertionDoc()`, `INLINE_CONTEXT`. Return plain JS objects (JSON-LD).
- `router.ts` — `routeEvent(url, pod)` → `Trigger | null`.
- `queue.ts` — `SessionQueue` (per-session FIFO via chained promises).
- `subscriber.ts` — `subscribeContainer(podBase, path, onPub)` using `ws`.
- `mcp/sparql.ts` — `SparqlEngine` wrapping Comunica `QueryEngine`.
- `mcp/server.ts` — `createAlephServer(deps, ctx)` → `{ server, ctx }` with the four tools.
- `runner.ts` — `runAgent(trigger, deps)`: renders prompt, builds per-run MCP server, drives `query()`, fallback + timeout.
- `main.ts` — `loadConfig` → build deps → `drainUnanswered` → `subscribeContainer`.

**Reused as-is:** `src/lib/pod.ts` (`PodClient` — `getResource`, `putResource`, `listContainer`). The daemon does NOT reuse `PodClient.subscribe` (that uses browser `WebSocket`); `subscriber.ts` is the Node/`ws` equivalent.

**New non-source files:**

- `prompts/agent-event.md` — one-shot per-event prompt.
- `config/agent-daemon.example.env` — documented env template.

**Modified files:**

- `vocab/aleph-shapes.ttl` — add `WebSearchAssertionShape`, `SparqlAssertionShape`, `ImaginedAssertionShape`.
- `vocab/aleph.ttl` — add the three assertion classes + `searchQuery`/`query`/`endpoints` predicates.
- `vocab/aleph-context.jsonld` — add assertion terms.
- `package.json` — new deps + `"daemon"` script.
- `process-compose.yaml` — `agent-daemon` service.

**Test files (all under `tests/daemon/`):** one per module, each starting with `// @vitest-environment node` (the repo default is happy-dom; daemon code is server-side). Integration tests under `tests/daemon/integration/`.

---

## Task 1: Dependencies, config, and shared types

**Files:**
- Modify: `package.json`
- Create: `src/daemon/types.ts`
- Create: `src/daemon/config.ts`
- Test: `tests/daemon/config.test.ts`

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
bun add @anthropic-ai/claude-agent-sdk zod @comunica/query-sparql rdf-validate-shacl rdf-ext jsonld
bun add -d @types/jsonld
```
Expected: `package.json` `dependencies` now lists all five runtime packages; `bun.lock` updated. (`ws`, `n3`, `oxigraph` are already present.)

- [ ] **Step 2: Add the `daemon` script to `package.json`**

In the `"scripts"` block add:
```json
    "daemon": "bun run src/daemon/main.ts",
```

- [ ] **Step 3: Write `src/daemon/types.ts`**

```typescript
import type { PodClient } from '../lib/pod';
import type { ShaclValidator } from './shacl';
import type { SparqlEngine } from './mcp/sparql';

/** Resolved daemon configuration. */
export interface Config {
  podBase: string;
  comunicaSources: string[];
  promptPath: string;
  model?: string;
}

/** A genuinely-new, unanswered user message that needs a reply. */
export interface Trigger {
  sessionId: string;
  msgN: number;
}

/** Long-lived dependencies, built once at startup, shared across runs. */
export interface DaemonDeps {
  config: Config;
  pod: PodClient;
  validator: ShaclValidator;
  sparql: SparqlEngine;
  /** Renders the event prompt with {{sessionId}}/{{msgN}} substituted. */
  renderPrompt: (trigger: Trigger) => string;
}

/** Per-run mutable state threaded into the MCP tools. */
export interface RunContext {
  sessionId: string;
  msgN: number;
  /** Set true once write_message PUTs a reply successfully. */
  messageWritten: boolean;
  /** Per-(sessionId,kind) failed-validation counters for retry cap. */
  shaclFailures: Map<string, number>;
}
```

- [ ] **Step 4: Write the failing test `tests/daemon/config.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from '../../src/daemon/config';

const SAVED = { ...process.env };
afterEach(() => { process.env = { ...SAVED }; });

describe('loadConfig', () => {
  it('reads POD_BASE and splits COMUNICA_SOURCES on commas', () => {
    process.env.POD_BASE = 'http://localhost:3000';
    process.env.COMUNICA_SOURCES = 'https://a.example/sparql, https://b.example/sparql';
    delete process.env.AGENT_MODEL;
    const c = loadConfig();
    expect(c.podBase).toBe('http://localhost:3000');
    expect(c.comunicaSources).toEqual(['https://a.example/sparql', 'https://b.example/sparql']);
    expect(c.promptPath).toBe('prompts/agent-event.md');
    expect(c.model).toBeUndefined();
  });

  it('defaults podBase and empty sources when unset', () => {
    delete process.env.POD_BASE;
    delete process.env.COMUNICA_SOURCES;
    const c = loadConfig();
    expect(c.podBase).toBe('http://localhost:3000');
    expect(c.comunicaSources).toEqual([]);
  });

  it('passes AGENT_MODEL through', () => {
    process.env.AGENT_MODEL = 'claude-opus-4-8';
    const c = loadConfig();
    expect(c.model).toBe('claude-opus-4-8');
  });
});
```

- [ ] **Step 5: Run the test, verify it fails**

Run: `bun run vitest run tests/daemon/config.test.ts`
Expected: FAIL — `Cannot find module '../../src/daemon/config'`.

- [ ] **Step 6: Write `src/daemon/config.ts`**

```typescript
import type { Config } from './types';

export function loadConfig(): Config {
  const sources = (process.env.COMUNICA_SOURCES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    podBase: process.env.POD_BASE ?? 'http://localhost:3000',
    comunicaSources: sources,
    promptPath: process.env.PROMPT_PATH ?? 'prompts/agent-event.md',
    model: process.env.AGENT_MODEL || undefined,
  };
}
```

- [ ] **Step 7: Run the test, verify it passes**

Run: `bun run vitest run tests/daemon/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json bun.lock src/daemon/types.ts src/daemon/config.ts tests/daemon/config.test.ts
git commit -m "feat(daemon): scaffold deps, config loader, shared types"
```

---

## Task 2: Vocabulary — assertion classes, predicates, SHACL shapes, context

**Files:**
- Modify: `vocab/aleph.ttl`
- Modify: `vocab/aleph-shapes.ttl`
- Modify: `vocab/aleph-context.jsonld`

- [ ] **Step 1: Add assertion classes + predicates to `vocab/aleph.ttl`**

Insert after the `aleph:exemplifies` predicate block (after line ~57, before the layout hints comment):
```turtle
#################################################################
# Assertion provenance (agent-daemon write path)
#################################################################

aleph:WebSearchAssertion a owl:Class ; rdfs:subClassOf prov:Activity ;
    rdfs:label "Web Search Assertion"@en ;
    rdfs:comment "Activity that produced triples grounded in a fetched web source."@en .

aleph:SparqlAssertion a owl:Class ; rdfs:subClassOf prov:Activity ;
    rdfs:label "SPARQL Assertion"@en ;
    rdfs:comment "Activity that produced triples from a federated SPARQL query."@en .

aleph:ImaginedAssertion a owl:Class ; rdfs:subClassOf prov:Activity ;
    rdfs:label "Imagined Assertion"@en ;
    rdfs:comment "Activity that produced triples from the model's own knowledge, no external source."@en .

aleph:searchQuery a owl:DatatypeProperty ; rdfs:range xsd:string ;
    rdfs:comment "The search string used by a WebSearchAssertion."@en .

aleph:query a owl:DatatypeProperty ; rdfs:range xsd:string ;
    rdfs:comment "The SPARQL query text used by a SparqlAssertion."@en .

aleph:endpoints a owl:DatatypeProperty ; rdfs:range xsd:string ;
    rdfs:comment "A SPARQL endpoint URL queried by a SparqlAssertion (repeatable)."@en .
```

- [ ] **Step 2: Add the three assertion shapes to `vocab/aleph-shapes.ttl`**

Append at end of file:
```turtle
#################################################################
# WebSearchAssertionShape — must cite a source URL
#################################################################
aleph:WebSearchAssertionShape a sh:NodeShape ;
    sh:targetClass aleph:WebSearchAssertion ;
    rdfs:label "Web Search Assertion Shape"@en ;

    sh:property [
        sh:path prov:wasGeneratedBy ;
        sh:minCount 1 ;
        sh:severity sh:Violation ] ;

    sh:property [
        sh:path aleph:derivedFrom ;
        sh:minCount 1 ;
        sh:nodeKind sh:IRI ;
        sh:message "WebSearchAssertion requires aleph:derivedFrom (a source URI)" ;
        sh:severity sh:Violation ] .

#################################################################
# SparqlAssertionShape — must record query + endpoint(s)
#################################################################
aleph:SparqlAssertionShape a sh:NodeShape ;
    sh:targetClass aleph:SparqlAssertion ;
    rdfs:label "SPARQL Assertion Shape"@en ;

    sh:property [
        sh:path prov:wasGeneratedBy ;
        sh:minCount 1 ;
        sh:severity sh:Violation ] ;

    sh:property [
        sh:path aleph:query ;
        sh:minCount 1 ;
        sh:datatype xsd:string ;
        sh:message "SparqlAssertion requires aleph:query" ;
        sh:severity sh:Violation ] ;

    sh:property [
        sh:path aleph:endpoints ;
        sh:minCount 1 ;
        sh:message "SparqlAssertion requires at least one aleph:endpoints" ;
        sh:severity sh:Violation ] .

#################################################################
# ImaginedAssertionShape — only provenance required
#################################################################
aleph:ImaginedAssertionShape a sh:NodeShape ;
    sh:targetClass aleph:ImaginedAssertion ;
    rdfs:label "Imagined Assertion Shape"@en ;

    sh:property [
        sh:path prov:wasGeneratedBy ;
        sh:minCount 1 ;
        sh:message "ImaginedAssertion requires prov:wasGeneratedBy" ;
        sh:severity sh:Violation ] .
```

- [ ] **Step 3: Add assertion terms to `vocab/aleph-context.jsonld`**

Inside the top-level `"@context"` object, after the `"Edit"`/`"AlephSession"` type entries, add the class aliases:
```json
    "WebSearchAssertion": "aleph:WebSearchAssertion",
    "SparqlAssertion":    "aleph:SparqlAssertion",
    "ImaginedAssertion":  "aleph:ImaginedAssertion",
```
And after the existing predicate entries (near `"derivedFrom"`), add:
```json
    "searchQuery": { "@id": "aleph:searchQuery" },
    "query":       { "@id": "aleph:query" },
    "endpoints":   { "@id": "aleph:endpoints" },
```

- [ ] **Step 4: Sanity-parse the Turtle files**

Run:
```bash
bun run -e "import {Parser} from 'n3'; import {readFileSync} from 'node:fs'; for (const f of ['vocab/aleph.ttl','vocab/aleph-shapes.ttl']) { new Parser().parse(readFileSync(f,'utf8')); console.log('parsed', f); }"
```
Expected: `parsed vocab/aleph.ttl` and `parsed vocab/aleph-shapes.ttl`, no throw. Also confirm context parses: `bun run -e "JSON.parse(require('node:fs').readFileSync('vocab/aleph-context.jsonld','utf8')); console.log('context ok')"`.

- [ ] **Step 5: Commit**

```bash
git add vocab/aleph.ttl vocab/aleph-shapes.ttl vocab/aleph-context.jsonld
git commit -m "feat(vocab): add assertion classes, predicates, and SHACL shapes"
```

---

## Task 3: SHACL validator over JSON-LD

**Files:**
- Create: `src/daemon/shacl.ts`
- Test: `tests/daemon/shacl.test.ts`

The validator loads `vocab/aleph-shapes.ttl` once into an `rdf-ext` dataset. For each write it converts the JSON-LD document to N-Quads via `jsonld.toRDF`, loads those quads into a dataset, and runs `rdf-validate-shacl`. JSON-LD with the *inlined* context (Task 4 supplies it) avoids a network fetch of `./context.jsonld`.

- [ ] **Step 1: Write the failing test `tests/daemon/shacl.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { ShaclValidator } from '../../src/daemon/shacl';
import { INLINE_CONTEXT } from '../../src/daemon/templates';

let v: ShaclValidator;
beforeAll(async () => { v = await ShaclValidator.load('vocab/aleph-shapes.ttl'); });

function webDoc(extra: Record<string, unknown> = {}) {
  return {
    '@context': INLINE_CONTEXT,
    '@graph': [{
      '@id': 'https://aleph.wiki/g/Session_1_turn3',
      '@type': 'WebSearchAssertion',
      'wasGeneratedBy': 'https://aleph.wiki/g/Session_1',
      'generatedAtTime': { '@value': '2026-05-28T10:00:00Z', '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' },
      'derivedFrom': 'https://example.org/solid',
      ...extra,
    }],
  };
}

describe('ShaclValidator', () => {
  it('passes a WebSearchAssertion with derivedFrom', async () => {
    const r = await v.validateJsonLd(webDoc());
    expect(r.conforms).toBe(true);
  });

  it('fails a WebSearchAssertion missing derivedFrom', async () => {
    const doc = webDoc();
    delete (doc['@graph'][0] as Record<string, unknown>).derivedFrom;
    const r = await v.validateJsonLd(doc);
    expect(r.conforms).toBe(false);
    expect(r.results.join(' ')).toMatch(/derivedFrom/);
  });

  it('fails a SparqlAssertion missing query', async () => {
    const doc = {
      '@context': INLINE_CONTEXT,
      '@graph': [{
        '@id': 'https://aleph.wiki/g/Session_1_turn3',
        '@type': 'SparqlAssertion',
        'wasGeneratedBy': 'https://aleph.wiki/g/Session_1',
        'endpoints': 'https://dbpedia.org/sparql',
      }],
    };
    const r = await v.validateJsonLd(doc);
    expect(r.conforms).toBe(false);
    expect(r.results.join(' ')).toMatch(/query/);
  });

  it('passes a minimal ImaginedAssertion', async () => {
    const r = await v.validateJsonLd({
      '@context': INLINE_CONTEXT,
      '@graph': [{
        '@id': 'https://aleph.wiki/g/Session_1_turn3',
        '@type': 'ImaginedAssertion',
        'wasGeneratedBy': 'https://aleph.wiki/g/Session_1',
      }],
    });
    expect(r.conforms).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run vitest run tests/daemon/shacl.test.ts`
Expected: FAIL — cannot find module `../../src/daemon/shacl` (and `templates`; Task 4 creates `INLINE_CONTEXT`, but write `templates.ts` minimally now if blocked — see note). 

> Note: this test imports `INLINE_CONTEXT` from `templates.ts`. Create `templates.ts` with just `INLINE_CONTEXT` first (full builders come in Task 4), so this task is runnable standalone.

- [ ] **Step 3: Create `src/daemon/templates.ts` with the inline context**

```typescript
// Inlined JSON-LD context — same terms as vocab/aleph-context.jsonld, embedded
// so SHACL validation never has to dereference the relative ./context.jsonld.
export const INLINE_CONTEXT: Record<string, unknown> = {
  aleph: 'https://vocab.aleph.wiki/',
  prov: 'http://www.w3.org/ns/prov#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  g: 'https://aleph.wiki/g/',
  ChatMessage: 'aleph:ChatMessage',
  Concept: 'aleph:Concept',
  Edit: 'aleph:Edit',
  WebSearchAssertion: 'aleph:WebSearchAssertion',
  SparqlAssertion: 'aleph:SparqlAssertion',
  ImaginedAssertion: 'aleph:ImaginedAssertion',
  position: { '@id': 'aleph:position', '@type': 'xsd:integer' },
  speaker: { '@id': 'aleph:speaker' },
  body: { '@id': 'aleph:body' },
  editKind: { '@id': 'aleph:editKind' },
  derivedFrom: { '@id': 'aleph:derivedFrom', '@type': '@id' },
  searchQuery: { '@id': 'aleph:searchQuery' },
  query: { '@id': 'aleph:query' },
  endpoints: { '@id': 'aleph:endpoints' },
  prefLabel: { '@id': 'skos:prefLabel', '@container': '@language' },
  broader: { '@id': 'skos:broader', '@type': '@id' },
  related: { '@id': 'skos:related', '@type': '@id' },
  wasGeneratedBy: { '@id': 'prov:wasGeneratedBy', '@type': '@id' },
  generatedAtTime: { '@id': 'prov:generatedAtTime', '@type': 'xsd:dateTime' },
};
```

- [ ] **Step 4: Write `src/daemon/shacl.ts`**

```typescript
import rdf from 'rdf-ext';
import { Parser } from 'n3';
import jsonld from 'jsonld';
import SHACLValidator from 'rdf-validate-shacl';
import { readFileSync } from 'node:fs';

export interface ShaclResult {
  conforms: boolean;
  /** Human-readable violation messages (empty when conforms). */
  results: string[];
}

/** Parse a Turtle/N-Quads string into an rdf-ext dataset. */
function datasetFromQuads(text: string, format: 'turtle' | 'n-quads') {
  const parser = new Parser({ format: format === 'turtle' ? 'text/turtle' : 'application/n-quads' });
  const ds = rdf.dataset();
  for (const q of parser.parse(text)) ds.add(q);
  return ds;
}

export class ShaclValidator {
  private constructor(private validator: SHACLValidator) {}

  static async load(shapesPath: string): Promise<ShaclValidator> {
    const shapes = datasetFromQuads(readFileSync(shapesPath, 'utf-8'), 'turtle');
    return new ShaclValidator(new SHACLValidator(shapes, { factory: rdf }));
  }

  async validateJsonLd(doc: object): Promise<ShaclResult> {
    const nquads = (await jsonld.toRDF(doc as jsonld.JsonLdDocument, {
      format: 'application/n-quads',
    })) as string;
    const data = datasetFromQuads(nquads, 'n-quads');
    const report = this.validator.validate(data);
    const messages = report.results.map((r) => {
      const msg = r.message.map((m) => m.value).join('; ');
      const path = r.path?.value ?? '';
      return msg || `violation on ${path}`;
    });
    return { conforms: report.conforms, results: messages };
  }
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `bun run vitest run tests/daemon/shacl.test.ts`
Expected: PASS (4 tests). If `rdf-validate-shacl` rejects an `n3.Parser`-produced quad against the `rdf-ext` dataset factory, the fix is to map quads through `rdf.quad(...)` in `datasetFromQuads`; re-run until green. This is the single riskiest interop point — resolve it here, not later.

- [ ] **Step 6: Commit**

```bash
git add src/daemon/shacl.ts src/daemon/templates.ts tests/daemon/shacl.test.ts
git commit -m "feat(daemon): SHACL validator over JSON-LD writes"
```

---

## Task 4: JSON-LD templates — reply and assertion builders

**Files:**
- Modify: `src/daemon/templates.ts`
- Test: `tests/daemon/templates.test.ts`

Builders return two shapes per call: a `validationDoc` (inline context, for SHACL) and the `podBody` string (`@context: "./context.jsonld"`, for `PUT`). One function each.

- [ ] **Step 1: Write the failing test `tests/daemon/templates.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildReplyDoc, buildAssertionDoc, INLINE_CONTEXT } from '../../src/daemon/templates';

describe('buildReplyDoc', () => {
  it('produces msg{N+1} with agent speaker and relative context in pod body', () => {
    const { validationDoc, podBody, path } = buildReplyDoc({
      sessionId: 'Session_1', msgN: 3, body: 'Solid is a spec.', now: '2026-05-28T10:00:00Z',
    });
    expect(path).toBe('/aleph/sessions/Session_1/msg4.jsonld');
    const chat = (validationDoc['@graph'] as any[]).find((n) => n['@type'] === 'ChatMessage');
    expect(chat.speaker).toBe('agent');
    expect(chat.position).toBe(4);
    expect(chat['@id']).toBe('g:Session_1_msg4');
    expect(validationDoc['@context']).toBe(INLINE_CONTEXT);
    expect(JSON.parse(podBody)['@context']).toBe('./context.jsonld');
  });
});

describe('buildAssertionDoc', () => {
  it('builds a WebSearchAssertion header with derivedFrom + searchQuery', () => {
    const { validationDoc, podBody, path } = buildAssertionDoc({
      sessionId: 'Session_1', msgN: 3, kind: 'web', now: '2026-05-28T10:00:00Z', ts: '20260528T100000',
      jsonld: { '@graph': [{ '@id': 'g:Solid', '@type': 'Concept', prefLabel: { en: 'Solid' } }] },
      provenance: { derivedFrom: 'https://solidproject.org', searchQuery: 'what is solid' },
    });
    expect(path).toBe('/aleph/assertions/Session_1/web_20260528T100000.jsonld');
    const act = (validationDoc['@graph'] as any[]).find((n) => n['@type'] === 'WebSearchAssertion');
    expect(act.derivedFrom).toBe('https://solidproject.org');
    expect(act.searchQuery).toBe('what is solid');
    expect(act.wasGeneratedBy).toBe('g:Session_1_turn3');
    // agent-supplied triples are carried through
    expect((validationDoc['@graph'] as any[]).some((n) => n['@id'] === 'g:Solid')).toBe(true);
    expect(JSON.parse(podBody)['@context']).toBe('./context.jsonld');
  });

  it('builds a SparqlAssertion header with query + endpoints', () => {
    const { validationDoc } = buildAssertionDoc({
      sessionId: 'Session_1', msgN: 3, kind: 'sparql', now: '2026-05-28T10:00:00Z', ts: 't',
      jsonld: { '@graph': [] },
      provenance: { query: 'SELECT * WHERE {?s ?p ?o}', endpoints: ['https://dbpedia.org/sparql'] },
    });
    const act = (validationDoc['@graph'] as any[]).find((n) => n['@type'] === 'SparqlAssertion');
    expect(act.query).toContain('SELECT');
    expect(act.endpoints).toEqual(['https://dbpedia.org/sparql']);
  });

  it('builds a minimal ImaginedAssertion header', () => {
    const { validationDoc } = buildAssertionDoc({
      sessionId: 'Session_1', msgN: 3, kind: 'imagined', now: '2026-05-28T10:00:00Z', ts: 't',
      jsonld: { '@graph': [] }, provenance: {},
    });
    const act = (validationDoc['@graph'] as any[]).find((n) => n['@type'] === 'ImaginedAssertion');
    expect(act.wasGeneratedBy).toBe('g:Session_1_turn3');
    expect(act.derivedFrom).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run vitest run tests/daemon/templates.test.ts`
Expected: FAIL — `buildReplyDoc`/`buildAssertionDoc` are not exported.

- [ ] **Step 3: Add the builders to `src/daemon/templates.ts`**

Append below `INLINE_CONTEXT`:
```typescript
export interface ReplyInput {
  sessionId: string;
  msgN: number;
  body: string;
  now: string;
}

export interface BuiltDoc {
  /** Inline-context JSON-LD for SHACL validation. */
  validationDoc: Record<string, unknown>;
  /** Serialized JSON-LD for PUT, using the relative ./context.jsonld. */
  podBody: string;
  /** Pod path to PUT to. */
  path: string;
}

function podSerialize(graph: unknown[]): string {
  return JSON.stringify({ '@context': './context.jsonld', '@graph': graph });
}

export function buildReplyDoc(input: ReplyInput): BuiltDoc {
  const { sessionId, msgN, body, now } = input;
  const next = msgN + 1;
  const graph = [
    {
      '@id': `g:${sessionId}_msg${next}`,
      '@type': 'ChatMessage',
      position: next,
      speaker: 'agent',
      body,
      wasGeneratedBy: `g:${sessionId}`,
      generatedAtTime: now,
    },
    {
      '@id': '',
      '@type': 'Edit',
      editKind: 'create',
      wasGeneratedBy: `g:${sessionId}`,
      generatedAtTime: now,
    },
  ];
  return {
    validationDoc: { '@context': INLINE_CONTEXT, '@graph': graph },
    podBody: podSerialize(graph),
    path: `/aleph/sessions/${sessionId}/msg${next}.jsonld`,
  };
}

export type AssertionKind = 'web' | 'sparql' | 'imagined';

export interface AssertionProvenance {
  derivedFrom?: string;
  searchQuery?: string;
  query?: string;
  endpoints?: string[];
}

export interface AssertionInput {
  sessionId: string;
  msgN: number;
  kind: AssertionKind;
  now: string;
  ts: string;
  jsonld: { '@graph'?: unknown[] };
  provenance: AssertionProvenance;
}

const KIND_TYPE: Record<AssertionKind, string> = {
  web: 'WebSearchAssertion',
  sparql: 'SparqlAssertion',
  imagined: 'ImaginedAssertion',
};

export function buildAssertionDoc(input: AssertionInput): BuiltDoc {
  const { sessionId, msgN, kind, now, ts, jsonld, provenance } = input;
  const header: Record<string, unknown> = {
    '@id': '',
    '@type': KIND_TYPE[kind],
    wasGeneratedBy: `g:${sessionId}_turn${msgN}`,
    generatedAtTime: now,
  };
  if (kind === 'web') {
    if (provenance.derivedFrom) header.derivedFrom = provenance.derivedFrom;
    if (provenance.searchQuery) header.searchQuery = provenance.searchQuery;
  } else if (kind === 'sparql') {
    if (provenance.query) header.query = provenance.query;
    if (provenance.endpoints) header.endpoints = provenance.endpoints;
  }
  const graph = [header, ...(jsonld['@graph'] ?? [])];
  return {
    validationDoc: { '@context': INLINE_CONTEXT, '@graph': graph },
    podBody: podSerialize(graph),
    path: `/aleph/assertions/${sessionId}/${kind}_${ts}.jsonld`,
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run vitest run tests/daemon/templates.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/templates.ts tests/daemon/templates.test.ts
git commit -m "feat(daemon): reply and assertion JSON-LD builders"
```

---

## Task 5: Event router

**Files:**
- Create: `src/daemon/router.ts`
- Test: `tests/daemon/router.test.ts`

`routeEvent(url, pod)` returns a `Trigger` only for a genuinely-new, unanswered user message. It uses a minimal `PodLike` interface so tests pass a stub.

- [ ] **Step 1: Write the failing test `tests/daemon/router.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { routeEvent } from '../../src/daemon/router';

const BASE = 'http://localhost:3000';

/** Stub pod: container listings + msg bodies keyed by path. */
function stubPod(opts: {
  list: Record<string, string[]>;
  bodies: Record<string, string>;
}) {
  return {
    baseUrl: BASE,
    async listContainer(path: string) { return opts.list[path] ?? []; },
    async getResource(path: string) { return opts.bodies[path] ?? null; },
  };
}

const userMsg = (n: number) =>
  JSON.stringify({ '@graph': [{ '@type': 'ChatMessage', position: n, speaker: 'user' }] });
const agentMsg = (n: number) =>
  JSON.stringify({ '@graph': [{ '@type': 'ChatMessage', position: n, speaker: 'agent' }] });

describe('routeEvent', () => {
  it('returns a trigger for a new unanswered user msg', async () => {
    const pod = stubPod({
      list: { '/aleph/sessions/s_abc/': ['meta.ttl', 'msg1.jsonld', 'msg2.jsonld', 'msg3.jsonld'] },
      bodies: { '/aleph/sessions/s_abc/msg3.jsonld': userMsg(3) },
    });
    const t = await routeEvent(`${BASE}/aleph/sessions/s_abc/`, pod as any);
    expect(t).toEqual({ sessionId: 's_abc', msgN: 3 });
  });

  it('returns null when the latest msg is from the agent', async () => {
    const pod = stubPod({
      list: { '/aleph/sessions/s_abc/': ['msg1.jsonld', 'msg2.jsonld'] },
      bodies: { '/aleph/sessions/s_abc/msg2.jsonld': agentMsg(2) },
    });
    expect(await routeEvent(`${BASE}/aleph/sessions/s_abc/`, pod as any)).toBeNull();
  });

  it('returns null when a reply already exists (msg{N+1})', async () => {
    // Highest is msg4 (agent) → handled by the agent-speaker check.
    const pod = stubPod({
      list: { '/aleph/sessions/s_abc/': ['msg3.jsonld', 'msg4.jsonld'] },
      bodies: { '/aleph/sessions/s_abc/msg4.jsonld': agentMsg(4) },
    });
    expect(await routeEvent(`${BASE}/aleph/sessions/s_abc/`, pod as any)).toBeNull();
  });

  it('returns null for non-session paths', async () => {
    const pod = stubPod({ list: {}, bodies: {} });
    expect(await routeEvent(`${BASE}/aleph/concepts/Solid.ttl`, pod as any)).toBeNull();
    expect(await routeEvent(`${BASE}/aleph/assertions/s_abc/web_x.jsonld`, pod as any)).toBeNull();
  });

  it('returns null for an empty session container', async () => {
    const pod = stubPod({ list: { '/aleph/sessions/s_abc/': ['meta.ttl'] }, bodies: {} });
    expect(await routeEvent(`${BASE}/aleph/sessions/s_abc/`, pod as any)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run vitest run tests/daemon/router.test.ts`
Expected: FAIL — cannot find `../../src/daemon/router`.

- [ ] **Step 3: Write `src/daemon/router.ts`**

```typescript
import type { Trigger } from './types';

export interface PodLike {
  baseUrl: string;
  listContainer(path: string): Promise<string[]>;
  getResource(path: string): Promise<string | null>;
}

const SESSION_RE = /\/aleph\/sessions\/([^/]+)\/?$/;

/** Highest N among msg{N}.jsonld entries (basename or full URL), or 0. */
function highestMsg(entries: string[]): number {
  let max = 0;
  for (const e of entries) {
    const m = e.match(/msg(\d+)\.jsonld$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function speakerOf(body: string): string | null {
  try {
    const doc = JSON.parse(body);
    const graph: any[] = doc['@graph'] ?? [doc];
    const chat = graph.find((n) => n['@type'] === 'ChatMessage' || n['@type'] === 'aleph:ChatMessage');
    return chat?.speaker ?? null;
  } catch {
    return null;
  }
}

export async function routeEvent(url: string, pod: PodLike): Promise<Trigger | null> {
  const local = url.replace(pod.baseUrl.replace(/\/$/, ''), '');
  const m = local.match(SESSION_RE);
  if (!m) return null;
  const sessionId = m[1];
  const containerPath = `/aleph/sessions/${sessionId}/`;

  const entries = await pod.listContainer(containerPath);
  const n = highestMsg(entries);
  if (n === 0) return null;

  const body = await pod.getResource(`${containerPath}msg${n}.jsonld`);
  if (!body) return null;
  if (speakerOf(body) !== 'user') return null;

  return { sessionId, msgN: n };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run vitest run tests/daemon/router.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/router.ts tests/daemon/router.test.ts
git commit -m "feat(daemon): event router with new-user-msg filter"
```

---

## Task 6: Per-session serial queue

**Files:**
- Create: `src/daemon/queue.ts`
- Test: `tests/daemon/queue.test.ts`

- [ ] **Step 1: Write the failing test `tests/daemon/queue.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SessionQueue } from '../../src/daemon/queue';

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('SessionQueue', () => {
  it('runs same-session work serially in FIFO order', async () => {
    const q = new SessionQueue();
    const order: string[] = [];
    q.enqueue('s', async () => { await tick(); order.push('a'); });
    q.enqueue('s', async () => { order.push('b'); });
    await tick(); await tick();
    expect(order).toEqual(['a', 'b']);
  });

  it('runs different sessions concurrently', async () => {
    const q = new SessionQueue();
    const order: string[] = [];
    q.enqueue('s1', async () => { await tick(); order.push('s1'); });
    q.enqueue('s2', async () => { order.push('s2'); }); // no await → finishes first
    await tick(); await tick();
    expect(order).toEqual(['s2', 's1']);
  });

  it('a throwing job does not block the next job in the same session', async () => {
    const q = new SessionQueue();
    const order: string[] = [];
    q.enqueue('s', async () => { throw new Error('boom'); });
    q.enqueue('s', async () => { order.push('after'); });
    await tick(); await tick();
    expect(order).toEqual(['after']);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run vitest run tests/daemon/queue.test.ts`
Expected: FAIL — cannot find `../../src/daemon/queue`.

- [ ] **Step 3: Write `src/daemon/queue.ts`**

```typescript
/** Per-session FIFO. Same sessionId chains; different sessionIds run in parallel. */
export class SessionQueue {
  private tails = new Map<string, Promise<void>>();

  enqueue(sessionId: string, work: () => Promise<void>): void {
    const prev = this.tails.get(sessionId) ?? Promise.resolve();
    // A failed job must not poison the chain: swallow here, log in the worker.
    const next = prev.then(() => work().catch((e) => {
      console.error(`[queue] job failed for ${sessionId}:`, e);
    }));
    this.tails.set(sessionId, next);
    // Drop the map entry once this is the last job and it settles.
    next.finally(() => {
      if (this.tails.get(sessionId) === next) this.tails.delete(sessionId);
    });
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run vitest run tests/daemon/queue.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/queue.ts tests/daemon/queue.test.ts
git commit -m "feat(daemon): per-session serial queue"
```

---

## Task 7: WebSocket subscriber (Node `ws`)

**Files:**
- Create: `src/daemon/subscriber.ts`
- Test: `tests/daemon/subscriber.test.ts`

Mirrors `PodClient.subscribe` logic but with the `ws` package and the documented `solid-0.1` subprotocol. The `WebSocket` constructor is injectable for testing (default: `ws`).

- [ ] **Step 1: Write the failing test `tests/daemon/subscriber.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { subscribeContainer } from '../../src/daemon/subscriber';

describe('subscribeContainer', () => {
  it('opens ws, sends sub, forwards pub urls', async () => {
    const sent: string[] = [];
    const handlers: Record<string, ((arg?: unknown) => void)[]> = {};
    class FakeWS {
      constructor(public url: string, public protocols: string[]) {}
      on(ev: string, cb: (arg?: unknown) => void) { (handlers[ev] ??= []).push(cb); }
      send(msg: string) { sent.push(msg); }
      close() {}
    }
    const pubs: string[] = [];
    const stop = subscribeContainer(
      'http://localhost:3000', '/aleph/sessions/', (url) => pubs.push(url),
      { WebSocketCtor: FakeWS as any },
    );
    handlers['open'][0]();
    expect(sent[0]).toBe('sub http://localhost:3000/aleph/sessions/');
    handlers['message'][0]('pub http://localhost:3000/aleph/sessions/s_abc/');
    expect(pubs).toEqual(['http://localhost:3000/aleph/sessions/s_abc/']);
    stop();
  });

  it('ignores non-pub frames', async () => {
    const handlers: Record<string, ((arg?: unknown) => void)[]> = {};
    class FakeWS {
      constructor(public url: string, public protocols: string[]) {}
      on(ev: string, cb: (arg?: unknown) => void) { (handlers[ev] ??= []).push(cb); }
      send() {} close() {}
    }
    const pubs: string[] = [];
    subscribeContainer('http://localhost:3000', '/aleph/sessions/', (u) => pubs.push(u),
      { WebSocketCtor: FakeWS as any });
    handlers['message'][0]('ack');
    expect(pubs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run vitest run tests/daemon/subscriber.test.ts`
Expected: FAIL — cannot find `../../src/daemon/subscriber`.

- [ ] **Step 3: Write `src/daemon/subscriber.ts`**

```typescript
import WS from 'ws';

export interface SubscribeOptions {
  /** Injectable WS constructor for tests. Defaults to the `ws` package. */
  WebSocketCtor?: typeof WS;
  onStatus?: (s: 'connecting' | 'online' | 'reconnecting') => void;
}

/**
 * Subscribe to a JSS container's notifications. Calls onPub(fullUrl) for each
 * `pub <url>` frame. Reconnects with exponential backoff (1s → 30s).
 * Returns an unsubscribe function.
 */
export function subscribeContainer(
  podBase: string,
  path: string,
  onPub: (url: string) => void,
  opts: SubscribeOptions = {},
): () => void {
  const Ctor = opts.WebSocketCtor ?? WS;
  const wsUrl = podBase.replace(/^http/, 'ws').replace(/\/$/, '') + '/.notifications';
  const subTarget = podBase.replace(/\/$/, '') + path;
  let ws: WS | null = null;
  let closed = false;
  let backoff = 1000;

  const open = () => {
    if (closed) return;
    opts.onStatus?.('connecting');
    ws = new Ctor(wsUrl, ['solid-0.1']);
    ws.on('open', () => {
      backoff = 1000;
      opts.onStatus?.('online');
      ws!.send(`sub ${subTarget}`);
    });
    ws.on('message', (data: unknown) => {
      const text = typeof data === 'string' ? data : String(data);
      if (!text.startsWith('pub ')) return;
      onPub(text.slice(4).trim());
    });
    ws.on('close', () => {
      if (closed) return;
      opts.onStatus?.('reconnecting');
      setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, 30000);
    });
    ws.on('error', () => { ws?.close(); });
  };

  open();
  return () => { closed = true; ws?.close(); };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run vitest run tests/daemon/subscriber.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/subscriber.ts tests/daemon/subscriber.test.ts
git commit -m "feat(daemon): ws-based container subscriber"
```

---

## Task 8: Comunica SPARQL engine wrapper

**Files:**
- Create: `src/daemon/mcp/sparql.ts`
- Test: `tests/daemon/sparql.test.ts`

Thin wrapper with a 15s timeout and a structured error result. The unit test injects a fake Comunica-shaped engine; no network.

- [ ] **Step 1: Write the failing test `tests/daemon/sparql.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SparqlEngine } from '../../src/daemon/mcp/sparql';

/** Fake Comunica engine: queryBindings → object with toArray(). */
function fakeEngine(rows: Record<string, { value: string }>[]) {
  return {
    queryBindings: async () => ({
      toArray: async () => rows.map((r) => ({
        entries: { keys: () => Object.keys(r) },
        get: (k: string) => r[k],
        forEach: (cb: (v: { value: string }, k: { value: string }) => void) =>
          Object.entries(r).forEach(([k, v]) => cb(v, { value: k })),
      })),
    }),
  };
}

describe('SparqlEngine', () => {
  it('maps bindings to plain objects', async () => {
    const eng = new SparqlEngine(['https://dbpedia.org/sparql'],
      fakeEngine([{ s: { value: 'http://x' }, label: { value: 'X' } }]) as any);
    const r = await eng.run('SELECT * WHERE {?s ?p ?o}');
    expect(r).toEqual({ bindings: [{ s: 'http://x', label: 'X' }] });
  });

  it('returns a structured error when the engine throws', async () => {
    const eng = new SparqlEngine(['x'],
      { queryBindings: async () => { throw new Error('bad query'); } } as any);
    const r = await eng.run('NONSENSE');
    expect(r).toEqual({ error: 'sparql', detail: expect.stringContaining('bad query') });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run vitest run tests/daemon/sparql.test.ts`
Expected: FAIL — cannot find `../../src/daemon/mcp/sparql`.

- [ ] **Step 3: Write `src/daemon/mcp/sparql.ts`**

```typescript
import { QueryEngine } from '@comunica/query-sparql';

export type SparqlResult =
  | { bindings: Record<string, string>[] }
  | { error: 'sparql'; detail: string };

const TIMEOUT_MS = 15_000;

interface BindingsLike {
  forEach(cb: (value: { value: string }, key: { value: string }) => void): void;
}
interface EngineLike {
  queryBindings(query: string, ctx: { sources: string[] }): Promise<{ toArray(): Promise<BindingsLike[]> }>;
}

export class SparqlEngine {
  private engine: EngineLike;
  constructor(private defaultSources: string[], engine?: EngineLike) {
    this.engine = engine ?? (new QueryEngine() as unknown as EngineLike);
  }

  async run(query: string, sources?: string[]): Promise<SparqlResult> {
    const useSources = sources?.length ? sources : this.defaultSources;
    try {
      const result = await withTimeout(
        this.engine.queryBindings(query, { sources: useSources }),
        TIMEOUT_MS,
      );
      const rows = await result.toArray();
      const bindings = rows.map((b) => {
        const obj: Record<string, string> = {};
        b.forEach((v, k) => { obj[k.value] = v.value; });
        return obj;
      });
      return { bindings };
    } catch (e) {
      return { error: 'sparql', detail: e instanceof Error ? e.message : String(e) };
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`sparql timeout after ${ms}ms`)), ms)),
  ]);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run vitest run tests/daemon/sparql.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/mcp/sparql.ts tests/daemon/sparql.test.ts
git commit -m "feat(daemon): Comunica SPARQL engine wrapper with timeout"
```

---

## Task 9: In-process MCP server with the four tools

**Files:**
- Create: `src/daemon/mcp/server.ts`
- Test: `tests/daemon/mcp-server.test.ts`

`createAlephServer(deps, ctx)` returns the SDK MCP server plus the bare tool handlers (exported for unit testing without booting the SDK). Each tool validates before `PUT`. `write_message` sets `ctx.messageWritten`. Failed validations increment `ctx.shaclFailures` keyed by `kind`; after 3, a persistent error is returned.

- [ ] **Step 1: Write the failing test `tests/daemon/mcp-server.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTools } from '../../src/daemon/mcp/server';
import { ShaclValidator } from '../../src/daemon/shacl';
import type { RunContext } from '../../src/daemon/types';

let validator: ShaclValidator;
beforeEach(async () => { validator = await ShaclValidator.load('vocab/aleph-shapes.ttl'); });

function ctx(): RunContext {
  return { sessionId: 's1', msgN: 3, messageWritten: false, shaclFailures: new Map() };
}

/** Pod stub recording PUTs; getResource returns null. */
function recPod() {
  const puts: { path: string; body: string }[] = [];
  return {
    puts,
    baseUrl: 'http://localhost:3000',
    async putResource(path: string, body: string) { puts.push({ path, body }); },
    async getResource() { return null; },
    async listContainer() { return []; },
  };
}

describe('write_message tool', () => {
  it('PUTs msg{N+1}, sets messageWritten', async () => {
    const pod = recPod();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, c);
    const res = await tools.write_message({ sessionId: 's1', msgN: 3, body: 'hi' });
    expect(res).toMatchObject({ ok: true, path: '/aleph/sessions/s1/msg4.jsonld' });
    expect(pod.puts[0].path).toBe('/aleph/sessions/s1/msg4.jsonld');
    expect(JSON.parse(pod.puts[0].body)['@context']).toBe('./context.jsonld');
    expect(c.messageWritten).toBe(true);
  });
});

describe('assert_triples tool', () => {
  it('web kind with derivedFrom writes a file and a WebSearchAssertion header', async () => {
    const pod = recPod();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, ctx());
    const res = await tools.assert_triples({
      sessionId: 's1', kind: 'web',
      jsonld: { '@graph': [{ '@id': 'g:Solid', '@type': 'Concept', prefLabel: { en: 'Solid' } }] },
      provenance: { derivedFrom: 'https://solidproject.org', searchQuery: 'solid' },
    });
    expect(res).toMatchObject({ ok: true });
    expect(pod.puts[0].path).toMatch(/^\/aleph\/assertions\/s1\/web_/);
  });

  it('sparql kind without query returns a shacl error and increments failures', async () => {
    const pod = recPod();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, c);
    const res = await tools.assert_triples({
      sessionId: 's1', kind: 'sparql', jsonld: { '@graph': [] },
      provenance: { endpoints: ['https://dbpedia.org/sparql'] }, // no query
    });
    expect(res).toMatchObject({ error: 'shacl' });
    expect(pod.puts).toHaveLength(0);
    expect(c.shaclFailures.get('sparql')).toBe(1);
  });

  it('returns persistent error after 3 shacl failures for the same kind', async () => {
    const pod = recPod();
    const c = ctx();
    c.shaclFailures.set('sparql', 3);
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, c);
    const res = await tools.assert_triples({
      sessionId: 's1', kind: 'sparql', jsonld: { '@graph': [] }, provenance: {},
    });
    expect(res).toMatchObject({ error: 'persistent' });
  });
});

describe('read_pod tool', () => {
  it('returns 404 error when missing', async () => {
    const pod = recPod();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, ctx());
    const res = await tools.read_pod({ path: '/aleph/sessions/s1/meta.ttl' });
    expect(res).toEqual({ error: '404' });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run vitest run tests/daemon/mcp-server.test.ts`
Expected: FAIL — cannot find `makeTools` in `../../src/daemon/mcp/server`.

- [ ] **Step 3: Write `src/daemon/mcp/server.ts`**

```typescript
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { PodClient } from '../../lib/pod';
import type { ShaclValidator } from '../shacl';
import type { SparqlEngine } from './sparql';
import type { RunContext } from '../types';
import { buildReplyDoc, buildAssertionDoc, type AssertionKind } from '../templates';

export interface ToolDeps {
  pod: PodClient;
  validator: ShaclValidator;
  sparql: SparqlEngine;
}

const MAX_SHACL_FAILURES = 3;

function nowIso(): string { return new Date().toISOString(); }
function fileTs(): string { return new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, ''); }

/** Bare tool handlers — pure-ish, unit-testable without the SDK. */
export function makeTools(deps: ToolDeps, ctx: RunContext) {
  const { pod, validator, sparql } = deps;

  async function read_pod(input: { path: string }) {
    try {
      const body = await pod.getResource(input.path);
      if (body === null) return { error: '404' as const };
      return { body, contentType: 'text/turtle' };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function sparql_query(input: { query: string; sources?: string[] }) {
    return sparql.run(input.query, input.sources);
  }

  async function write_message(input: { sessionId: string; msgN: number; body: string }) {
    const built = buildReplyDoc({
      sessionId: input.sessionId, msgN: input.msgN, body: input.body, now: nowIso(),
    });
    const report = await validator.validateJsonLd(built.validationDoc);
    if (!report.conforms) return { error: 'shacl' as const, report: report.results };
    try {
      await pod.putResource(built.path, built.podBody, {
        contentType: 'application/ld+json', ifNoneMatch: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('412')) return { error: 'conflict' as const };
      throw e;
    }
    ctx.messageWritten = true;
    return { ok: true as const, path: built.path };
  }

  async function assert_triples(input: {
    sessionId: string;
    kind: AssertionKind;
    jsonld: { '@graph'?: unknown[] };
    provenance: { derivedFrom?: string; searchQuery?: string; query?: string; endpoints?: string[] };
  }) {
    if ((ctx.shaclFailures.get(input.kind) ?? 0) >= MAX_SHACL_FAILURES) {
      return { error: 'persistent' as const, kind: input.kind };
    }
    const built = buildAssertionDoc({
      sessionId: input.sessionId, msgN: ctx.msgN, kind: input.kind,
      now: nowIso(), ts: fileTs(), jsonld: input.jsonld, provenance: input.provenance,
    });
    const report = await validator.validateJsonLd(built.validationDoc);
    if (!report.conforms) {
      ctx.shaclFailures.set(input.kind, (ctx.shaclFailures.get(input.kind) ?? 0) + 1);
      return { error: 'shacl' as const, report: report.results };
    }
    await pod.putResource(built.path, built.podBody, { contentType: 'application/ld+json' });
    return { ok: true as const, path: built.path };
  }

  return { read_pod, sparql_query, write_message, assert_triples };
}

/** Wrap the bare handlers as an in-process SDK MCP server named "aleph". */
export function createAlephServer(deps: ToolDeps, ctx: RunContext) {
  const t = makeTools(deps, ctx);
  const txt = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }] });

  const server = createSdkMcpServer({
    name: 'aleph',
    version: '0.1.0',
    tools: [
      tool('read_pod', 'GET a pod resource as text/turtle.',
        { path: z.string() },
        async (i) => txt(await t.read_pod(i))),
      tool('sparql_query', 'Run a federated SPARQL query via Comunica.',
        { query: z.string(), sources: z.array(z.string()).optional() },
        async (i) => txt(await t.sparql_query(i))),
      tool('write_message', 'Write the agent reply as the next chat message (SHACL-validated).',
        { sessionId: z.string(), msgN: z.number(), body: z.string() },
        async (i) => txt(await t.write_message(i))),
      tool('assert_triples', 'Persist provenance-tagged triples as an assertion file (SHACL-validated).',
        {
          sessionId: z.string(),
          kind: z.enum(['web', 'sparql', 'imagined']),
          jsonld: z.object({ '@graph': z.array(z.any()).optional() }).passthrough(),
          provenance: z.object({
            derivedFrom: z.string().optional(),
            searchQuery: z.string().optional(),
            query: z.string().optional(),
            endpoints: z.array(z.string()).optional(),
          }),
        },
        async (i) => txt(await t.assert_triples(i as any))),
    ],
  });
  return { server, tools: t };
}
```

> Note on `tool()` input schemas: the SDK accepts a Zod *raw shape* object (`{ path: z.string() }`) — matches the published examples for `@anthropic-ai/claude-agent-sdk@0.3.x`. If a version mismatch surfaces at runtime, wrap each in `z.object({...})`; the unit tests call `makeTools` directly and are unaffected.

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run vitest run tests/daemon/mcp-server.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/mcp/server.ts tests/daemon/mcp-server.test.ts
git commit -m "feat(daemon): in-process MCP tools with SHACL-gated writes"
```

---

## Task 10: Agent runner with fallback + timeout

**Files:**
- Create: `src/daemon/runner.ts`
- Test: `tests/daemon/runner.test.ts`

`runAgent(trigger, deps, queryFn?)` builds a fresh `RunContext`, renders the prompt, creates the per-run MCP server, and drives `query()`. `queryFn` is injectable so tests pass a MockSdk async generator. After the generator ends, if `ctx.messageWritten` is still false, it writes a fallback reply (reusing `write_message`-equivalent path through the bare tools). A 5-minute `AbortController` bounds the run.

- [ ] **Step 1: Write the failing test `tests/daemon/runner.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { runAgent } from '../../src/daemon/runner';
import { ShaclValidator } from '../../src/daemon/shacl';
import type { DaemonDeps } from '../../src/daemon/types';

let validator: ShaclValidator;
beforeEach(async () => { validator = await ShaclValidator.load('vocab/aleph-shapes.ttl'); });

function recPod() {
  const puts: { path: string; body: string }[] = [];
  return {
    puts, baseUrl: 'http://localhost:3000',
    async putResource(path: string, body: string) { puts.push({ path, body }); },
    async getResource() { return null; },
    async listContainer() { return []; },
  };
}

function deps(pod: ReturnType<typeof recPod>): DaemonDeps {
  return {
    config: { podBase: 'http://localhost:3000', comunicaSources: [], promptPath: 'x' },
    pod: pod as any, validator, sparql: { run: async () => ({ bindings: [] }) } as any,
    renderPrompt: () => 'PROMPT',
  };
}

/** MockSdk: a query() that emits assistant tool_use messages then a result.
 *  It invokes the real in-process tools via the provided mcpServers handler is
 *  out of scope; instead the mock calls deps tools by writing through the pod
 *  using the same path the runner exposes. Simpler: the mock just yields a
 *  result; whether a reply was written is simulated by calling the bound tool. */

describe('runAgent', () => {
  it('writes a fallback reply when the agent never calls write_message', async () => {
    const pod = recPod();
    const fakeQuery = async function* () {
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'thinking' }] } };
      yield { type: 'result', subtype: 'success' };
    };
    await runAgent({ sessionId: 's1', msgN: 3 }, deps(pod), fakeQuery as any);
    expect(pod.puts).toHaveLength(1);
    expect(pod.puts[0].path).toBe('/aleph/sessions/s1/msg4.jsonld');
    expect(JSON.parse(pod.puts[0].body)['@graph'][0].body).toMatch(/konnte keine Antwort/i);
  });

  it('does not write a fallback when write_message already ran', async () => {
    const pod = recPod();
    // The mock drives the run context's write_message via the exposed tools.
    const fakeQuery = async function* (_args: unknown, hooks: { tools: any }) {
      await hooks.tools.write_message({ sessionId: 's1', msgN: 3, body: 'real reply' });
      yield { type: 'result', subtype: 'success' };
    };
    await runAgent({ sessionId: 's1', msgN: 3 }, deps(pod), fakeQuery as any);
    const replies = pod.puts.filter((p) => p.path === '/aleph/sessions/s1/msg4.jsonld');
    expect(replies).toHaveLength(1);
    expect(JSON.parse(replies[0].body)['@graph'][0].body).toBe('real reply');
  });
});
```

> The runner exposes the bound bare `tools` to the injected `queryFn` as a second argument purely so the MockSdk can simulate tool calls. The real SDK ignores extra args. Implement accordingly.

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run vitest run tests/daemon/runner.test.ts`
Expected: FAIL — cannot find `../../src/daemon/runner`.

- [ ] **Step 3: Write `src/daemon/runner.ts`**

```typescript
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { DaemonDeps, Trigger, RunContext } from './types';
import { createAlephServer } from './mcp/server';

const TIMEOUT_MS = 5 * 60_000;
const FALLBACK_BODY = 'Agent konnte keine Antwort generieren.';

/** Signature compatible with both the real SDK query() and the test MockSdk.
 *  The second arg (bound tools) is only consumed by the MockSdk. */
type QueryFn = (
  args: { prompt: string; options: Record<string, unknown> },
  hooks: { tools: ReturnType<typeof createAlephServer>['tools'] },
) => AsyncGenerator<{ type: string; subtype?: string; message?: { content: any[] } }>;

export async function runAgent(
  trigger: Trigger,
  deps: DaemonDeps,
  queryFn: QueryFn = sdkQuery as unknown as QueryFn,
): Promise<void> {
  const ctx: RunContext = {
    sessionId: trigger.sessionId, msgN: trigger.msgN,
    messageWritten: false, shaclFailures: new Map(),
  };
  const { server, tools } = createAlephServer(deps, ctx);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const gen = queryFn(
      {
        prompt: deps.renderPrompt(trigger),
        options: {
          model: deps.config.model,
          mcpServers: { aleph: server },
          allowedTools: ['WebSearch', 'WebFetch', 'mcp__aleph__*'],
          permissionMode: 'acceptEdits',
          abortController: ac,
        },
      },
      { tools },
    );
    for await (const msg of gen) {
      if (msg.type === 'assistant') {
        for (const block of msg.message?.content ?? []) {
          if (block.type === 'tool_use') console.log(`[runner] tool_use ${block.name}`);
        }
      } else if (msg.type === 'result') {
        if (msg.subtype !== 'success') console.warn(`[runner] result subtype=${msg.subtype}`);
      }
    }
  } catch (e) {
    console.error(`[runner] query failed for ${trigger.sessionId}:`, e);
  } finally {
    clearTimeout(timer);
  }

  if (!ctx.messageWritten) {
    console.warn(`[runner] no write_message for ${trigger.sessionId} → fallback`);
    await tools.write_message({
      sessionId: trigger.sessionId, msgN: trigger.msgN, body: FALLBACK_BODY,
    });
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run vitest run tests/daemon/runner.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/runner.ts tests/daemon/runner.test.ts
git commit -m "feat(daemon): agent runner with fallback reply and timeout"
```

---

## Task 11: Bootstrap (`main.ts`) + drain-unanswered

**Files:**
- Create: `src/daemon/main.ts`
- Test: `tests/daemon/drain.test.ts`

`drainUnanswered(deps, queue, enqueueRun)` is extracted as a testable function: it lists `/aleph/sessions/`, runs the router on each, and enqueues a run per trigger. `main()` wires config → deps → drain → subscribe and is guarded by `import.meta.main` so importing the module in tests does not start the daemon.

- [ ] **Step 1: Write the failing test `tests/daemon/drain.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { drainUnanswered } from '../../src/daemon/main';

const BASE = 'http://localhost:3000';

function stubPod(list: Record<string, string[]>, bodies: Record<string, string>) {
  return {
    baseUrl: BASE,
    async listContainer(p: string) { return list[p] ?? []; },
    async getResource(p: string) { return bodies[p] ?? null; },
  };
}
const userMsg = (n: number) =>
  JSON.stringify({ '@graph': [{ '@type': 'ChatMessage', position: n, speaker: 'user' }] });

describe('drainUnanswered', () => {
  it('enqueues one run per unanswered session', async () => {
    const pod = stubPod(
      {
        '/aleph/sessions/': [`${BASE}/aleph/sessions/s1/`, `${BASE}/aleph/sessions/s2/`],
        '/aleph/sessions/s1/': ['msg1.jsonld'],
        '/aleph/sessions/s2/': ['msg1.jsonld'],
      },
      {
        '/aleph/sessions/s1/msg1.jsonld': userMsg(1),
        '/aleph/sessions/s2/msg1.jsonld': userMsg(1),
      },
    );
    const enqueued: string[] = [];
    await drainUnanswered(pod as any, (t) => enqueued.push(t.sessionId));
    expect(enqueued.sort()).toEqual(['s1', 's2']);
  });

  it('skips sessions whose latest msg is answered', async () => {
    const pod = stubPod(
      { '/aleph/sessions/': [`${BASE}/aleph/sessions/s1/`], '/aleph/sessions/s1/': ['msg1.jsonld', 'msg2.jsonld'] },
      {
        '/aleph/sessions/s1/msg2.jsonld':
          JSON.stringify({ '@graph': [{ '@type': 'ChatMessage', position: 2, speaker: 'agent' }] }),
      },
    );
    const enqueued: string[] = [];
    await drainUnanswered(pod as any, (t) => enqueued.push(t.sessionId));
    expect(enqueued).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run vitest run tests/daemon/drain.test.ts`
Expected: FAIL — cannot find `drainUnanswered` in `../../src/daemon/main`.

- [ ] **Step 3: Write `src/daemon/main.ts`**

```typescript
import { readFileSync } from 'node:fs';
import { PodClient } from '../lib/pod';
import { loadConfig } from './config';
import { ShaclValidator } from './shacl';
import { SparqlEngine } from './mcp/sparql';
import { routeEvent, type PodLike } from './router';
import { SessionQueue } from './queue';
import { subscribeContainer } from './subscriber';
import { runAgent } from './runner';
import type { DaemonDeps, Trigger } from './types';

const SESSIONS_PATH = '/aleph/sessions/';

/** List all sessions, route each, and hand every trigger to `enqueueRun`. */
export async function drainUnanswered(
  pod: PodLike,
  enqueueRun: (trigger: Trigger) => void,
): Promise<void> {
  const sessions = await pod.listContainer(SESSIONS_PATH);
  for (const sessionUrl of sessions) {
    const url = sessionUrl.startsWith('http') ? sessionUrl : `${pod.baseUrl}${SESSIONS_PATH}${sessionUrl}`;
    const trigger = await routeEvent(url, pod);
    if (trigger) enqueueRun(trigger);
  }
}

export async function main(): Promise<void> {
  const config = loadConfig();
  const pod = new PodClient(config.podBase);
  const validator = await ShaclValidator.load('vocab/aleph-shapes.ttl');
  const sparql = new SparqlEngine(config.comunicaSources);
  const promptTemplate = readFileSync(config.promptPath, 'utf-8');

  const deps: DaemonDeps = {
    config, pod, validator, sparql,
    renderPrompt: (t) => promptTemplate
      .replaceAll('{{sessionId}}', t.sessionId)
      .replaceAll('{{msgN}}', String(t.msgN)),
  };

  const queue = new SessionQueue();
  const enqueueRun = (t: Trigger) => queue.enqueue(t.sessionId, () => runAgent(t, deps));

  console.log(`[daemon] draining unanswered sessions on ${config.podBase}`);
  await drainUnanswered(pod, enqueueRun);

  console.log(`[daemon] subscribing to ${SESSIONS_PATH}`);
  subscribeContainer(config.podBase, SESSIONS_PATH, async (url) => {
    const trigger = await routeEvent(url, pod);
    if (trigger) enqueueRun(trigger);
  }, { onStatus: (s) => console.log(`[daemon] ws ${s}`) });
}

if (import.meta.main) {
  main().catch((e) => {
    console.error('[daemon] fatal:', e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run vitest run tests/daemon/drain.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/main.ts tests/daemon/drain.test.ts
git commit -m "feat(daemon): bootstrap, drain-unanswered, wire subscriber→queue→runner"
```

---

## Task 12: Event prompt + config template

**Files:**
- Create: `prompts/agent-event.md`
- Create: `config/agent-daemon.example.env`

- [ ] **Step 1: Write `prompts/agent-event.md`**

```markdown
# Aleph Agent — Single Event

You are the Aleph Wiki agent. A user wrote a new message in session
`{{sessionId}}` at position `{{msgN}}`. Produce exactly one reply and any
supporting knowledge assertions, then stop.

## Tools (all writes go through the `aleph` MCP server)

- `read_pod(path)` — GET a pod resource (turtle). Read `meta.ttl` and the
  `msg{1..N}.jsonld` files of this session before replying.
- `WebSearch` / `WebFetch` — built-in. Use to ground factual claims.
- `mcp__aleph__sparql_query(query, sources?)` — federated SPARQL over the
  configured endpoints. Use for structured facts.
- `mcp__aleph__assert_triples(sessionId, kind, jsonld, provenance)` — persist
  triples with provenance. `kind` is one of:
  - `web` — provenance MUST include `derivedFrom` (the source URL) and
    `searchQuery`.
  - `sparql` — provenance MUST include `query` and `endpoints`.
  - `imagined` — model's own knowledge, no external source.
- `mcp__aleph__write_message(sessionId, msgN, body)` — write your reply as
  `msg{N+1}`. Call this exactly once, last.

## Provenance rule (hard)

Every factual statement in your reply that is not common knowledge MUST first
be persisted via `assert_triples` with the matching `kind` BEFORE you reference
it in the reply. Do not emit free-hand triples without an assertion wrapper.
If a claim is your own synthesis, use `kind: "imagined"`.

## Reply style

- Read the session context first (`read_pod`).
- Plain text in `body` — no markdown, no greetings.
- Short: at most ~3 sentences, one idea.
- Name at least one concept that already exists in the pod when it touches the
  user's turn (anchor to prior knowledge). Use the exact `prefLabel`.
- If the user turn is declarative (no question mark), you may end with one
  precise follow-up question. If they asked a question, answer it — no forced
  counter-question.

## Sequence

1. `read_pod` meta + msgs of session `{{sessionId}}`.
2. Research as needed (`WebSearch`/`WebFetch`/`sparql_query`).
3. `assert_triples` for each grounded claim (one call per source).
4. `write_message(sessionId="{{sessionId}}", msgN={{msgN}}, body=...)`.
5. Stop.
```

- [ ] **Step 2: Write `config/agent-daemon.example.env`**

```bash
# Aleph agent-daemon configuration
POD_BASE=http://localhost:3000
# Comma-separated SPARQL endpoints for federated sparql_query (optional).
COMUNICA_SOURCES=https://dbpedia.org/sparql,https://query.wikidata.org/sparql
# Path to the per-event prompt (default shown).
PROMPT_PATH=prompts/agent-event.md
# Optional model override (defaults to the SDK/CLI default).
# AGENT_MODEL=claude-opus-4-8
#
# Auth: NONE required when the `claude` CLI is logged in (Claude Max
# subscription). The SDK spawns the logged-in binary. Verified 2026-05-28.
```

- [ ] **Step 3: Commit**

```bash
git add prompts/agent-event.md config/agent-daemon.example.env
git commit -m "feat(daemon): per-event prompt and config template"
```

---

## Task 13: Process-compose wiring + full test/typecheck gate

**Files:**
- Modify: `process-compose.yaml`

- [ ] **Step 1: Add the `agent-daemon` service to `process-compose.yaml`**

Append under `processes:`:
```yaml
  agent-daemon:
    command: bun run src/daemon/main.ts
    depends_on:
      seed:
        condition: process_completed_successfully
    environment:
      - POD_BASE=http://localhost:3000
      - COMUNICA_SOURCES=https://dbpedia.org/sparql,https://query.wikidata.org/sparql
```

> The daemon authenticates via the logged-in `claude` CLI, which must be on
> `PATH` in the process-compose environment (it is, in the nix devshell). No
> API key env var is set.

- [ ] **Step 2: Run the full daemon test suite**

Run: `bun run vitest run tests/daemon/`
Expected: PASS — all unit tests across config, shacl, templates, router, queue, subscriber, sparql, mcp-server, runner, drain.

- [ ] **Step 3: Run the whole suite + typecheck to confirm no regressions**

Run: `bun run test`
Expected: PASS — existing `pod`, `seed`, `ttl`, `smoke` tests plus all new daemon tests.

Run: `bun run typecheck`
Expected: no errors. (`vue-tsc --noEmit` compiles the whole project including `src/daemon/`.) If `vue-tsc` flags the daemon's Node globals, ensure `src/daemon` is covered by a tsconfig that includes Node libs/types; add `@types/node` as a dev dep and reference it if needed.

- [ ] **Step 4: Commit**

```bash
git add process-compose.yaml
git commit -m "feat(daemon): add agent-daemon service to process-compose"
```

---

## Task 14: End-to-end integration test (MockSdk + in-process JSS)

**Files:**
- Create: `tests/daemon/integration/e2e.test.ts`

A focused integration test: stand up a real `PodClient` against a tiny in-memory HTTP stub that records PUTs and serves container/message GETs (no real JSS dependency, keeping CI hermetic). Drive `runAgent` with a MockSdk that performs a realistic tool sequence (`read_pod` → `assert_triples(web)` → `write_message`). Assert the reply file and the assertion file land at the expected paths and pass SHACL.

- [ ] **Step 1: Write the integration test `tests/daemon/integration/e2e.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { runAgent } from '../../../src/daemon/runner';
import { ShaclValidator } from '../../../src/daemon/shacl';
import type { DaemonDeps } from '../../../src/daemon/types';

let validator: ShaclValidator;
beforeAll(async () => { validator = await ShaclValidator.load('vocab/aleph-shapes.ttl'); });

/** In-memory pod recording writes and serving a seeded user msg. */
function memPod() {
  const store = new Map<string, string>();
  store.set('/aleph/sessions/s_abc/msg1.jsonld',
    JSON.stringify({ '@graph': [{ '@type': 'ChatMessage', position: 1, speaker: 'user', body: 'Was ist Solid?' }] }));
  return {
    store, baseUrl: 'http://localhost:3000',
    async getResource(p: string) { return store.get(p) ?? null; },
    async putResource(p: string, b: string) { store.set(p, b); },
    async listContainer() { return ['msg1.jsonld']; },
  };
}

function deps(pod: ReturnType<typeof memPod>): DaemonDeps {
  return {
    config: { podBase: 'http://localhost:3000', comunicaSources: [], promptPath: 'x' },
    pod: pod as any, validator,
    sparql: { run: async () => ({ bindings: [] }) } as any,
    renderPrompt: () => 'PROMPT',
  };
}

describe('e2e: realistic tool sequence', () => {
  it('writes a SHACL-valid reply and a web assertion', async () => {
    const pod = memPod();
    const mockQuery = async function* (_a: unknown, hooks: { tools: any }) {
      await hooks.tools.read_pod({ path: '/aleph/sessions/s_abc/msg1.jsonld' });
      const a = await hooks.tools.assert_triples({
        sessionId: 's_abc', kind: 'web',
        jsonld: { '@graph': [{ '@id': 'g:Solid', '@type': 'Concept', prefLabel: { en: 'Solid' } }] },
        provenance: { derivedFrom: 'https://solidproject.org', searchQuery: 'what is solid' },
      });
      expect(a).toMatchObject({ ok: true });
      const w = await hooks.tools.write_message({
        sessionId: 's_abc', msgN: 1, body: 'Solid ist eine Spezifikation für dezentrale Daten.',
      });
      expect(w).toMatchObject({ ok: true });
      yield { type: 'result', subtype: 'success' };
    };
    await runAgent({ sessionId: 's_abc', msgN: 1 }, deps(pod), mockQuery as any);

    expect(pod.store.has('/aleph/sessions/s_abc/msg2.jsonld')).toBe(true);
    const assertionKey = [...pod.store.keys()].find((k) => k.startsWith('/aleph/assertions/s_abc/web_'));
    expect(assertionKey).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the integration test, verify it passes**

Run: `bun run vitest run tests/daemon/integration/e2e.test.ts`
Expected: PASS (1 test). Confirms the runner → tools → templates → SHACL → pod chain end to end with a realistic tool sequence.

- [ ] **Step 3: Commit**

```bash
git add tests/daemon/integration/e2e.test.ts
git commit -m "test(daemon): end-to-end reply + assertion integration test"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| WS-Subscriber (`subscriber.ts`, solid-0.1, backoff) | Task 7 |
| Event-Router (filter steps 1–5) | Task 5 |
| Session-Queue (per-session FIFO, parallel cross-session) | Task 6 |
| Agent-Runner (`query()`, allowedTools, permissionMode, timeout, fallback tracking) | Task 10 |
| MCP `sparql_query` (Comunica, 15s timeout, error shape) | Task 8 |
| MCP `read_pod` | Task 9 |
| MCP `write_message` (reply template, SHACL, 412→conflict, messageWritten) | Tasks 4, 9 |
| MCP `assert_triples` (activity header per kind, SHACL, paths, retry cap) | Tasks 4, 9 |
| SHACL engine (`rdf-validate-shacl`, load shapes once, violation report) | Task 3 |
| SHACL constraints (Web→derivedFrom, Sparql→query+endpoints, Imagined→minimal) | Task 2 |
| Reply-Template / Assertion-Template | Task 4 |
| Daemon-Bootstrap + drainUnanswered | Task 11 |
| Config (env vars) | Tasks 1, 12 |
| Process-Compose entry | Task 13 |
| New prompt `prompts/agent-event.md` | Task 12 |
| Fallback-Reply | Task 10 |
| Self-trigger protection | Task 5 (router skips agent-speaker latest) — covered by unit test |
| Tests: Router/Queue/write_message/assert_triples/SHACL/Fallback | Tasks 3,5,6,9,10 |
| Integration: end-to-end reply | Task 14 |

**Deviations from the spec (intentional, documented):**
- `runAgent(trigger, deps)` builds a **per-run** MCP server (spec sketched `runAgent(trigger, mcp)` with a shared server). Per-run is required so `messageWritten`/`shaclFailures`/`sessionId` are isolated; the spec itself says "trackt per Closure", which implies per-run. The long-lived deps (validator, sparql engine, pod) are still built once at startup.
- `write_message` detection uses the per-run `RunContext.messageWritten` flag set by the tool, not stream-scraping of tool-result messages. Simpler and deterministic.
- Integration tests use an in-memory pod stub rather than booting JSS, to keep the suite hermetic. The spec's "JSS in-process or process-compose profile `test`" remains possible as a later, network-gated addition (the bootstrap-drain, self-trigger-loop, and reconnect integration scenarios from the spec are NOT covered here — flagged as follow-up).

**Coverage gaps (explicit follow-ups, not in this plan):**
- Integration scenarios *Bootstrap-Drain*, *Self-Trigger-Loop counter*, and *Reconnect* against a live JSS (spec "Integration-Tests"). The unit tests cover the underlying logic; the live-JSS harness is deferred.
- Frontend reader for `/aleph/assertions/` — explicitly out of scope per spec.
- Migration of old `extend{N}.jsonld` files — explicitly out of scope per spec.

**Placeholder scan:** none — every code step contains complete, runnable code.

**Type consistency:** `Trigger`, `Config`, `DaemonDeps`, `RunContext` defined once in `types.ts`; `BuiltDoc`/`AssertionKind` in `templates.ts`; `PodLike` in `router.ts` (re-used by `main.ts`); `ToolDeps` in `mcp/server.ts`. `makeTools` return shape (`read_pod`/`sparql_query`/`write_message`/`assert_triples`) is consumed identically by `createAlephServer`, the runner's fallback, and the tests.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-28-agent-daemon.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session via executing-plans, batch execution with checkpoints.

Which approach?
