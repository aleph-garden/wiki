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
