# Aleph Chat Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM-Chat-Interaktion in Aleph Wiki über lokalen JSS-pod. Claude Code beobachtet pod-changes via eingebauten MCP-server, schreibt agent-replies zurück. Stack via `nix run .#dev` reproduzierbar, daten unter `$XDG_DATA_HOME/aleph-wiki`.

**Architecture:** Vue UI und Claude Code sind beide reine Clients eines lokalen JavaScript Solid Server (`jss --mcp`). UI macht HTTP PUT für user-msgs, CC reagiert via MCP `subscribe` SSE stream und schreibt agent-replies via MCP `write_resource`. Append-only per-message resources mit named-graph PROV-O provenance.

**Tech Stack:** Vue 3, oxigraph (quad-store), JSS v0.0.200+, Claude Code, process-compose, nix flake, bun (for scripts/tests), vitest.

**Spec:** `docs/superpowers/specs/2026-05-26-aleph-chat-stack-design.md`

---

## File Structure

**New files:**
- `vitest.config.ts` — test runner config
- `src/lib/pod.ts` — JSS HTTP client + WS subscribe
- `src/lib/ttl.ts` — TTL template renderers (session.meta, chat-message)
- `src/components/SessionStartButton.vue` — "Neue Sitzung" trigger
- `src/components/ChatInput.vue` — live chat input replacing static mock
- `src/components/StatusBanner.vue` — pod-online / offline / reconnect indicator
- `scripts/seed-pod.ts` — bootstrap pod from demo-ttl
- `prompts/agent-loop.md` — CC initial loop prompt
- `.mcp.json` — CC MCP server registration
- `flake.nix` — package + apps (existing flake updated)
- `process-compose.yaml` — orchestrates vite + jss
- `scripts/chat-launcher.sh` — `.#chat` entrypoint
- Tests: `tests/pod.test.ts`, `tests/ttl.test.ts`, `tests/seed.test.ts`

**Modified files:**
- `vocab/aleph.ttl` — add `aleph:Edit`, `aleph:Snapshot`, `aleph:lastCanonicalizedAt`, `aleph:canonicalView`, `aleph:supersedes`, `aleph:editKind`, `aleph:includesEdits`
- `vocab/aleph-shapes.ttl` — SHACL shapes for `aleph:Edit`
- `src/lib/rdf.ts` — replace build-time import with pod-fetch + quad-store loading
- `src/lib/queries.ts` — minor (use Store.query unchanged, but verify quad-store compat)
- `src/components/AlephConsole.vue` — wire `ChatInput`, replace mocked PUT-cursor
- `src/components/AlephChrome.vue` — mount `SessionStartButton`
- `src/components/AlephApp.vue` — mount `StatusBanner`
- `package.json` — add vitest, test scripts

**Removed:**
- `src/lib/rdf.ts`'s `DEMO_TTL_RAW` build-time export (kept conceptually as fallback for tests only)

---

## Task 1: Test infrastructure setup

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add vitest dev-dep**

```bash
bun add -d vitest @vitest/ui happy-dom
```

- [ ] **Step 2: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

In `package.json` `"scripts"` object add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Smoke test**

`tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run**

```bash
bun run test
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/smoke.test.ts package.json bun.lock
git commit -m "chore(test): vitest setup with happy-dom"
```

---

## Task 2: Vocab + SHACL extensions

**Files:**
- Modify: `vocab/aleph.ttl`
- Modify: `vocab/aleph-shapes.ttl`

- [ ] **Step 1: Append new classes/predicates to `vocab/aleph.ttl`**

Append at end of file:
```turtle
#################################################################
# Edit + Snapshot (provenance for append-only edit log)
#################################################################

aleph:Edit a owl:Class ; rdfs:subClassOf prov:Activity ;
    rdfs:label "Edit"@en ;
    rdfs:comment "A single write to the pod that produced one or more triples in this resource graph."@en .

aleph:editKind a owl:DatatypeProperty ;
    rdfs:domain aleph:Edit ; rdfs:range xsd:string ;
    rdfs:comment "create | amend | retract"@en .

aleph:supersedes a owl:ObjectProperty ;
    rdfs:domain aleph:Edit ; rdfs:range aleph:Edit ;
    rdfs:comment "This edit replaces (logically) the target edit."@en .

aleph:Snapshot a owl:Class ; rdfs:subClassOf prov:Entity ;
    rdfs:label "Canonical session snapshot"@en .

aleph:includesEdits a owl:ObjectProperty ;
    rdfs:domain aleph:Snapshot ; rdfs:range rdf:List .

aleph:lastCanonicalizedAt a owl:DatatypeProperty ;
    rdfs:domain aleph:AlephSession ; rdfs:range xsd:dateTime .

aleph:canonicalView a owl:ObjectProperty ;
    rdfs:domain aleph:AlephSession ; rdfs:range aleph:Snapshot .
```

- [ ] **Step 2: Add SHACL shape for `aleph:Edit` in `vocab/aleph-shapes.ttl`**

Append at end of file:
```turtle
#################################################################
# EditShape — every Edit names its session + time + kind
#################################################################
aleph:EditShape a sh:NodeShape ;
    sh:targetClass aleph:Edit ;
    rdfs:label "Edit Shape"@en ;

    sh:property [
        sh:path prov:wasGeneratedBy ;
        sh:minCount 1 ; sh:maxCount 1 ;
        sh:class aleph:AlephSession ;
        sh:severity sh:Violation ] ;

    sh:property [
        sh:path prov:generatedAtTime ;
        sh:minCount 1 ; sh:maxCount 1 ;
        sh:datatype xsd:dateTime ;
        sh:severity sh:Violation ] ;

    sh:property [
        sh:path aleph:editKind ;
        sh:minCount 1 ; sh:maxCount 1 ;
        sh:in ( "create" "amend" "retract" ) ;
        sh:severity sh:Violation ] .
