# Session-Scoped Writes & Enforcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daemon write the agent's knowledge as named-graph claim resources into the current session container only — with proper relative, session-scoped IRIs and minted slugs — enforced as a capability boundary (the agent cannot target `/g/` or another session).

**Architecture:** The MCP write tools derive their target container from the run-bound session (`RunContext.sessionId`), not from agent-supplied parameters. The assert tool writes one Turtle named graph per claim under `aleph.wiki/sessions/<id>/`, with concept entities carrying a relative session-scoped IRI (`g/<Slug>`) minted from their `prefLabel`. No `/g/` promotion happens here — that is the bless step in a later plan.

**Tech Stack:** Bun + TypeScript, vitest, `jsonld` + `n3` (in-process Turtle serialization), the in-process `@anthropic-ai/claude-agent-sdk` MCP server.

**Scope boundary:** This plan covers only the daemon write path. It does NOT add the Solid TypeIndex, the bless/canonicalization step, `/g/` promotion, the lookup-before-mint of existing canonical concepts (nothing is canonical yet), or UI loader/query changes. Those are later plans.

---

## File Structure

- **Create** `src/daemon/slug.ts` — pure slug normalization (`prefLabel` → PascalCase ASCII slug). One responsibility, no deps.
- **Create** `tests/daemon/slug.test.ts` — slug unit tests.
- **Modify** `src/daemon/templates.ts` — replace `buildAssertionDoc` (concept+provenance to `/aleph/assertions/`, empty `@id`) with `buildClaimDoc` that writes a claim named graph into the session container, assigns concept `@id` = relative `g/<slug>`, keeps provenance as a node. Reuse existing `toTurtle`.
- **Modify** `tests/daemon/templates.test.ts` — claim-doc tests.
- **Modify** `src/daemon/mcp/server.ts` — drop `sessionId` from the `write_message`/`assert_*` tool input schemas; derive it from `ctx.sessionId`; point assert at the session claim path; rename the tool to `assert_claim`.
- **Modify** `tests/daemon/mcp-server.test.ts` — enforcement + claim-write tests.
- **Modify** `prompts/agent-event.md` — describe the new `assert_claim` tool (no `sessionId` arg; concept needs `prefLabel`, daemon mints the IRI).

No changes to `router.ts`, `subscriber.ts`, `subscriptions.ts`, `queue.ts`, `shacl.ts` in this plan.

---

## Task 1: Slug normalization helper

**Files:**
- Create: `src/daemon/slug.ts`
- Test: `tests/daemon/slug.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/daemon/slug.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/daemon/slug';

describe('slugify', () => {
  it('PascalCases a multi-word label', () => {
    expect(slugify('game theory')).toBe('GameTheory');
  });
  it('folds accents to ASCII and drops punctuation', () => {
    expect(slugify("Gödel's Incompleteness Theorems")).toBe('GoedelsIncompletenessTheorems');
  });
  it('collapses whitespace and separators', () => {
    expect(slugify('  first-order   logic ')).toBe('FirstOrderLogic');
  });
  it('returns empty string for empty/garbage input', () => {
    expect(slugify('   ')).toBe('');
    expect(slugify('!!!')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix develop -c bun run test tests/daemon/slug.test.ts`
Expected: FAIL — `Cannot find module '../../src/daemon/slug'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/daemon/slug.ts
/**
 * Normalize a human label into a PascalCase ASCII slug for use as the last
 * segment of an instance IRI (e.g. "Gödel's Incompleteness" → "GoedelsIncompleteness").
 * German umlauts are transliterated (ö→oe) before stripping; other accents are
 * folded via NFKD. Returns "" when nothing usable remains.
 */
export function slugify(label: string): string {
  const transliterated = label
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss');
  const ascii = transliterated.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const words = ascii.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix develop -c bun run test tests/daemon/slug.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/slug.ts tests/daemon/slug.test.ts
git commit -m "feat(daemon): slug helper for instance IRIs"
```

---

## Task 2: Claim-doc builder (named graph into the session container)

**Files:**
- Modify: `src/daemon/templates.ts`
- Test: `tests/daemon/templates.test.ts`

