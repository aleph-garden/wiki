# UI: Render Canonical Concepts + In-Chat Bless/Reject — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make blessed (pod-scoped `/g/`) concepts render in the graph, and let the user review a session's proposed concepts inline in the chat — rejecting individual claims and blessing the session — all from the browser.

**Architecture:** The RDF loader additionally loads the TypeIndex-resolved concept containers (default `/g/`). Node/edge queries filter canonical concepts host-agnostically (`^https?://[^/]+/g/<slug>$`), excluding session-scoped drafts. `assert_claim` stamps each claim with its turn (`aleph:turn`, from `ctx.msgN`) so the chat can group proposals per agent turn. `AlephConsole.vue` gets a per-session "Bless" button (calls browser-side `blessSession(getPod(), sessionId)`) and per-turn proposed-concept rows with a reject action (PUTs `prov:wasInvalidatedBy` into the claim file).

**Tech Stack:** Vue 3 + TypeScript, oxigraph-wasm store, `n3`, vitest (happy-dom default; node env for store tests), the existing `src/lib/rdf.ts` + `src/lib/queries.ts`, `src/daemon/bless.ts` (browser-compatible).

**Scope boundary:** No `/aleph.wiki/` rename, no data migration (Plan 4). Auth stays as-is (unauthenticated single-user JSS writes). Conflict resolution beyond additive-union stays deferred.

---

## Conventions
- Canonical concept IRI: `<podBase>/g/<slug>` (e.g. `http://localhost:3000/g/GameTheory`). Session-draft: `<podBase>/aleph/sessions/<sid>/g/<slug>`.
- Run commands with `nix develop -c`. Tests: `nix develop -c bun run test`. Typecheck: `nix develop -c bun run typecheck`. App: `nix run .#dev` (jss+seed+vite+daemon) — for run-the-app verification.

---

## Task 1: Stamp claims with their turn (data enablement)

**Files:** Modify `src/daemon/templates.ts` (`buildClaimDoc` + `INLINE_CONTEXT`), `vocab/aleph.ttl`, `vocab/aleph-context.jsonld`, `src/daemon/mcp/server.ts` (`assert_claim` passes the turn), `tests/daemon/templates.test.ts`.

The chat groups proposed concepts per agent turn, but claims currently only carry `wasGeneratedBy g:<session>`. Add an `aleph:turn` integer to the claim header.

- [ ] **Step 1 (failing test)** — extend the `buildClaimDoc` test in `tests/daemon/templates.test.ts`: pass `turn: 3` in the input and assert the validation graph's header node has `turn: 3`; and that `toTurtle` emits `<doc> <https://vocab.aleph.wiki/turn> "3"^^xsd:integer`.

```typescript
it('stamps the claim header with the turn', async () => {
  const built = buildClaimDoc({
    sessionId: '260529-001', ts: 't', kind: 'imagined', now: '2026-05-29T10:00:00Z',
    turn: 3, concepts: [{ '@type': 'Concept', prefLabel: { en: 'X' } }], provenance: {},
  });
  const header = (built.validationDoc['@graph'] as any[])[0];
  expect(header.turn).toBe(3);
  const base = `http://localhost:3000${built.path}`;
  const qs = new (await import('n3')).Parser().parse(await toTurtle(built.validationDoc, base));
  expect(qs.some((q) => q.subject.value === base && q.predicate.value === 'https://vocab.aleph.wiki/turn' && q.object.value === '3')).toBe(true);
});
```

- [ ] **Step 2** run → FAIL.
- [ ] **Step 3** implement:
  - `INLINE_CONTEXT`: add `turn: { '@id': 'aleph:turn', '@type': 'xsd:integer' }`.
  - `ClaimInput`: add `turn: number`.
  - `buildClaimDoc`: add `turn: input.turn` to the `header` object.
  - `vocab/aleph.ttl`: add `aleph:turn a owl:DatatypeProperty ; rdfs:comment "1-based position of the agent turn that proposed this claim, for in-session grouping."@en .`
  - `vocab/aleph-context.jsonld`: add the same `turn` term as in INLINE_CONTEXT (keep the two in sync).
  - `src/daemon/mcp/server.ts` `assert_claim`: pass `turn: ctx.msgN` to `buildClaimDoc`.
- [ ] **Step 4** run → PASS, plus full daemon suite green.
- [ ] **Step 5** commit: `feat(daemon): stamp claims with aleph:turn for in-chat grouping`.

---

## Task 2: Loader also loads the concept containers (/g/)

**Files:** Modify `src/lib/rdf.ts`, create `tests/rdf-load.test.ts`.

`initStore` only crawls `POD_ROOT='/aleph/'`. Canonical concepts live in `/g/` (sibling). Load the TypeIndex-resolved concept containers too.

- [ ] **Step 1 (failing test)** `tests/rdf-load.test.ts` (node env): this needs a refactor to a testable unit. Extract the "which containers to load" decision into an exported pure function `conceptContainers(pod)` that calls `resolveContainers(pod, aleph:Concept|Person|Event)` and returns the unique set. Test it against a stub pod + stub TypeIndex returns `['/g/']` by default.

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { conceptContainers } from '../src/lib/rdf';

describe('conceptContainers', () => {
  it('defaults to /g/ when no TypeIndex', async () => {
    const pod = { baseUrl: 'http://localhost:3000', async getResource() { return null; } };
    expect(await conceptContainers(pod as any)).toEqual(['/g/']);
  });
});
```

