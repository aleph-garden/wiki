// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveContainers, ensureRegistration } from '../../src/lib/typeindex';

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