Background: `buildAssertionDoc` currently writes to `/aleph/assertions/<sid>/<kind>_<ts>.jsonld` with the assertion header `@id: ""` and the agent's `@graph` appended verbatim (concept `@id` came from the agent → was empty → collapsed). `toTurtle(validationDoc, base)` already exists and serializes inline-context JSON-LD to Turtle. We replace the builder so it (a) targets the session container as `.ttl`, (b) mints each concept's `@id` from its `prefLabel` as the relative session-scoped IRI `g/<slug>`.

- [ ] **Step 1: Write the failing test**

```typescript
// add to tests/daemon/templates.test.ts (imports: buildClaimDoc, toTurtle, Parser already present)
describe('buildClaimDoc', () => {
  it('targets the session container as .ttl and mints concept @id from prefLabel', async () => {
    const built = buildClaimDoc({
      sessionId: '260529-001', ts: '20260529T100000', kind: 'imagined',
      now: '2026-05-29T10:00:00Z',
      concepts: [{ '@type': 'Concept', prefLabel: { en: 'Game Theory' },
                   definition: { en: 'Study of strategic interaction.' } }],
      provenance: {},
    });
    expect(built.path).toBe('/aleph.wiki/sessions/260529-001/claim_20260529T100000.ttl');

    const base = `http://localhost:3000${built.path}`;
    const qs = new Parser().parse(await toTurtle(built.validationDoc, base));
    const conceptIri = 'http://localhost:3000/aleph.wiki/sessions/260529-001/g/GameTheory';
    const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    const V = 'https://vocab.aleph.wiki/';
    // concept got a session-scoped g/<slug> IRI, not an empty @id
    expect(qs.some((q) => q.subject.value === conceptIri && q.predicate.value === RDF_TYPE && q.object.value === `${V}Concept`)).toBe(true);
    // the claim/provenance node is the document itself (@id "")
    expect(qs.some((q) => q.subject.value === base && q.predicate.value === RDF_TYPE && q.object.value === `${V}ImaginedAssertion`)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix develop -c bun run test tests/daemon/templates.test.ts`
Expected: FAIL — `buildClaimDoc is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/daemon/templates.ts` (keep `INLINE_CONTEXT`, `toTurtle`, `buildReplyDoc`; remove `buildAssertionDoc` and its `AssertionInput`/`KIND_TYPE` only after Task 4 stops importing them — for now add alongside):

```typescript
import { slugify } from './slug';

export interface ClaimConcept {
  '@type': 'Concept' | 'Person' | 'Event';
  prefLabel: Record<string, string>;
  [key: string]: unknown; // definition, broader, related, … (context-mapped)
}

export interface ClaimInput {
  sessionId: string;
  ts: string;
  kind: AssertionKind;
  now: string;
  concepts: ClaimConcept[];
  provenance: AssertionProvenance;
}

export function buildClaimDoc(input: ClaimInput): BuiltDoc {
  const { sessionId, ts, kind, now, concepts, provenance } = input;
  const header: Record<string, unknown> = {
    '@id': '',
    '@type': KIND_TYPE[kind],
    wasGeneratedBy: `g:${sessionId}`,
    generatedAtTime: now,
  };
  if (kind === 'web') {
    if (provenance.derivedFrom) header.derivedFrom = provenance.derivedFrom;
    if (provenance.searchQuery) header.searchQuery = provenance.searchQuery;
  } else if (kind === 'sparql') {
    if (provenance.query) header.query = provenance.query;
    if (provenance.endpoints) header.endpoints = provenance.endpoints;
  }
  // Mint a session-scoped relative IRI per concept from its prefLabel.
  const graph = concepts.map((c) => {
    const label = c.prefLabel?.en ?? Object.values(c.prefLabel ?? {})[0] ?? '';
    const slug = slugify(label);
    return { ...c, '@id': `g/${slug}`, wasGeneratedBy: `g:${sessionId}`, generatedAtTime: now };
  });
  return {
    validationDoc: { '@context': INLINE_CONTEXT, '@graph': [header, ...graph] },
    path: `/aleph.wiki/sessions/${sessionId}/claim_${ts}.ttl`,
  };
}
```

Note: `g:` in `wasGeneratedBy` still maps to the absolute `https://aleph.wiki/g/` via `INLINE_CONTEXT` (unchanged in this plan — session→canonical remap is the bless step). The concept `@id: "g/<slug>"` is a *relative* IRI, so `toTurtle(..., base)` resolves it against the claim-doc URL → session-scoped.

- [ ] **Step 4: Run test to verify it passes**

Run: `nix develop -c bun run test tests/daemon/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/daemon/templates.ts tests/daemon/templates.test.ts
git commit -m "feat(daemon): buildClaimDoc writes session-scoped claim named graphs"
```

---

## Task 3: Enforce session scope in MCP tools (drop agent-chosen sessionId)

**Files:**
- Modify: `src/daemon/mcp/server.ts`
- Test: `tests/daemon/mcp-server.test.ts`

`makeTools(deps, ctx)` closes over `ctx: RunContext` which already carries the run's `sessionId`/`msgN`. Today `write_message`/`assert_triples` accept `sessionId` as input. We make them use `ctx.sessionId` and ignore any input session.

- [ ] **Step 1: Write the failing test**

```typescript
// add to tests/daemon/mcp-server.test.ts
it('write_message ignores any agent-supplied sessionId and uses the run session', async () => {
  const pod = recPod();
  const c = ctx(); // ctx() builds RunContext with sessionId 's1' (see existing helper)
  const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, c);
  // @ts-expect-error — sessionId is no longer part of the input type
  await tools.write_message({ sessionId: 'EVIL', msgN: 3, body: 'hi' });
  expect(pod.puts[0].path).toBe('/aleph.wiki/sessions/s1/msg4.ttl');
});

it('assert_claim writes into the run session container', async () => {
  const pod = recPod();
  const c = ctx();
  const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, c);
  const res = await tools.assert_claim({
    kind: 'imagined',
    concepts: [{ '@type': 'Concept', prefLabel: { en: 'Game Theory' } }],
    provenance: {},
  });
  expect(res).toMatchObject({ ok: true });
  expect(pod.puts[0].path).toMatch(/^\/aleph\.wiki\/sessions\/s1\/claim_/);
  expect(pod.puts[0].body).toMatch(/sessions\/s1\/g\/GameTheory/);
});
```

Note: the existing `write_message` reply path was `/aleph/sessions/s1/msg4.ttl`; this plan moves the session tree to `/aleph.wiki/sessions/`. Update `buildReplyDoc`'s path accordingly in Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `nix develop -c bun run test tests/daemon/mcp-server.test.ts`
Expected: FAIL — `assert_claim is not a function`; reply path still `/aleph/sessions/...`.

- [ ] **Step 3: Write minimal implementation**

In `src/daemon/templates.ts` `buildReplyDoc`, change the path:

```typescript
    path: `/aleph.wiki/sessions/${sessionId}/msg${next}.ttl`,
```

In `src/daemon/mcp/server.ts`:
- Change `write_message` handler signature to `{ msgN, body }` and call `buildReplyDoc({ sessionId: ctx.sessionId, msgN, body, now: nowIso() })`.
- Replace `assert_triples` with `assert_claim`:

```typescript
async function assert_claim(input: {
  kind: AssertionKind;
  concepts: { '@type': 'Concept' | 'Person' | 'Event'; prefLabel: Record<string, string>; [k: string]: unknown }[];
  provenance: { derivedFrom?: string; searchQuery?: string; query?: string; endpoints?: string[] };
}) {
  const built = buildClaimDoc({
    sessionId: ctx.sessionId, ts: fileTs(), kind: input.kind, now: nowIso(),
    concepts: input.concepts, provenance: input.provenance,
  });
  const report = await validator.validateJsonLd(built.validationDoc, {
    documentUrl: docUrl(built.path),
    contextTurtle: await sessionMeta(ctx.sessionId),
  });
  if (!report.conforms) {
    if (enforceShacl) return { error: 'shacl' as const, report: report.results };
    console.warn(`[mcp] SHACL advisory (not blocking) on ${built.path}: ${report.results.join('; ')}`);
  }
  const podBody = await toTurtle(built.validationDoc, docUrl(built.path));
  await pod.putResource(built.path, podBody, { contentType: 'text/turtle' });
  console.log(`[mcp] assert_claim ${input.kind} → ${built.path}`);
  return { ok: true as const, path: built.path };
}
```

- Update the returned object and the `createAlephServer` tool registration: rename `assert_triples` → `assert_claim`, drop `sessionId`/`msgN` from `write_message`'s zod schema, replace the `assert_*` schema with `{ kind, concepts: z.array(...), provenance }`.
- Update `import` to pull `buildClaimDoc` (and `toTurtle`) from `../templates`.

In `src/daemon/runner.ts`, the fallback call `tools.write_message({ sessionId, msgN, body })` becomes `tools.write_message({ msgN: trigger.msgN, body: FALLBACK_BODY })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `nix develop -c bun run test tests/daemon`
Expected: PASS — update any remaining `assert_triples`/`sessionId`/`/aleph/sessions/` references in `mcp-server.test.ts`, `runner.test.ts`, `e2e.test.ts` to the new tool name and `/aleph.wiki/sessions/` paths.

- [ ] **Step 5: Commit**

```bash
git add src/daemon/mcp/server.ts src/daemon/templates.ts src/daemon/runner.ts tests/daemon/
git commit -m "feat(daemon): enforce session-scoped writes, assert_claim into session container"
```

---

## Task 4: Update the agent prompt for the new tool surface

**Files:**
- Modify: `prompts/agent-event.md`

- [ ] **Step 1: Edit the prompt**

Replace the `assert_triples` and `write_message` tool descriptions and the `@id` rules with:

```markdown
- `mcp__aleph__assert_claim(kind, concepts, provenance)` — persist one claim as
  a named graph in THIS session. `concepts` is a list of typed nodes
  (`@type` Concept/Person/Event) each with a `prefLabel` — **do not set `@id`,
  the daemon mints the IRI from the prefLabel.** `kind`: `web` (provenance needs
  `derivedFrom` + `searchQuery`), `sparql` (`query` + `endpoints`), or
  `imagined`. You can only write into the current session — there is no session
  argument and no way to write canonical/`/g/` data; that happens later when the
  user blesses the session.
- `mcp__aleph__write_message(msgN, body)` — write your reply as `msg{N+1}` in
  this session. Call once, last. No session argument.
```

Remove the old "Leave every `@id` empty" paragraph entirely.

- [ ] **Step 2: Commit**

```bash
git add prompts/agent-event.md
git commit -m "docs(prompts): assert_claim tool, daemon-minted concept IRIs"
```

---

## Task 5: Full suite + typecheck green

**Files:** none (verification).

- [ ] **Step 1: Run the whole daemon suite**

Run: `nix develop -c bun run test tests/daemon`
Expected: all PASS. Fix any straggling references to `assert_triples`, agent-supplied `sessionId`, or `/aleph/sessions/`|`/aleph/assertions/` paths.

- [ ] **Step 2: Typecheck**

Run: `nix develop -c bun run typecheck`
Expected: clean.

- [ ] **Step 3: Commit any fixups**

```bash
git add -A && git commit -m "test(daemon): align suite with session-scoped write model"
```

---

## Self-Review

- **Spec coverage:** Entscheidung 7 (enforced session-scoped writes) → Tasks 2–4. Entscheidung 6 slug → Task 1. Entscheidung 9/Session-Struktur (claim = named graph in session container) → Task 2. Turtle (.ttl) → reuses `toTurtle`, Task 2/3. NOT covered here by design: TypeIndex (Plan 2), bless/`/g/` promotion (Plan 2), lookup-before-mint of existing canonical concepts (Plan 2, when `/g/` is non-empty), UI loader/query de-hardcode (Plan 2).
- **Placeholders:** none — every code step is complete.
- **Type consistency:** `buildClaimDoc` returns `BuiltDoc` (`{ validationDoc, path }`, existing type); `assert_claim` input `{ kind, concepts, provenance }` matches `ClaimInput` minus the daemon-supplied `sessionId`/`ts`/`now`; `write_message` input `{ msgN, body }` consistent across server.ts + runner.ts + tests.

## Carried to Plan 2 (TypeIndex + bless)

- Solid TypeIndex read/write (loader + writer), default `/g/`.
- Bless step: union non-invalidated claim graphs in the session → slug-lookup/dedup against canonical → promote session-scoped `…/sessions/<id>/g/<slug>` to `<podbase>/g/<slug>`, rewrite/`owl:sameAs` references, carry provenance.
- Lookup-before-mint: reference existing canonical concepts during the session.
- UI: load `/g/` + session containers via TypeIndex; `all-nodes`/`node-count` filter by type, not the `aleph.wiki/g/` host.
