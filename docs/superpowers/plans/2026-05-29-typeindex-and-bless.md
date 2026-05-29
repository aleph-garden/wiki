# TypeIndex Discovery & Canonicalization (Bless) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Solid TypeIndex resolution (rdf:type → container, default `/g/`) and a deterministic bless step that promotes a session's non-invalidated claims into the canonical `/g/` graph — minting/reusing IRIs via slug-lookup, remapping session-scoped IRIs to canonical, merging additively, and recording provenance.

**Architecture:** Pure-ish modules over `PodClient`, parsing/serializing Turtle with `n3`. `typeindex.ts` resolves and bootstraps registrations. `lookup.ts` finds an existing canonical concept by label. `bless.ts` orchestrates: list session claim graphs → drop invalidated → gather session-scoped entities → per entity resolve canonical IRI (reuse via lookup or mint via TypeIndex) → remap + additively merge into the canonical resource → PUT. A thin `scripts/bless.ts` CLI invokes it (UI trigger is Plan 3).

**Tech Stack:** Bun + TypeScript, vitest, `n3` (parse/write Turtle), the existing `src/lib/pod.ts` `PodClient`, `src/daemon/slug.ts`.

**Scope boundary:** Daemon/logic only. NOT in this plan: UI loader/query changes, the bless trigger button, the `/aleph.wiki/` rename, data migration (Plans 3 & 4). Re-bless versioning beyond a `prov:wasGeneratedBy` stamp (full `wasRevisionOf`/`Snapshot` history) is deferred. Conflict policy is additive-union + warn (no interactive resolution yet).

---

## Conventions used across tasks

- **Namespaces:** `V = https://vocab.aleph.wiki/`, `G = https://aleph.wiki/g/`, `SOLID = http://www.w3.org/ns/solid/terms#`, `RDF_TYPE = http://www.w3.org/1999/02/22-rdf-syntax-ns#type`, `PROV = http://www.w3.org/ns/prov#`, `SKOS = http://www.w3.org/2004/02/skos/core#`.
- **Pod base:** local dev `http://localhost:3000`. Canonical concept IRI = `${podBase}/g/${slug}`. Session-scoped entity IRI = `${podBase}/aleph/sessions/${sid}/g/${slug}`.
- `PodClient` API (existing): `baseUrl`, `url(path)`, `getResource(path): Promise<string|null>` (Turtle), `putResource(path, body, {contentType})`, `listContainer(path): Promise<string[]>` (full URLs).
- Parse Turtle with `new Parser().parse(ttl)` → `Quad[]`; write with `new Writer()` + `addQuads` + `end(cb)`. (See `toTurtle` in `templates.ts` for the Writer pattern.)

---

## File Structure

- **Create** `src/lib/typeindex.ts` — `resolveContainers(pod, classIri)`, `ensureRegistration(pod, classIri, container)`. Lives in `lib` (shared by daemon + future UI loader).
- **Create** `tests/daemon/typeindex.test.ts`.
- **Create** `src/daemon/lookup.ts` — `findCanonicalByLabel(pod, label)`.
- **Create** `tests/daemon/lookup.test.ts`.
- **Create** `src/daemon/bless.ts` — `blessSession(pod, sessionId)`.
- **Create** `tests/daemon/bless.test.ts`.
- **Create** `scripts/bless.ts` — CLI: `node --import tsx scripts/bless.ts <sessionId>`.

---

## Task 1: TypeIndex resolver

**Files:** Create `src/lib/typeindex.ts`, `tests/daemon/typeindex.test.ts`.

- [ ] **Step 1: Failing test** (`tests/daemon/typeindex.test.ts`):

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveContainers } from '../../src/lib/typeindex';

const V = 'https://vocab.aleph.wiki/';
const BASE = 'http://localhost:3000';
const INDEX = `@prefix solid: <http://www.w3.org/ns/solid/terms#> .
@prefix aleph: <https://vocab.aleph.wiki/> .
<#concepts> a solid:TypeRegistration ;
  solid:forClass aleph:Concept ; solid:instanceContainer </g/> .
<#films> a solid:TypeRegistration ;
  solid:forClass <https://schema.org/Movie> ; solid:instanceContainer </media/films/> .`;

function stubPod(index: string | null) {
  return {
    baseUrl: BASE,
    async getResource(p: string) { return p === '/settings/publicTypeIndex.ttl' ? index : null; },
  };
}