```

- [ ] **Step 3: Verify TTL parses**

```bash
bun --eval "import('n3').then(async(n3)=>{const p=new n3.default.Parser();const t=p.parse(await Bun.file('vocab/aleph.ttl').text());console.log(t.length,'triples')})" 2>&1 || true
```

Skip if n3 not installed. Alternative: load in oxigraph in next task.

- [ ] **Step 4: Commit**

```bash
git add vocab/aleph.ttl vocab/aleph-shapes.ttl
git commit -m "feat(vocab): add aleph:Edit + aleph:Snapshot for provenance"
```

---

## Task 3: TTL template renderer (`src/lib/ttl.ts`)

**Files:**
- Create: `src/lib/ttl.ts`
- Create: `tests/ttl.test.ts`

- [ ] **Step 1: Write failing tests for `renderChatMessage`**

`tests/ttl.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { renderChatMessage, renderSessionMeta, renderEditMeta } from '../src/lib/ttl';

describe('renderChatMessage', () => {
  it('renders a user message with provenance', () => {
    const ttl = renderChatMessage({
      sessionId: 'Session_001',
      position: 3,
      speaker: 'user',
      body: 'what is Nash equilibrium?',
      generatedAt: '2026-05-26T14:23:01Z',
    });
    expect(ttl).toContain('a aleph:ChatMessage');
    expect(ttl).toContain('aleph:speaker "user"');
    expect(ttl).toContain('aleph:position 3');
    expect(ttl).toContain('aleph:body "what is Nash equilibrium?"');
    expect(ttl).toContain('prov:wasGeneratedBy :Session_001');
    expect(ttl).toContain('"2026-05-26T14:23:01Z"^^xsd:dateTime');
    expect(ttl).toContain('a aleph:Edit');
    expect(ttl).toContain('aleph:editKind "create"');
  });

  it('escapes quotes and backslashes in body', () => {
    const ttl = renderChatMessage({
      sessionId: 'S', position: 1, speaker: 'user',
      body: 'he said "hi" and \\ then left', generatedAt: '2026-05-26T00:00:00Z',
    });
    expect(ttl).toContain('"he said \\"hi\\" and \\\\ then left"');
  });

  it('includes optional hint', () => {
    const ttl = renderChatMessage({
      sessionId: 'S', position: 2, speaker: 'agent',
      body: 'idea', hint: 'suggestion', generatedAt: '2026-05-26T00:00:00Z',
    });
    expect(ttl).toContain('aleph:hint "suggestion"');
  });
});

describe('renderSessionMeta', () => {
  it('renders session meta with start time', () => {
    const ttl = renderSessionMeta({
      sessionId: 'Session_042',
      startedAt: '2026-05-26T14:00:00Z',
      attributedTo: 'Toph',
    });
    expect(ttl).toContain(':Session_042 a aleph:AlephSession');
    expect(ttl).toContain('prov:startedAtTime "2026-05-26T14:00:00Z"^^xsd:dateTime');
    expect(ttl).toContain('prov:wasAttributedTo :Toph');
  });
});

describe('renderEditMeta', () => {
  it('renders self-described edit block', () => {
    const ttl = renderEditMeta({
      sessionId: 'Session_001',
      at: '2026-05-26T14:00:00Z',
      kind: 'create',
      attributedTo: 'Toph',
    });
    expect(ttl).toContain('<> a aleph:Edit');
    expect(ttl).toContain('prov:wasGeneratedBy :Session_001');
    expect(ttl).toContain('aleph:editKind "create"');
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
bun run test ttl
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/ttl.ts`**

```typescript
const PREFIX_HEADER = `@prefix : <https://aleph.wiki/g/> .
@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`;

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export interface EditMeta {
  sessionId: string;
  at: string;
  kind: 'create' | 'amend' | 'retract';
  attributedTo?: string;
}

export function renderEditMeta(m: EditMeta): string {
  const attr = m.attributedTo ? ` ;\n   prov:wasAttributedTo :${m.attributedTo}` : '';
  return `<> a aleph:Edit ;
   prov:wasGeneratedBy :${m.sessionId} ;
   prov:generatedAtTime "${m.at}"^^xsd:dateTime ;
   aleph:editKind "${m.kind}"${attr} .`;
}

export interface ChatMessageInput {
  sessionId: string;
  position: number;
  speaker: 'user' | 'agent';
  body: string;
  hint?: string;
  generatedAt: string;
  attributedTo?: string;
}

export function renderChatMessage(m: ChatMessageInput): string {
  const id = `:${m.sessionId}_msg${m.position}`;
  const hint = m.hint ? ` ;\n    aleph:hint "${esc(m.hint)}"` : '';
  const edit = renderEditMeta({
    sessionId: m.sessionId, at: m.generatedAt, kind: 'create',
    attributedTo: m.attributedTo,
  });
  return `${PREFIX_HEADER}
${edit}

${id} a aleph:ChatMessage ;
    aleph:position ${m.position} ;
    aleph:speaker "${m.speaker}" ;
    aleph:body "${esc(m.body)}"${hint} ;
    prov:wasGeneratedBy :${m.sessionId} ;
    prov:generatedAtTime "${m.generatedAt}"^^xsd:dateTime .
`;
}

export interface SessionMetaInput {
  sessionId: string;
  startedAt: string;
  attributedTo?: string;
  agent?: string;
  focus?: string;
}

export function renderSessionMeta(m: SessionMetaInput): string {
  const attr = m.attributedTo ? ` ;\n    prov:wasAttributedTo :${m.attributedTo}` : '';
  const focus = m.focus ? ` ;\n    aleph:focus "${esc(m.focus)}"` : '';
  const edit = renderEditMeta({
    sessionId: m.sessionId, at: m.startedAt, kind: 'create',
    attributedTo: m.attributedTo,
  });
  return `${PREFIX_HEADER}
${edit}

:${m.sessionId} a aleph:AlephSession ;
    prov:startedAtTime "${m.startedAt}"^^xsd:dateTime${attr}${focus} .
`;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
bun run test ttl
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ttl.ts tests/ttl.test.ts
git commit -m "feat(ttl): template renderers for chat-message + session-meta"
```

---

## Task 4: pod.ts — HTTP client basics

**Files:**
- Create: `src/lib/pod.ts`
- Create: `tests/pod.test.ts`

- [ ] **Step 1: Write failing test for `putResource`**

`tests/pod.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PodClient } from '../src/lib/pod';

describe('PodClient.putResource', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
  });

  it('PUTs ttl to absolute pod URL with correct headers', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 201 }));
    const c = new PodClient('http://localhost:3000');
    await c.putResource('/aleph/sessions/Session_1/msg1.ttl', ':x a :Y .', { ifNoneMatch: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/aleph/sessions/Session_1/msg1.ttl');
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('text/turtle');
    expect(init.headers['If-None-Match']).toBe('*');
    expect(init.body).toBe(':x a :Y .');
  });

  it('throws on 412 conflict', async () => {
    fetchMock.mockResolvedValueOnce(new Response('conflict', { status: 412 }));
    const c = new PodClient('http://localhost:3000');
    await expect(c.putResource('/x.ttl', '', { ifNoneMatch: true }))
      .rejects.toThrow(/412/);
  });

  it('throws on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad', { status: 400 }));
    const c = new PodClient('http://localhost:3000');
    await expect(c.putResource('/x.ttl', '')).rejects.toThrow(/400/);
  });
});

