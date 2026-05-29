// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { gatherClaims, blessSession } from '../../src/daemon/bless';

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

describe('blessSession', () => {
  it('promotes a session concept to a canonical /g/ resource with provenance', async () => {
    const puts: { path: string; body: string }[] = [];
    const pod = {
      baseUrl: BASE,
      async listContainer(p: string) { return p === dir ? [`${BASE}${dir}claim_01.ttl`] : []; },
      async getResource(p: string) { return p === `${dir}claim_01.ttl` ? good : null; },
      async putResource(path: string, body: string) { puts.push({ path, body }); },
    };
    await blessSession(pod as any, SID);
    const put = puts.find((p) => p.path === '/g/GameTheory.ttl');
    expect(put).toBeDefined();
    expect(put!.body).toMatch(/localhost:3000\/g\/GameTheory>\s+a\s+<https:\/\/vocab\.aleph\.wiki\/Concept>/);
    expect(put!.body).toMatch(/wasGeneratedBy/);
    expect(put!.body).not.toMatch(/sessions\/260529-001\/g\/GameTheory/);
  });

  it('remaps cross-entity object references to canonical IRIs', async () => {
    const claim = `@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
<${BASE}${dir}g/Child> a aleph:Concept ; skos:prefLabel "Child"@en ; skos:broader <${BASE}${dir}g/Parent> .
<${BASE}${dir}g/Parent> a aleph:Concept ; skos:prefLabel "Parent"@en .`;
    const puts: { path: string; body: string }[] = [];
    const pod = {
      baseUrl: BASE,
      async listContainer(p: string) { return p === dir ? [`${BASE}${dir}claim_01.ttl`] : []; },
      async getResource(p: string) { return p === `${dir}claim_01.ttl` ? claim : null; },
      async putResource(path: string, body: string) { puts.push({ path, body }); },
    };
    await blessSession(pod as any, SID);
    const child = puts.find((p) => p.path === '/g/Child.ttl');
    expect(child).toBeDefined();
    // broader points at the canonical Parent, not the session-scoped one
    const { Parser } = await import('n3');
    const qs = new Parser().parse(child!.body);
    const SKOS_NS = 'http://www.w3.org/2004/02/skos/core#';
    const broaderQuad = qs.find((q) => q.predicate.value === `${SKOS_NS}broader`);
    expect(broaderQuad).toBeDefined();
    expect(broaderQuad!.object.value).toBe(`${BASE}/g/Parent`);
    expect(broaderQuad!.object.value).not.toMatch(/sessions\/260529-001\/g\/Parent/);
  });

  it('merges additively into an existing /g/ resource and preserves multilingual labels', async () => {
    const existing = `@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
<${BASE}/g/GameTheory> skos:altLabel "GT"@en .`;
    const puts: { path: string; body: string }[] = [];
    const pod = {
      baseUrl: BASE,
      async listContainer(p: string) { return p === dir ? [`${BASE}${dir}claim_01.ttl`] : []; },
      async getResource(p: string) {
        if (p === `${dir}claim_01.ttl`) return good;          // prefLabel "Game Theory"@en
        if (p === '/g/GameTheory.ttl') return existing;        // altLabel "GT"@en
        return null;
      },
      async putResource(path: string, body: string) { puts.push({ path, body }); },
    };
    await blessSession(pod as any, SID);
    const body = puts.find((p) => p.path === '/g/GameTheory.ttl')!.body;
    const { Parser } = await import('n3');
    const qs = new Parser().parse(body);
    const SKOS_NS = 'http://www.w3.org/2004/02/skos/core#';
    expect(qs.some((q) => q.predicate.value === `${SKOS_NS}altLabel` && q.object.value === 'GT')).toBe(true);
    expect(qs.some((q) => q.predicate.value === `${SKOS_NS}prefLabel` && q.object.value === 'Game Theory')).toBe(true);
    const wasGenBy = qs.filter((q) => q.predicate.value === 'http://www.w3.org/ns/prov#wasGeneratedBy');
    expect(wasGenBy).toHaveLength(1);
  });
});

describe('gatherClaims', () => {
  it('collects quads from non-invalidated claim files only', async () => {
    const pod = stubPod({ [`${dir}claim_01.ttl`]: good, [`${dir}claim_02.ttl`]: rejected });
    const quads = await gatherClaims(pod as any, SID);
    const subjects = quads.map((q) => q.subject.value);
    expect(subjects).toContain(`${BASE}${dir}g/GameTheory`);
    expect(subjects.some((s) => s.includes('Bogus'))).toBe(false);
  });
});