- [ ] **Step 2** run → FAIL.
- [ ] **Step 3** implement in `rdf.ts`: add `export async function conceptContainers(pod): Promise<string[]>` returning the de-duplicated union of `resolveContainers(pod, V+Concept/Person/Event)`. In `initStore`, after `loadContainer(s, p, POD_ROOT)`, also `for (const c of await conceptContainers(p)) await loadContainer(s, p, c)` (skip if `c` is under `/aleph/`, already loaded). Import `resolveContainers` from `./typeindex`.
- [ ] **Step 4** run → PASS; full suite green; typecheck clean.
- [ ] **Step 5** commit: `feat(ui): load TypeIndex concept containers into the store`.

---

## Task 3: Host-agnostic, canonical-only node/edge filters

**Files:** Modify `src/queries/all-nodes.sparql`, `node-count.sparql`, `all-edges.sparql`, `edge-count.sparql`, `default-focus.sparql`. Create `tests/queries-canonical.test.ts`.

Replace `STRSTARTS(STR(?x), "https://aleph.wiki/g/")` with a host-agnostic, canonical-only match: the IRI's path is exactly `/g/<slug>` right after the authority. Use:
```sparql
FILTER(REGEX(STR(?iri), "^https?://[^/]+/g/[^/]+$"))
```
(For `all-edges`/`edge-count`, apply the same regex to both `?s` and `?o`.) This matches `http://localhost:3000/g/GameTheory` but NOT `http://localhost:3000/aleph/sessions/<id>/g/Draft`.

- [ ] **Step 1 (failing test)** — establish the first oxigraph-store query test. `tests/queries-canonical.test.ts` (node env): `import init, { Store } from 'oxigraph/web.js'`; await init; load a small Turtle dataset containing one canonical concept (`<http://localhost:3000/g/GameTheory> a aleph:Concept ; skos:prefLabel "Game Theory"@en .`), one session-draft concept (`<http://localhost:3000/aleph/sessions/s1/g/Draft> a aleph:Concept ; skos:prefLabel "Draft"@en .`), and one vocab class (`<https://vocab.aleph.wiki/Concept> a owl:Class .`). Render `all-nodes` via the queries module (`render('allNodes')` + the prefix block) and run `store.query`. Assert the result IRIs include `…/g/GameTheory` and exclude both `…/sessions/s1/g/Draft` and the vocab class.
  - Use `render` + `SPARQL_PREFIX_BLOCK` from `src/lib/queries.ts` / `rdf.ts` if importable in node env; otherwise inline the prefix block. Keep the test focused on the FILTER behavior.