describe('resolveContainers', () => {
  it('returns the registered container path for a class', async () => {
    expect(await resolveContainers(stubPod(INDEX) as any, `${V}Concept`)).toEqual(['/g/']);
  });
  it('falls back to /g/ when the class is unregistered', async () => {
    expect(await resolveContainers(stubPod(INDEX) as any, `${V}Person`)).toEqual(['/g/']);
  });
  it('falls back to /g/ when there is no TypeIndex at all', async () => {
    expect(await resolveContainers(stubPod(null) as any, `${V}Concept`)).toEqual(['/g/']);
  });
});
```

- [ ] **Step 2: Run, verify FAIL:** `nix develop -c bun run test tests/daemon/typeindex.test.ts` → `Cannot find module`.

- [ ] **Step 3: Implement** `src/lib/typeindex.ts`:

```typescript
import { Parser } from 'n3';
import type { PodClient } from './pod';

const SOLID = 'http://www.w3.org/ns/solid/terms#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const TYPE_INDEX_PATH = '/settings/publicTypeIndex.ttl';
const DEFAULT_CONTAINER = '/g/';

type PodLike = Pick<PodClient, 'baseUrl' | 'getResource'>;

/** Local path of a container IRI/relative ref, normalized to start with `/`. */
function toPath(base: string, ref: string): string {
  const local = ref.startsWith('http') ? ref.replace(base.replace(/\/$/, ''), '') : ref;
  return local.startsWith('/') ? local : `/${local}`;
}

/**
 * Containers registered for `classIri` in the pod's public TypeIndex. Falls
 * back to the default `/g/` when the class is unregistered or no index exists.
 */
export async function resolveContainers(pod: PodLike, classIri: string): Promise<string[]> {
  let ttl: string | null = null;
  try { ttl = await pod.getResource(TYPE_INDEX_PATH); } catch { ttl = null; }
  if (!ttl) return [DEFAULT_CONTAINER];
  const quads = new Parser().parse(ttl);
  const regs = quads
    .filter((q) => q.predicate.value === `${SOLID}forClass` && q.object.value === classIri)
    .map((q) => q.subject.value);
  const containers = quads
    .filter((q) => regs.includes(q.subject.value) && q.predicate.value === `${SOLID}instanceContainer`)
    .map((q) => toPath(pod.baseUrl, q.object.value));
  void RDF_TYPE;
  return containers.length ? containers : [DEFAULT_CONTAINER];
}
```

- [ ] **Step 4: Run, verify PASS** (3 tests). Remove the `void RDF_TYPE;` line if you didn't need the constant.

- [ ] **Step 5: Commit:**
```bash
git add src/lib/typeindex.ts tests/daemon/typeindex.test.ts
git commit -m "feat(typeindex): resolve rdf:type → container with /g/ default"
```

---

## Task 2: TypeIndex registration bootstrap

**Files:** Modify `src/lib/typeindex.ts`, `tests/daemon/typeindex.test.ts`.

- [ ] **Step 1: Failing test** (append):

```typescript
describe('ensureRegistration', () => {
  it('writes a registration when the class is not yet registered', async () => {
    const puts: { path: string; body: string }[] = [];
    const pod = {
      baseUrl: BASE,
      async getResource() { return null; },
      async putResource(path: string, body: string) { puts.push({ path, body }); },
    };
    await ensureRegistration(pod as any, `${V}Concept`, '/g/');
    expect(puts[0].path).toBe('/settings/publicTypeIndex.ttl');
    expect(puts[0].body).toMatch(/solid:forClass\s+<https:\/\/vocab\.aleph\.wiki\/Concept>/);
    expect(puts[0].body).toMatch(/solid:instanceContainer\s+<\/g\/>/);
  });
  it('is a no-op when the class is already registered', async () => {
    const puts: unknown[] = [];
    const pod = {
      baseUrl: BASE,
      async getResource() { return INDEX; },
      async putResource() { puts.push(1); },
    };
    await ensureRegistration(pod as any, `${V}Concept`, '/g/');
    expect(puts).toHaveLength(0);
  });
});
```

Add `ensureRegistration` to the import at the top of the test file.

- [ ] **Step 2: Run, verify FAIL** (`ensureRegistration is not a function`).

- [ ] **Step 3: Implement** (append to `src/lib/typeindex.ts`; add `putResource` to `PodLike`):

```typescript
type PodWritable = PodLike & Pick<PodClient, 'putResource'>;