describe('PodClient.getResource', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
  });

  it('GETs and returns text', async () => {
    fetchMock.mockResolvedValueOnce(new Response(':x a :Y .', {
      status: 200, headers: { 'Content-Type': 'text/turtle' },
    }));
    const c = new PodClient('http://localhost:3000');
    const txt = await c.getResource('/x.ttl');
    expect(txt).toBe(':x a :Y .');
  });

  it('returns null on 404', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    const c = new PodClient('http://localhost:3000');
    expect(await c.getResource('/missing.ttl')).toBeNull();
  });
});

describe('PodClient.listContainer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
  });

  it('parses ldp:contains URIs', async () => {
    fetchMock.mockResolvedValueOnce(new Response(`
      @prefix ldp: <http://www.w3.org/ns/ldp#> .
      <> a ldp:BasicContainer ;
         ldp:contains <msg1.ttl>, <msg2.ttl> .
    `, { status: 200, headers: { 'Content-Type': 'text/turtle' } }));
    const c = new PodClient('http://localhost:3000');
    const paths = await c.listContainer('/aleph/sessions/Session_1/');
    expect(paths.sort()).toEqual(['msg1.ttl', 'msg2.ttl']);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
bun run test pod
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal `src/lib/pod.ts`**

```typescript
export interface PutOptions {
  ifNoneMatch?: boolean;
  contentType?: string;
}

export class PodClient {
  constructor(public baseUrl: string) {}

  private url(path: string): string {
    return this.baseUrl.replace(/\/$/, '') + path;
  }

  async putResource(path: string, body: string, opts: PutOptions = {}): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': opts.contentType ?? 'text/turtle',
    };
    if (opts.ifNoneMatch) headers['If-None-Match'] = '*';
    const res = await fetch(this.url(path), { method: 'PUT', headers, body });
    if (!res.ok) {
      throw new Error(`PUT ${path} → ${res.status}`);
    }
  }

  async getResource(path: string): Promise<string | null> {
    const res = await fetch(this.url(path), {
      headers: { Accept: 'text/turtle' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.text();
  }

  async listContainer(path: string): Promise<string[]> {
    const ttl = await this.getResource(path);
    if (!ttl) return [];
    // Parse ldp:contains URIs. Cheap regex pass — enough for JSS output.
    const matches = ttl.matchAll(/ldp:contains\s+([^.]+?)\s*[.;]/g);
    const out: string[] = [];
    for (const m of matches) {
      for (const ref of m[1].split(',')) {
        const trimmed = ref.trim();
        const angle = trimmed.match(/^<([^>]+)>$/);
        if (angle) out.push(angle[1]);
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Run, verify pass**

```bash
bun run test pod
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pod.ts tests/pod.test.ts
git commit -m "feat(pod): HTTP client for JSS (PUT/GET/list)"
```

---

## Task 5: pod.ts — WebSocket subscribe + reconnect

**Files:**
- Modify: `src/lib/pod.ts`
- Modify: `tests/pod.test.ts`

- [ ] **Step 1: Append failing tests for WS subscribe**

Append to `tests/pod.test.ts`:
```typescript
import { vi as v } from 'vitest';

describe('PodClient.subscribe', () => {
  it('opens WS, sends sub message, fires onChange on event', async () => {
    const onMessageHandlers: ((e: { data: string }) => void)[] = [];
    const onOpenHandlers: (() => void)[] = [];
    const sentMessages: string[] = [];

    class MockWS {
      static OPEN = 1;
      readyState = 0;
      constructor(public url: string) {
        setTimeout(() => {
          this.readyState = 1;
          onOpenHandlers.forEach((h) => h());
        }, 0);
      }
      send(msg: string) { sentMessages.push(msg); }
      addEventListener(ev: string, cb: any) {
        if (ev === 'message') onMessageHandlers.push(cb);
        if (ev === 'open') onOpenHandlers.push(cb);
      }
      close() {}
    }
    (globalThis as any).WebSocket = MockWS;

    const c = new PodClient('http://localhost:3000');
    const events: string[] = [];
    c.subscribe('/aleph/sessions/', (ev) => events.push(ev.path));

    await new Promise((r) => setTimeout(r, 5));
    expect(sentMessages[0]).toMatch(/^sub /);
    expect(sentMessages[0]).toContain('http://localhost:3000/aleph/sessions/');

    onMessageHandlers[0]({
      data: 'pub http://localhost:3000/aleph/sessions/Session_1/msg1.ttl',
    });
    expect(events).toEqual(['/aleph/sessions/Session_1/msg1.ttl']);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
bun run test pod
```

Expected: FAIL — `subscribe` undefined.

- [ ] **Step 3: Add `subscribe` to `src/lib/pod.ts`**

Append to `PodClient` class (inside braces):
```typescript
  subscribe(path: string, onChange: (ev: { path: string; kind: 'created'|'updated'|'deleted' }) => void): () => void {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/';
    let ws: WebSocket | null = null;
    let closed = false;
    let backoff = 1000;

    const open = () => {
      if (closed) return;
      ws = new WebSocket(wsUrl);
      ws.addEventListener('open', () => {
        backoff = 1000;
        ws!.send(`sub ${this.url(path)}`);
      });
      ws.addEventListener('message', (e: any) => {
        const data: string = typeof e.data === 'string' ? e.data : '';
        if (!data.startsWith('pub ')) return;
        const fullUrl = data.slice(4).trim();
        const localPath = fullUrl.replace(this.baseUrl.replace(/\/$/, ''), '');
        onChange({ path: localPath, kind: 'updated' });
      });
      ws.addEventListener('close', () => {
        if (closed) return;
        setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, 30000);
      });
      ws.addEventListener('error', () => {
        ws?.close();
      });
    };

    open();
    return () => { closed = true; ws?.close(); };
  }
```

- [ ] **Step 4: Run, verify pass**

```bash
bun run test pod
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pod.ts tests/pod.test.ts
git commit -m "feat(pod): solid-0.1 WS subscribe with exponential backoff"
```

---

## Task 6: `src/lib/rdf.ts` umbau — runtime pod-load + quad-store

**Files:**
- Modify: `src/lib/rdf.ts`

- [ ] **Step 1: Replace contents of `src/lib/rdf.ts`**

```typescript
import init, { Store, NamedNode, type Term } from 'oxigraph/web.js';
import { PodClient } from './pod';

export const PREFIXES: Record<string, string> = {
  '': 'https://aleph.wiki/g/',
  aleph: 'https://vocab.aleph.wiki/',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  prov: 'http://www.w3.org/ns/prov#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  ldp: 'http://www.w3.org/ns/ldp#',
};

export const SPARQL_PREFIX_BLOCK = Object.entries(PREFIXES)
  .map(([pfx, ns]) => `PREFIX ${pfx}: <${ns}>`)
  .join('\n');

export const POD_BASE = (import.meta as any).env?.VITE_POD_BASE ?? 'http://localhost:3000';
export const POD_ROOT = '/aleph/';

let store: Store | null = null;
let ready: Promise<Store> | null = null;
let pod: PodClient | null = null;

export function getPod(): PodClient {
  if (!pod) pod = new PodClient(POD_BASE);
  return pod;
}

async function loadResource(s: Store, podClient: PodClient, path: string): Promise<void> {
  const ttl = await podClient.getResource(path);
  if (!ttl) return;
  const graphIri = podClient.baseUrl.replace(/\/$/, '') + path;
  s.load(ttl, {
    format: 'text/turtle',
    base_iri: graphIri,
    to_graph_name: new NamedNode(graphIri),
  });
}

async function loadContainer(s: Store, podClient: PodClient, path: string): Promise<void> {
  const entries = await podClient.listContainer(path);
  await Promise.all(entries.map(async (entry) => {
    const childPath = path + entry;
    if (entry.endsWith('/')) {
      await loadContainer(s, podClient, childPath);
    } else if (entry.endsWith('.ttl')) {
      await loadResource(s, podClient, childPath);
    }
  }));
}

export function initStore(): Promise<Store> {
  if (ready) return ready;
  ready = (async () => {
    await init();
    const s = new Store();
    const p = getPod();
    try {
      await loadContainer(s, p, POD_ROOT);
    } catch (err) {
      console.warn('pod load failed:', err);
    }
    store = s;
    return s;
  })();
  return ready;
}

export function getStore(): Store {
  if (!store) throw new Error('RDF store not initialised — await initStore() first');
  return store;
}

export async function reloadResource(path: string): Promise<void> {
  const s = getStore();
  const p = getPod();
  const graphIri = p.baseUrl.replace(/\/$/, '') + path;
  // delete graph, re-load
  s.update(`DROP SILENT GRAPH <${graphIri}>`);
  await loadResource(s, p, path);
}

export type Bindings = Map<string, Term>;

export function select(query: string): Bindings[] {
  const q = `${SPARQL_PREFIX_BLOCK}\n${query}`;
  const result = getStore().query(q);
  if (!Array.isArray(result)) {
    throw new Error('select() expects a SELECT query returning bindings');
  }
  return result as Bindings[];
}

export function ask(query: string): boolean {
  const q = `${SPARQL_PREFIX_BLOCK}\n${query}`;
  const result = getStore().query(q);
  if (typeof result !== 'boolean') {
    throw new Error('ask() expects an ASK query');
  }
  return result;
}

export function shrink(iri: string): string {
  for (const [pfx, ns] of Object.entries(PREFIXES)) {
    if (iri.startsWith(ns)) return pfx ? `${pfx}:${iri.slice(ns.length)}` : iri.slice(ns.length);
  }
  return iri;
}

export function localName(iri: string): string {
  const s = iri.lastIndexOf('/');
  const h = iri.lastIndexOf('#');
  return iri.slice(Math.max(s, h) + 1);
}
```

- [ ] **Step 2: Update existing SPARQL queries that need default-graph semantics**

In `src/queries/`, all current queries should still work — oxigraph `SELECT ?s ?p ?o WHERE { ?s ?p ?o }` returns triples from *all* named graphs by default if no `GRAPH` clause. Verify by manual eyeball: queries in `src/queries/*.sparql` use no `FROM` clauses → they will match across named graphs. No change required.

- [ ] **Step 3: Smoke-typecheck**

```bash
bun run typecheck
```

Expected: PASS (or only Vue-template errors unrelated to rdf.ts).

- [ ] **Step 4: Commit**

```bash
git add src/lib/rdf.ts
git commit -m "feat(rdf): runtime pod-fetch + quad-store (named graphs per resource)"
```

---

## Task 7: Bootstrap script `scripts/seed-pod.ts`

**Files:**
- Create: `scripts/seed-pod.ts`
- Create: `tests/seed.test.ts`

- [ ] **Step 1: Write failing test for split logic**

`tests/seed.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { splitGraph } from '../scripts/seed-pod';

const SAMPLE = `
@prefix : <https://aleph.wiki/g/> .
@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:GameTheory a aleph:Concept ;
    aleph:perceivedImportance 0.9 ;
    prov:wasGeneratedBy :Session_001 .

:NashEquilibrium a aleph:Concept ;
    aleph:requires :GameTheory ;
    prov:wasGeneratedBy :Session_001 .

:Session_001 a aleph:AlephSession ;
    prov:startedAtTime "2026-01-01T00:00:00Z"^^xsd:dateTime .
`;

describe('splitGraph', () => {
  it('emits one resource per Concept', () => {
    const result = splitGraph(SAMPLE);
    const paths = Object.keys(result).sort();
    expect(paths).toContain('/aleph/concepts/GameTheory.ttl');
    expect(paths).toContain('/aleph/concepts/NashEquilibrium.ttl');
    expect(paths).toContain('/aleph/sessions/Session_001/.meta.ttl');
    expect(paths).toContain('/aleph/index.ttl');
  });

  it('each concept resource has the concept triples', () => {
    const result = splitGraph(SAMPLE);
    const gt = result['/aleph/concepts/GameTheory.ttl'];
    expect(gt).toContain(':GameTheory a aleph:Concept');
    expect(gt).toContain('aleph:perceivedImportance 0.9');
  });

  it('each emitted resource carries an aleph:Edit meta block', () => {
    const result = splitGraph(SAMPLE);
    for (const ttl of Object.values(result)) {
      expect(ttl).toContain('<> a aleph:Edit');
      expect(ttl).toContain('prov:wasGeneratedBy :BootstrapSeed');
    }
  });
});
```

- [ ] **Step 2: Run, fail**

```bash
bun run test seed
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scripts/seed-pod.ts`**

```typescript
#!/usr/bin/env bun
import { Parser, Writer, DataFactory } from 'n3';
import { readFileSync } from 'node:fs';
import { PodClient } from '../src/lib/pod';

const { namedNode } = DataFactory;

const ALEPH = 'https://vocab.aleph.wiki/';
const G = 'https://aleph.wiki/g/';

const SEED_SESSION = `${G}BootstrapSeed`;
const NOW = '2026-05-26T00:00:00Z';

function editMeta(): string {
  return `<> a aleph:Edit ;
   prov:wasGeneratedBy :BootstrapSeed ;
   prov:generatedAtTime "${NOW}"^^xsd:dateTime ;
   aleph:editKind "create" .`;
}

const PREFIX_HEADER = `@prefix : <${G}> .
@prefix aleph: <${ALEPH}> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
`;

function localName(iri: string): string {
  const s = iri.lastIndexOf('/');
  const h = iri.lastIndexOf('#');
  return iri.slice(Math.max(s, h) + 1);
}

function isConceptType(t: string): boolean {
  return t === `${ALEPH}Concept` || t === `${ALEPH}Person`
      || t === `${ALEPH}Event`   || t === `${ALEPH}ImportantConcept`;
}

export function splitGraph(ttl: string): Record<string, string> {
  const parser = new Parser();
  const quads = parser.parse(ttl);

  // Index triples by subject
  const bySubject = new Map<string, typeof quads>();
  for (const q of quads) {
    if (q.subject.termType !== 'NamedNode') continue;
    const arr = bySubject.get(q.subject.value) ?? [];
    arr.push(q);
    bySubject.set(q.subject.value, arr);
  }

  // Classify subjects
  const concepts: string[] = [];
  const sessions: string[] = [];
  const orphans: string[] = [];

  for (const [subj, triples] of bySubject) {
    const types = triples
      .filter((q) => q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
      .map((q) => q.object.value);
    if (types.some(isConceptType)) {
      concepts.push(subj);
    } else if (types.includes(`${ALEPH}AlephSession`)) {
      sessions.push(subj);
    } else {
      orphans.push(subj);
    }
  }

  const out: Record<string, string> = {};

  const emit = (path: string, triples: typeof quads) => {
    const writer = new Writer({ prefixes: {
      '': G,
      aleph: ALEPH,
      prov: 'http://www.w3.org/ns/prov#',
      xsd: 'http://www.w3.org/2001/XMLSchema#',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      skos: 'http://www.w3.org/2004/02/skos/core#',
      foaf: 'http://xmlns.com/foaf/0.1/',
    } });
    for (const q of triples) writer.addQuad(q);
    let body = '';
    writer.end((_err, result) => { body = result; });
    return `${editMeta()}\n\n${body}`;
  };

  for (const s of concepts) {
    out[`/aleph/concepts/${localName(s)}.ttl`] = emit(
      `/aleph/concepts/${localName(s)}.ttl`,
      bySubject.get(s)!,
    );
  }

  for (const s of sessions) {
    out[`/aleph/sessions/${localName(s)}/.meta.ttl`] = emit(
      `/aleph/sessions/${localName(s)}/.meta.ttl`,
      bySubject.get(s)!,
    );
  }

  if (orphans.length) {
    const orphanQuads = orphans.flatMap((s) => bySubject.get(s)!);
    out['/aleph/index.ttl'] = emit('/aleph/index.ttl', orphanQuads);
  } else {
    // Always emit index.ttl marker so idempotency check works
    out['/aleph/index.ttl'] = `${PREFIX_HEADER}\n${editMeta()}\n\n:AlephRoot a aleph:Index .\n`;
  }

  return out;
}

async function main() {
  const podBase = process.env.POD_BASE ?? 'http://localhost:3000';
  const seedFile = process.argv[2] ?? 'data/demo-game-theory.ttl';

  const client = new PodClient(podBase);
  const existing = await client.getResource('/aleph/index.ttl');
  if (existing) {
    console.log('pod already seeded (/aleph/index.ttl exists). skipping.');
    return;
  }

  const ttl = readFileSync(seedFile, 'utf-8');
  const resources = splitGraph(ttl);

  for (const [path, body] of Object.entries(resources)) {
    await client.putResource(path, body);
    console.log(`PUT ${path} (${body.length} bytes)`);
  }
  console.log(`seeded ${Object.keys(resources).length} resources.`);
}

if (import.meta.main) main();
```

- [ ] **Step 4: Add n3 dep**

```bash
bun add n3
bun add -d @types/n3
```

- [ ] **Step 5: Run tests**

```bash
bun run test seed
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-pod.ts tests/seed.test.ts package.json bun.lock
git commit -m "feat(seed): bootstrap script splits demo-ttl into per-concept resources"
```

---

## Task 8: UI — `SessionStartButton.vue`

**Files:**
- Create: `src/components/SessionStartButton.vue`
- Modify: `src/components/AlephChrome.vue`

- [ ] **Step 1: Create `SessionStartButton.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { getPod, reloadResource, select, render } from '../lib/rdf';
import type { Palette } from '../palette';
import { renderSessionMeta } from '../lib/ttl';

defineProps<{ palette: Palette; fontMono: string }>();

const busy = ref(false);
const err = ref<string | null>(null);

function nextSessionId(): string {
  const rows = select(`
    SELECT (COUNT(?s) AS ?n) WHERE {
      ?s a aleph:AlephSession .
    }`);
  const n = Number(rows[0]?.get('n')?.value ?? 0);
  return `Session_${String(n + 1).padStart(3, '0')}`;
}

async function startSession() {
  busy.value = true;
  err.value = null;
  try {
    const sessionId = nextSessionId();
    const now = new Date().toISOString();
    const ttl = renderSessionMeta({
      sessionId,
      startedAt: now,
      attributedTo: 'Toph',
    });
    const path = `/aleph/sessions/${sessionId}/.meta.ttl`;
    await getPod().putResource(path, ttl, { ifNoneMatch: true });
    await reloadResource(path);
  } catch (e) {
    err.value = String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button
    :disabled="busy"
    @click="startSession"
    :style="{
      fontFamily: fontMono,
      fontSize: '11px',
      padding: '4px 10px',
      background: palette.fg,
      color: palette.bg,
      border: 'none',
      borderRadius: '3px',
      cursor: busy ? 'wait' : 'pointer',
      letterSpacing: '0.8px',
    }"
  >{{ busy ? '...' : 'neue sitzung' }}</button>
  <span v-if="err" :style="{ color: palette.warn, fontSize: '10px', marginLeft: '6px' }">{{ err }}</span>
</template>
```

- [ ] **Step 2: Wire into `AlephChrome.vue`**

In `src/components/AlephChrome.vue`, add import in `<script setup>`:
```typescript
import SessionStartButton from './SessionStartButton.vue';
```

Then in the `<template>`, after the breadcrumb section (before any trailing `</div>` of the chrome bar), insert:
```vue
<div style="margin-left: auto; display: flex; align-items: center; gap: 8px">
  <SessionStartButton :palette="palette" :font-mono="fontMono" />
</div>
```

(If a `margin-left: auto` container already exists, just add `<SessionStartButton>` to it.)

- [ ] **Step 3: Manual check**

```bash
bun run dev
```

Expected: vite starts, UI renders, "neue sitzung" button visible in top bar. Click will fail until JSS is running — acceptable.

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionStartButton.vue src/components/AlephChrome.vue
git commit -m "feat(ui): neue sitzung button → PUT session.meta to pod"
```

---

## Task 9: UI — `ChatInput.vue` (live)

**Files:**
- Create: `src/components/ChatInput.vue`
- Modify: `src/components/AlephConsole.vue`

- [ ] **Step 1: Create `ChatInput.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { getPod, reloadResource, select } from '../lib/rdf';
import { renderChatMessage } from '../lib/ttl';
import type { Palette } from '../palette';

const props = defineProps<{
  palette: Palette;
  fontMono: string;
  sessionId: string | null;
}>();

const text = ref('');
const busy = ref(false);
const err = ref<string | null>(null);

function nextPosition(sessionId: string): number {
  const rows = select(`
    SELECT (COUNT(?m) AS ?n) WHERE {
      ?m a aleph:ChatMessage ;
         prov:wasGeneratedBy :${sessionId} .
    }`);
  return Number(rows[0]?.get('n')?.value ?? 0) + 1;
}

async function submit() {
  if (!props.sessionId || !text.value.trim() || busy.value) return;
  busy.value = true;
  err.value = null;
  const sessionId = props.sessionId;
  const body = text.value.trim();

  let attempt = 0;
  while (attempt < 3) {
    try {
      const position = nextPosition(sessionId);
      const ttl = renderChatMessage({
        sessionId, position, speaker: 'user', body,
        generatedAt: new Date().toISOString(), attributedTo: 'Toph',
      });
      const path = `/aleph/sessions/${sessionId}/msg${position}.ttl`;
      await getPod().putResource(path, ttl, { ifNoneMatch: true });
      await reloadResource(path);
      text.value = '';
      break;
    } catch (e) {
      attempt++;
      if (!String(e).includes('412') || attempt === 3) {
        err.value = String(e);
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  busy.value = false;
}
</script>

<template>
  <div
    :style="{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontFamily: fontMono,
      fontSize: '12px',
    }"
  >
    <span :style="{ color: palette.sepia, fontWeight: 600 }">›</span>
    <input
      v-model="text"
      :disabled="!sessionId || busy"
      @keydown.enter="submit"
      :placeholder="sessionId ? 'message ...' : 'starte eine sitzung'"
      :style="{
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: palette.fg,
        fontFamily: fontMono,
        fontSize: '12px',
      }"
    />
    <span v-if="busy" :style="{ color: palette.mute, fontSize: '10px' }">...</span>
    <span v-if="err" :style="{ color: palette.warn, fontSize: '10px' }">{{ err }}</span>
  </div>
</template>
```

- [ ] **Step 2: Replace mock input in `AlephConsole.vue`**

In `src/components/AlephConsole.vue`'s `<script setup>` add:
```typescript
import ChatInput from './ChatInput.vue';
```

Replace the `<!-- input -->` block (the `<div>` containing `/link InformationTheory --as related` mock) with:
```vue
<!-- input -->
<div
  :style="{
    padding: '12px 16px',
    borderTop: `1px solid ${palette.rule}`,
  }"
>
  <ChatInput
    :palette="palette"
    :font-mono="fontMono"
    :session-id="activeSessionId"
  />
</div>
```

- [ ] **Step 3: Manual smoke**

```bash
bun run dev
```

Expected: chat-input visible, disabled until session exists.

- [ ] **Step 4: Commit**

```bash
git add src/components/ChatInput.vue src/components/AlephConsole.vue
git commit -m "feat(ui): live chat input — PUT user-msg to pod"
```

---

## Task 10: UI — `StatusBanner.vue` + pod-state monitoring

**Files:**
- Create: `src/components/StatusBanner.vue`
- Modify: `src/lib/rdf.ts` — export connection state
- Modify: `src/components/AlephApp.vue` — mount banner + wire WS subscribe

- [ ] **Step 1: Add reactive state to `src/lib/rdf.ts`**

At top of `src/lib/rdf.ts` after imports, add:
```typescript
import { ref } from 'vue';

export type PodStatus = 'connecting' | 'online' | 'offline' | 'reconnecting';
export const podStatus = ref<PodStatus>('connecting');
```

In `initStore()`, after `await loadContainer(...)` succeeds set `podStatus.value = 'online'`; on `catch` set `podStatus.value = 'offline'`.

Add exported helper:
```typescript
export function subscribePodChanges(onChange: (path: string) => void): () => void {
  const p = getPod();
  return p.subscribe(POD_ROOT, async (ev) => {
    podStatus.value = 'online';
    await reloadResource(ev.path);
    onChange(ev.path);
  });
}
```

- [ ] **Step 2: Create `StatusBanner.vue`**

```vue
<script setup lang="ts">
import { podStatus } from '../lib/rdf';
import type { Palette } from '../palette';

defineProps<{ palette: Palette; fontMono: string }>();

const LABEL: Record<string, string> = {
  connecting: 'connecting to pod ...',
  online: 'pod online',
  offline: 'pod offline — start `nix run .#dev`',
  reconnecting: 'reconnecting ...',
};
</script>

<template>
  <div
    v-if="podStatus !== 'online'"
    :style="{
      position: 'absolute',
      top: '46px',
      left: '16px',
      right: '16px',
      padding: '6px 10px',
      background: palette.warn + '22',
      color: palette.warn,
      fontFamily: fontMono,
      fontSize: '11px',
      borderRadius: '3px',
      zIndex: 6,
    }"
  >{{ LABEL[podStatus] }}</div>
</template>
```

- [ ] **Step 3: Mount in `AlephApp.vue`**

In `src/components/AlephApp.vue`, add imports:
```typescript
import StatusBanner from './StatusBanner.vue';
import { subscribePodChanges } from '../lib/rdf';
import { onMounted, onUnmounted } from 'vue';
```

Add hook in `<script setup>`:
```typescript
let unsubscribe: (() => void) | null = null;
onMounted(() => {
  unsubscribe = subscribePodChanges(() => {
    // store re-loaded; computed queries auto-update
  });
});
onUnmounted(() => { unsubscribe?.(); });
```

Add `<StatusBanner :palette="palette" :font-mono="fontMono" />` near root in `<template>` (immediately under outer container).

- [ ] **Step 4: Manual smoke**

```bash
bun run dev
```

Expected: banner "pod offline" visible while no JSS running.

- [ ] **Step 5: Commit**

```bash
git add src/components/StatusBanner.vue src/components/AlephApp.vue src/lib/rdf.ts
git commit -m "feat(ui): pod status banner + WS-driven store reload"
```

---

## Task 11: CC config — `.mcp.json` + `prompts/agent-loop.md`

**Files:**
- Create: `.mcp.json`
- Create: `prompts/agent-loop.md`

- [ ] **Step 1: Create `.mcp.json`**

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

- [ ] **Step 2: Create `prompts/agent-loop.md`**

```markdown
# Aleph Agent Loop

Du bist der Aleph-Wiki-Agent. Der lokale JSS-pod ist über den MCP-server `aleph-pod` erreichbar.

## Loop

1. Rufe Tool `aleph-pod__subscribe` mit `path: "/aleph/sessions/"`. Es blockt bis ein resource-change kommt.
2. Bei event: extrahiere den session-pfad. Rufe `aleph-pod__list_resources` auf `/aleph/sessions/{SessionId}/` um alle msg-files zu sehen.
3. Bestimme die höchste msg-position N und den speaker. Wenn `speaker == "agent"` ODER `msg{N+1}.ttl` existiert: skip (nichts zu tun).
4. Wenn `speaker == "user"` und keine reply: lies den session-kontext (`.meta.ttl` + alle msgs) via `read_resource`, lies relevante `/aleph/concepts/*.ttl` falls referenziert.
5. Komponiere eine reply gemäß `prompts/04-chat-log.md`:
   - IRI `:{SessionId}_msg{N+1}` mit `aleph:position {N+1}`, `aleph:speaker "agent"`, `aleph:body "..."`
   - Top-level meta block: `<> a aleph:Edit ; prov:wasGeneratedBy :{SessionId} ; prov:generatedAtTime "<NOW>"^^xsd:dateTime ; aleph:editKind "create" .`
6. PUT via `aleph-pod__write_resource` an `/aleph/sessions/{SessionId}/msg{N+1}.ttl`.
7. Gehe zurück zu Schritt 1.

## Error handling

- Bei MCP-tool-error: 5 sekunden warten, retry.
- Bei TTL-parse-error (400 vom server): inhalt korrigieren, max 2 retries. Danach kurze fallback-msg "agent error: konnte nicht antworten" als plain agent-msg schreiben.
- Bei 412 (conflict, msg-position bereits belegt): N neu zählen, retry.

## Constraints

- Keine markdown im `aleph:body`. Plain text, escaped (`\"`, `\\`).
- Antworten kurz und auf den punkt — keine begrüßungsphrasen.
- Wenn unsicher: stelle eine rückfrage als reply statt zu raten.

Beginne jetzt mit Schritt 1.
```

- [ ] **Step 3: Commit**

```bash
git add .mcp.json prompts/agent-loop.md
git commit -m "feat(cc): MCP config + agent loop prompt"
```

---

## Task 12: Nix flake — apps + devShell

**Files:**
- Modify: `flake.nix`
- Create: `process-compose.yaml`
- Create: `scripts/chat-launcher.sh`

- [ ] **Step 1: Read existing `flake.nix`**

```bash
cat flake.nix
```

Note inputs and outputs structure — preserve them.

- [ ] **Step 2: Update `flake.nix` outputs**

Replace `flake.nix` contents (preserve existing inputs unless missing):
```nix
{
  description = "Aleph Wiki — Solid-pod chat stack";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        # JSS via npm. If nixpkgs doesn't have v0.0.200+, this falls back
        # to a runtime npx invocation in process-compose.yaml.
        jssRunner = pkgs.writeShellScriptBin "aleph-jss" ''
          set -e
          DATA_DIR="''${XDG_DATA_HOME:-$HOME/.local/share}/aleph-wiki/pod"
          mkdir -p "$DATA_DIR"
          exec ${pkgs.bun}/bin/bunx --bun javascript-solid-server@latest \
            start --mcp --port 3000 --data "$DATA_DIR" --single-user
        '';

        seedRunner = pkgs.writeShellScriptBin "aleph-seed" ''
          set -e
          cd ${self}
          ${pkgs.bun}/bin/bun run scripts/seed-pod.ts
        '';

        chatLauncher = pkgs.writeShellScriptBin "aleph-chat" ''
          set -e
          cd ${self}
          if ! command -v claude >/dev/null 2>&1; then
            echo "claude CLI not in PATH. Install Claude Code first."
            exit 1
          fi
          echo "starting claude with aleph-pod MCP server"
          echo "initial prompt: prompts/agent-loop.md"
          exec claude --append-system-prompt "$(cat prompts/agent-loop.md)"
        '';

        devApp = pkgs.writeShellScriptBin "aleph-dev" ''
          set -e
          cd ${self}
          export PATH="${pkgs.lib.makeBinPath [ pkgs.bun jssRunner seedRunner ]}:$PATH"
          exec ${pkgs.process-compose}/bin/process-compose \
            -f ${self}/process-compose.yaml
        '';
      in {
        apps = {
          dev  = { type = "app"; program = "${devApp}/bin/aleph-dev"; };
          chat = { type = "app"; program = "${chatLauncher}/bin/aleph-chat"; };
          seed = { type = "app"; program = "${seedRunner}/bin/aleph-seed"; };
          default = self.apps.${system}.dev;
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.bun
            pkgs.nodejs_22
            pkgs.process-compose
            jssRunner
            seedRunner
          ];
        };
      });
}
```

- [ ] **Step 3: Create `process-compose.yaml`**

```yaml
version: "0.5"

processes:
  jss:
    command: aleph-jss
    readiness_probe:
      http_get:
        host: localhost
        port: 3000
        path: /
      initial_delay_seconds: 1
      period_seconds: 2
      failure_threshold: 10

  seed:
    command: aleph-seed
    depends_on:
      jss:
        condition: process_healthy
    availability:
      restart: "no"

  vite:
    command: bun run dev
    depends_on:
      seed:
        condition: process_completed_successfully
    environment:
      - VITE_POD_BASE=http://localhost:3000
```

- [ ] **Step 4: Test typecheck of flake**

```bash
nix flake check --no-build 2>&1 | head -30 || true
```

Expected: no syntax errors. Build errors about missing JSS-package OK if nixpkgs lags — the runner uses `bunx`.

- [ ] **Step 5: Commit**

```bash
git add flake.nix process-compose.yaml
git commit -m "feat(nix): apps.dev + apps.chat + devShell for aleph stack"
```

---

## Task 13: Manual smoke gate

**Files:** none (verification only)

- [ ] **Step 1: Clean start**

```bash
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/aleph-wiki"
```

- [ ] **Step 2: Run dev stack**

In terminal A:
```bash
nix run .#dev
```

Expected logs (in process-compose UI):
- `jss` becomes healthy on :3000
- `seed` runs once, prints `seeded N resources`, exits success
- `vite` serves on :5173

- [ ] **Step 3: Open UI**

Open `http://localhost:5173` in browser.

Verify:
- StatusBanner not visible (pod online)
- Demo concepts rendered (orbital view works as before)
- "neue sitzung" button in chrome bar

- [ ] **Step 4: Trigger session**

Click "neue sitzung". Verify:
- No error
- File `$XDG_DATA_HOME/aleph-wiki/pod/aleph/sessions/Session_001/.meta.ttl` exists:
  ```bash
  cat "${XDG_DATA_HOME:-$HOME/.local/share}/aleph-wiki/pod/aleph/sessions/Session_001/.meta.ttl"
  ```
- AlephConsole shows session as active

- [ ] **Step 5: Send user msg**

Type "what is Nash equilibrium" in chat-input, hit Enter. Verify:
- Msg appears in chat panel within 1s
- File `Session_001/msg1.ttl` exists in pod

- [ ] **Step 6: Start CC**

In terminal B:
```bash
nix run .#chat
```

Verify:
- Claude starts
- CC announces using `aleph-pod` MCP tools
- Within ~10s, `Session_001/msg2.ttl` appears in pod with `speaker "agent"`
- UI re-renders to show agent reply

- [ ] **Step 7: Restart resilience**

Kill terminal A (Ctrl-C). UI banner shows "pod offline".
Restart: `nix run .#dev`. Banner clears within reconnect-backoff (≤ 30s). Existing chat history reloads from pod.

- [ ] **Step 8: Pod-wipe regenerates**

Ctrl-C all. Run:
```bash
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/aleph-wiki"
nix run .#dev
```

Verify pod is freshly seeded, demo concepts render.

- [ ] **Step 9: Commit smoke results**

If everything passes, write a short note:
```bash
cat > docs/superpowers/plans/SMOKE-2026-05-26.md <<'EOF'
Smoke test results for aleph-chat-stack on 2026-05-26: PASS.
- nix run .#dev boots clean
- session + msg PUT roundtrip works
- CC reply via MCP works
- restart resilience verified
EOF
git add docs/superpowers/plans/SMOKE-2026-05-26.md
git commit -m "test(smoke): aleph-chat-stack manual gate passed"
```

If any step fails, capture log + open issue. Do not mark plan complete.

---

## Self-review notes

**Spec coverage check:**
- Auth public/single-user → JSS flag in Task 12. ✓
- MCP long-poll trigger → `.mcp.json` + agent-loop prompt in Task 11. ✓
- All data in pod → Task 6 (rdf.ts umbau) + Task 7 (seed). ✓
- Two nix apps → Task 12. ✓
- UI v1 chat only → Tasks 8, 9, 10. ✓
- No bridge → JSS used directly via MCP. ✓
- Provenance via named graphs → Task 6 (quad-store load with `to_graph_name`). ✓
- Per-session canonicalization → Vocab in Task 2, **implementation deferred to v2** (called out in spec).
- Edit log → Vocab in Task 2, edit-meta block emitted by ttl.ts (Task 3), seed-pod.ts (Task 7).

**Open implementation risk acknowledged in plan:**
- JSS v0.0.200+ availability via npm — flake uses `bunx --bun javascript-solid-server@latest`, dodges nixpkgs lag.
- CC MCP HTTP transport — assumed working; if `.mcp.json` `type: "http"` is unsupported, fallback is to add a minimal stdio-bridge (out of scope, would need new task).
- Oxigraph quad-store `to_graph_name` API — verify against `oxigraph/web.js` v0.5.8 docs during Task 6.