- [ ] **Step 2** run → FAIL (current filter excludes the pod-scoped canonical IRI because it isn't under `aleph.wiki/g/`).
- [ ] **Step 3** apply the regex filter to all 5 query files.
- [ ] **Step 4** run → PASS; full suite green.
- [ ] **Step 5** commit: `fix(ui): match canonical /g/ concepts host-agnostically`.

---

## Task 4: In-chat "Bless session" button

**Files:** Modify `src/components/AlephConsole.vue` (session header area ~line 79–93), possibly a small `src/lib/bless-ui.ts` wrapper.

- [ ] **Step 1** Read `src/components/AlephConsole.vue` (session header, lines ~79–93; `useActiveSessionId`/`activeSessionId` usage). Read `src/lib/rdf.ts` `getPod`, `reloadContainer`.
- [ ] **Step 2** Add a "Bless session" button in the session header, shown when `activeSessionId` is set. On click: `await blessSession(getPod(), activeSessionId.value)`, then `await reloadContainer('/g/')` (or re-init) and `storeVersion`-bump so the new canonical nodes render; show a brief status (count promoted) and disable/spinner while running. Import `blessSession` from `../daemon/bless` and `getPod`/`reloadContainer` from `../lib/rdf`.
- [ ] **Step 3 (verify by running the app — no component test infra):** `nix run .#dev`, open a session that has claims, click Bless, confirm the daemon's promoted concepts appear as graph nodes and `curl /g/<slug>.ttl` shows them. Typecheck clean (`nix develop -c bun run typecheck`).
- [ ] **Step 4** commit: `feat(ui): in-chat Bless button promotes the session to /g/`.

---

## Task 5: Per-turn proposed concepts + reject

**Files:** Modify `src/components/AlephConsole.vue` (the `proposed` panel, lines ~136–231), add a `useSessionClaims` composable in `src/lib/queries.ts` + a `claims-for-session.sparql` query, and a reject helper.

- [ ] **Step 1** Add `src/queries/claims-for-session.sparql`: select claim docs + their `aleph:turn`, the proposed concept IRI/prefLabel, and whether invalidated (`prov:wasInvalidatedBy`), for the active session's `…/sessions/<sid>/g/` entities. Add `useSessionClaims(sessionId)` to `queries.ts` (mirrors `useChat`).
- [ ] **Step 2** In `AlephConsole.vue`, for each agent turn (`m.position`), render its proposed concepts (matched by `aleph:turn === m.position`) in the existing `proposed` panel. Each row: prefLabel + a "reject" toggle. Reject → fetch the claim file, add `<claimDoc> prov:wasInvalidatedBy <#user-review>` (and a timestamp), PUT it back via `getPod().putResource`, then `reloadContainer` the session so the row reflects the invalidated state (struck through / greyed). Already-invalidated claims render disabled.
- [ ] **Step 3 (verify by running the app):** `nix run .#dev`; in a session with claims, confirm proposed concepts show under the right turn; reject one, confirm the claim file gets `prov:wasInvalidatedBy` (`curl`), and that a subsequent Bless excludes it from `/g/`. Typecheck clean.
- [ ] **Step 4** commit: `feat(ui): per-turn proposed concepts with reject`.

---

## Task 6: Full verification

- [ ] `nix develop -c bun run test` → all pass.
- [ ] `nix develop -c bun run typecheck` → clean.
- [ ] Live end-to-end (`nix run .#dev`): post a user message → daemon proposes claims → they appear per-turn in chat → reject one → Bless → kept concepts render as `/g/` nodes; rejected one absent. Document the result.
- [ ] Commit any fixups.

---

## Self-Review
- **Spec coverage:** loader loads `/g/` (Plan-2 carry) → T2; host-agnostic canonical filter → T3; in-chat bless (chosen UX) → T4; per-turn proposed + reject → T1 (turn stamp) + T5; `ensureRegistration` call-site note from Plan 2 → fold into T4 (call `ensureRegistration(pod, aleph:Concept, '/g/')` once before/after bless so other clients see the registration).
- **Testable vs run-verified:** T1/T2/T3 are unit-tested (incl. first oxigraph store-query test). T4/T5 are Vue UI — verified by running the app (no component-test infra; establishing it is out of scope).
- **Deferred:** rename + migration (Plan 4); auth; conflict UI.

## Carried to Plan 4
- Rename session/app container `/aleph/` → `/aleph.wiki/` atomically across daemon (router, subscriber, sessionMeta, templates paths), UI (`POD_ROOT`, ChatInput, SessionStart), and seed; migrate existing data; reconcile `vocab.aleph.wiki` ↔ `aleph.garden/ns/core#` is a SEPARATE later spec.
