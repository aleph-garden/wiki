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