/** Register `classIri → container` in the public TypeIndex if not already present. */
export async function ensureRegistration(pod: PodWritable, classIri: string, container: string): Promise<void> {
  const existing = await resolveContainers(pod, classIri);
  if (existing.includes(container) && (await safeGet(pod))) return; // already registered
  let ttl = (await safeGet(pod)) ?? '@prefix solid: <http://www.w3.org/ns/solid/terms#> .\n';
  const localName = classIri.split(/[#/]/).pop() ?? 'thing';
  ttl += `\n<#${localName}> a solid:TypeRegistration ;\n  solid:forClass <${classIri}> ;\n  solid:instanceContainer <${container}> .\n`;
  await pod.putResource('/settings/publicTypeIndex.ttl', ttl, { contentType: 'text/turtle' });
}

async function safeGet(pod: PodLike): Promise<string | null> {
  try { return await pod.getResource('/settings/publicTypeIndex.ttl'); } catch { return null; }
}
```

Note: the "already registered" check must distinguish a real registration from the `/g/` default. `resolveContainers` returns `['/g/']` both when registered-to-/g/ and when absent — so gate the no-op on the index actually existing AND containing the class. Adjust the guard so the no-op branch only triggers when `safeGet` returns a body that mentions `classIri`.

- [ ] **Step 4: Run, verify PASS.** Refine the guard until both new tests pass (registration written when absent; no-op when the index already contains the class).

- [ ] **Step 5: Commit:**
```bash
git add src/lib/typeindex.ts tests/daemon/typeindex.test.ts
git commit -m "feat(typeindex): bootstrap a default registration when missing"
```

---

## Task 3: Find existing canonical concept by label

**Files:** Create `src/daemon/lookup.ts`, `tests/daemon/lookup.test.ts`.

- [ ] **Step 1: Failing test:**

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { findCanonicalByLabel } from '../../src/daemon/lookup';

const BASE = 'http://localhost:3000';
const GAME = `@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
<http://localhost:3000/g/GameTheory> a aleph:Concept ;
  skos:prefLabel "Game Theory"@en .`;

function stubPod(files: Record<string, string>, listing: string[]) {
  return {
    baseUrl: BASE,
    async getResource(p: string) { return files[p] ?? null; },
    async listContainer() { return listing; },
  };
}

describe('findCanonicalByLabel', () => {
  it('returns the IRI of a concept whose prefLabel matches (case-insensitive)', async () => {
    const pod = stubPod({ '/g/GameTheory.ttl': GAME }, [`${BASE}/g/GameTheory.ttl`]);
    expect(await findCanonicalByLabel(pod as any, 'game theory')).toBe(`${BASE}/g/GameTheory`);
  });
  it('returns null when nothing matches', async () => {
    const pod = stubPod({ '/g/GameTheory.ttl': GAME }, [`${BASE}/g/GameTheory.ttl`]);
    expect(await findCanonicalByLabel(pod as any, 'Set Theory')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `src/daemon/lookup.ts`:

```typescript
import { Parser } from 'n3';
import type { PodClient } from '../lib/pod';
import { resolveContainers } from '../lib/typeindex';

const V = 'https://vocab.aleph.wiki/';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';

type PodLike = Pick<PodClient, 'baseUrl' | 'getResource' | 'listContainer'>;

/**
 * IRI of an existing canonical concept whose prefLabel or altLabel matches
 * `label` (case-insensitive), or null. Searches the containers registered for
 * aleph:Concept (default `/g/`).
 */
export async function findCanonicalByLabel(pod: PodLike, label: string): Promise<string | null> {
  const want = label.trim().toLowerCase();
  if (!want) return null;
  const containers = await resolveContainers(pod, `${V}Concept`);
  for (const container of containers) {
    const entries = await pod.listContainer(container);
    for (const entry of entries) {
      const path = entry.startsWith('http') ? new URL(entry).pathname : entry;
      if (!path.endsWith('.ttl')) continue;
      const ttl = await pod.getResource(path);
      if (!ttl) continue;
      const quads = new Parser().parse(ttl);
      const hit = quads.find(
        (q) => (q.predicate.value === `${SKOS}prefLabel` || q.predicate.value === `${SKOS}altLabel`) &&
               q.object.value.trim().toLowerCase() === want,
      );
      if (hit) return hit.subject.value;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run, verify PASS.**

- [ ] **Step 5: Commit:**
```bash
git add src/daemon/lookup.ts tests/daemon/lookup.test.ts
git commit -m "feat(daemon): find existing canonical concept by label"
```

---

## Task 4: Gather a session's non-invalidated claim quads

**Files:** Create `src/daemon/bless.ts`, `tests/daemon/bless.test.ts`.

Background: each claim is a Turtle named graph at `/aleph/sessions/<sid>/claim_*.ttl`. The claim's header node (the document IRI) carries `prov:wasInvalidatedBy` when the user rejected it. We gather quads from all claim files EXCEPT invalidated ones.

- [ ] **Step 1: Failing test:**

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { gatherClaims } from '../../src/daemon/bless';

const BASE = 'http://localhost:3000';
const SID = '260529-001';
const dir = `/aleph/sessions/${SID}/`;
const good = `@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
<${BASE}${dir}g/GameTheory> a aleph:Concept ; skos:prefLabel "Game Theory"@en .`;
const rejected = `@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix prov: <http://www.w3.org/ns/prov#> .
<${BASE}${dir}claim_02.ttl> a aleph:ImaginedAssertion ; prov:wasInvalidatedBy <#review> .
<${BASE}${dir}g/Bogus> a aleph:Concept .`;

function stubPod(files: Record<string, string>) {
  return {
    baseUrl: BASE,
    async listContainer(p: string) {
      return p === dir ? [`${BASE}${dir}claim_01.ttl`, `${BASE}${dir}claim_02.ttl`, `${BASE}${dir}meta.ttl`] : [];
    },
    async getResource(p: string) { return files[p] ?? null; },
  };
}

describe('gatherClaims', () => {
  it('collects quads from non-invalidated claim files only', async () => {
    const pod = stubPod({ [`${dir}claim_01.ttl`]: good, [`${dir}claim_02.ttl`]: rejected });
    const quads = await gatherClaims(pod as any, SID);
    const subjects = quads.map((q) => q.subject.value);
    expect(subjects).toContain(`${BASE}${dir}g/GameTheory`);
    expect(subjects.some((s) => s.includes('Bogus'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** (`src/daemon/bless.ts`):

```typescript
import { Parser, type Quad } from 'n3';
import type { PodClient } from '../lib/pod';

const PROV = 'http://www.w3.org/ns/prov#';

type PodLike = Pick<PodClient, 'baseUrl' | 'getResource' | 'listContainer' | 'putResource'>;

const sessionDir = (sid: string) => `/aleph/sessions/${sid}/`;

/** Quads from every non-invalidated claim_*.ttl in the session container. */
export async function gatherClaims(pod: PodLike, sessionId: string): Promise<Quad[]> {
  const dir = sessionDir(sessionId);
  const entries = await pod.listContainer(dir);
  const out: Quad[] = [];
  for (const entry of entries) {
    const path = entry.startsWith('http') ? new URL(entry).pathname : entry;
    const base = path.replace(/^.*\//, '');
    if (!/^claim_.*\.ttl$/.test(base)) continue;
    const ttl = await pod.getResource(path);
    if (!ttl) continue;
    const quads = new Parser({ baseIRI: pod.baseUrl + path }).parse(ttl);
    const invalidated = quads.some((q) => q.predicate.value === `${PROV}wasInvalidatedBy`);
    if (invalidated) continue;
    out.push(...quads);
  }
  return out;
}
```

Note: parse with `baseIRI` = the claim doc URL so relative IRIs (`g/<slug>`, `<#review>`) resolve to absolute session-scoped IRIs, matching the test's expectations.

- [ ] **Step 4: Run, verify PASS.**

- [ ] **Step 5: Commit:**
```bash
git add src/daemon/bless.ts tests/daemon/bless.test.ts
git commit -m "feat(daemon): gather non-invalidated session claim quads"
```

---

## Task 5: Bless — promote session entities to canonical /g/

**Files:** Modify `src/daemon/bless.ts`, `tests/daemon/bless.test.ts`.

This is the core. For each session-scoped entity IRI (`${base}/aleph/sessions/<sid>/g/<slug>`) in the gathered quads:
1. Resolve its canonical IRI: `findCanonicalByLabel(prefLabel)` → reuse; else mint `${base}/g/<slug>` (slug already encoded in the session IRI's last segment). Empty slug → skip + warn.
2. Build a remap `sessionIRI → canonicalIRI`.
3. Rewrite all gathered quads (subject + object) through the remap.
4. Group rewritten quads by canonical subject; for each, GET the existing `/g/<slug>.ttl` (if any), union the new triples, add `prov:wasGeneratedBy <session-IRI>`, PUT the merged Turtle.

- [ ] **Step 1: Failing test** (append):

```typescript
import { blessSession } from '../../src/daemon/bless';

describe('blessSession', () => {
  it('promotes a session concept to a canonical /g/ resource with provenance', async () => {
    const puts: { path: string; body: string }[] = [];
    const pod = {
      baseUrl: BASE,
      async listContainer(p: string) {
        if (p === dir) return [`${BASE}${dir}claim_01.ttl`];
        return []; // empty /g/ → nothing to reuse
      },
      async getResource(p: string) {
        return p === `${dir}claim_01.ttl` ? good : (p === '/settings/publicTypeIndex.ttl' ? null : null);
      },
      async putResource(path: string, body: string) { puts.push({ path, body }); },
    };
    await blessSession(pod as any, SID);
    const put = puts.find((p) => p.path === '/g/GameTheory.ttl');
    expect(put).toBeDefined();
    expect(put!.body).toMatch(/aleph\.wiki\/g\/GameTheory>\s+a\s+<https:\/\/vocab\.aleph\.wiki\/Concept>/);
    expect(put!.body).toMatch(/wasGeneratedBy/);
    // canonical, not session-scoped:
    expect(put!.body).not.toMatch(/sessions\/260529-001\/g\/GameTheory/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (`blessSession is not a function`).

- [ ] **Step 3: Implement** (append to `src/daemon/bless.ts`; import deps):

```typescript
import { Writer, DataFactory } from 'n3';
import { findCanonicalByLabel } from './lookup';
import { resolveContainers } from '../lib/typeindex';

const { namedNode, quad: mkQuad, literal } = DataFactory;
const V = 'https://vocab.aleph.wiki/';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

function writeTurtle(quads: Quad[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = new Writer();
    w.addQuads(quads);
    w.end((e, r) => (e ? reject(e) : resolve(r)));
  });
}

/**
 * Canonicalize a session: promote every non-invalidated session-scoped entity
 * into the canonical /g/ graph (reusing an existing concept by label or minting
 * a new one), remap references, merge additively, and stamp provenance.
 */
export async function blessSession(pod: PodLike, sessionId: string): Promise<{ promoted: string[] }> {
  const dir = sessionDir(sessionId);
  const sessionPrefix = `${pod.baseUrl}${dir}g/`;
  const quads = await gatherClaims(pod, sessionId);

  // 1. session entities = subjects under the session's g/ prefix
  const entities = [...new Set(quads.filter((q) => q.subject.value.startsWith(sessionPrefix)).map((q) => q.subject.value))];

  // 2. resolve each to a canonical IRI
  const remap = new Map<string, string>();
  for (const iri of entities) {
    const slug = iri.slice(sessionPrefix.length);
    if (!slug) { console.warn(`[bless] empty slug for ${iri} — skipped`); continue; }
    const label = quads.find((q) => q.subject.value === iri && q.predicate.value === `${SKOS}prefLabel`)?.object.value;
    const existing = label ? await findCanonicalByLabel(pod, label) : null;
    if (existing) { remap.set(iri, existing); continue; }
    const containers = await resolveContainers(pod, `${V}Concept`);
    const container = (containers[0] ?? '/g/').replace(/\/$/, '');
    remap.set(iri, `${pod.baseUrl}${container}/${slug}`);
  }

  // 3. rewrite quads through the remap (subject + object)
  const re = (t: any) => (t.termType === 'NamedNode' && remap.has(t.value)) ? namedNode(remap.get(t.value)!) : t;
  const rewritten = quads
    .filter((q) => remap.has(q.subject.value)) // only entity triples promote
    .map((q) => mkQuad(re(q.subject), q.predicate, re(q.object)));

  // 4. group by canonical subject, merge into existing resource, PUT
  const sessionIri = `${V.replace('vocab.aleph.wiki/', '')}`; // unused guard
  void sessionIri; void RDF_TYPE; void literal;
  const promoted: string[] = [];
  const bySubject = new Map<string, Quad[]>();
  for (const q of rewritten) (bySubject.get(q.subject.value) ?? bySubject.set(q.subject.value, []).get(q.subject.value)!).push(q);

  const sessionActivity = `${pod.baseUrl}/aleph/sessions/${sessionId}`;
  for (const [subjIri, subjQuads] of bySubject) {
    const path = subjIri.replace(pod.baseUrl.replace(/\/$/, ''), '') + '.ttl';
    const existingTtl = await pod.getResource(path);
    const existingQuads = existingTtl ? new Parser({ baseIRI: pod.baseUrl + path }).parse(existingTtl) : [];
    const prov = mkQuad(namedNode(subjIri), namedNode(`${PROV}wasGeneratedBy`), namedNode(sessionActivity));
    const merged = dedupeQuads([...existingQuads, ...subjQuads, prov]);
    await pod.putResource(path, await writeTurtle(merged), { contentType: 'text/turtle' });
    promoted.push(subjIri);
  }
  return { promoted };
}

function dedupeQuads(quads: Quad[]): Quad[] {
  const seen = new Set<string>();
  return quads.filter((q) => {
    const k = `${q.subject.value}|${q.predicate.value}|${q.object.value}|${q.object.termType}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
}
```

Clean up the `void` guard lines (`sessionIri`, `RDF_TYPE`, `literal`) — they are placeholders; remove any you don't use. The canonical resource path derives from the canonical IRI: `${base}/g/<slug>` → `/g/<slug>.ttl`.

- [ ] **Step 4: Run, verify PASS.** Also run the full daemon suite: `nix develop -c bun run test tests/daemon`.

- [ ] **Step 5: Commit:**
```bash
git add src/daemon/bless.ts tests/daemon/bless.test.ts
git commit -m "feat(daemon): bless promotes session claims to canonical /g/"
```

---

## Task 6: Bless CLI

**Files:** Create `scripts/bless.ts`.

- [ ] **Step 1: Implement** (no unit test — thin wiring; verified by Task 7 against a real pod):

```typescript
// node --import tsx scripts/bless.ts <sessionId> [podBase]
import { PodClient } from '../src/lib/pod';
import { blessSession } from '../src/daemon/bless';

const sessionId = process.argv[2];
const podBase = process.argv[3] ?? process.env.POD_BASE ?? 'http://localhost:3000';
if (!sessionId) { console.error('usage: bless <sessionId> [podBase]'); process.exit(1); }

const { promoted } = await blessSession(new PodClient(podBase), sessionId);
console.log(`[bless] ${sessionId}: promoted ${promoted.length} concept(s):`);
for (const iri of promoted) console.log(`  ${iri}`);
process.exit(0);
```

- [ ] **Step 2: Typecheck:** `nix develop -c bun run typecheck` → clean.

- [ ] **Step 3: Commit:**
```bash
git add scripts/bless.ts
git commit -m "feat(daemon): bless CLI"
```

---

## Task 7: Full suite + typecheck + live smoke

**Files:** none (verification).

- [ ] **Step 1:** `nix develop -c bun run test` → all pass.
- [ ] **Step 2:** `nix develop -c bun run typecheck` → clean.
- [ ] **Step 3 (live smoke, best-effort):** with a running pod (`nix develop -c aleph-jss` in another shell) that has a seeded session containing a `claim_*.ttl`, run `nix develop -c node --import tsx scripts/bless.ts <sessionId>` and confirm a `/g/<slug>.ttl` appears via `curl -s -H 'Accept: text/turtle' http://localhost:3000/g/<slug>.ttl`. If no pod/session is available, note it and rely on the unit tests.
- [ ] **Step 4:** Commit any fixups.

---

## Self-Review

- **Spec coverage:** TypeIndex discovery (Entscheidung 5) → Tasks 1–2. Lookup-before-mint (Entscheidung 6/8) → Task 3 + used in Task 5. Bless/canonicalization (Entscheidung 7) → Tasks 4–5 (gather→promote), invalidation filter via `prov:wasInvalidatedBy` (Session-Struktur), remap session→canonical, additive merge, `wasGeneratedBy` provenance. CLI trigger → Task 6 (UI trigger is Plan 3). Empty-slug skip handled in Task 5.
- **Deferred (noted):** conflict resolution beyond additive-union+warn; `wasRevisionOf`/`Snapshot` re-bless history; UI; `/aleph.wiki/` rename.
- **Placeholders:** the `void`-guard lines in Task 5 are explicitly flagged for removal — not shipped placeholders.
- **Type consistency:** `PodLike` = `Pick<PodClient, …>` across modules; `resolveContainers`/`ensureRegistration`/`findCanonicalByLabel`/`gatherClaims`/`blessSession` signatures used consistently between tasks and the CLI.

## Carried to Plan 3 (UI)

- Loader resolves concept containers via `resolveContainers` instead of crawling `/aleph/`; `all-nodes`/`node-count` filter by type, not the `aleph.wiki/g/` host.
- Render session claims (proposed, distinct style) + a bless button + per-claim invalidate action (writes `prov:wasInvalidatedBy`).
