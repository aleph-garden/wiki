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
