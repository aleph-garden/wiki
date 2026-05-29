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
