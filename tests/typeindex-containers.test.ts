// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { conceptContainers } from '../src/lib/typeindex';

describe('conceptContainers', () => {
  it('defaults to /g/ when there is no TypeIndex', async () => {
    const pod = { baseUrl: 'http://localhost:3000', async getResource() { return null; } };
    expect(await conceptContainers(pod as any)).toEqual(['/g/']);
  });
  it('unions distinct registered containers', async () => {
    const INDEX = `@prefix solid: <http://www.w3.org/ns/solid/terms#> .
@prefix aleph: <https://vocab.aleph.wiki/> .
<#c> a solid:TypeRegistration ; solid:forClass aleph:Concept ; solid:instanceContainer </g/> .
<#p> a solid:TypeRegistration ; solid:forClass aleph:Person ; solid:instanceContainer </people/> .`;
    const pod = { baseUrl: 'http://localhost:3000', async getResource() { return INDEX; } };
    const got = await conceptContainers(pod as any);
    expect(got.sort()).toEqual(['/g/', '/people/']);
  });
});
