// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTools } from '../../src/daemon/mcp/server';
import { ShaclValidator } from '../../src/daemon/shacl';
import type { RunContext } from '../../src/daemon/types';

let validator: ShaclValidator;
beforeEach(async () => { validator = await ShaclValidator.load('vocab/aleph-shapes.ttl'); });

function ctx(): RunContext {
  return { sessionId: 's1', msgN: 3, messageWritten: false, shaclFailures: new Map() };
}

/** Pod stub recording PUTs; getResource returns null. */
function recPod() {
  const puts: { path: string; body: string }[] = [];
  return {
    puts,
    baseUrl: 'http://localhost:3000',
    async putResource(path: string, body: string) { puts.push({ path, body }); },
    async getResource() { return null; },
    async listContainer() { return []; },
  };
}

describe('write_message tool', () => {
  it('PUTs msg{N+1}, sets messageWritten', async () => {
    const pod = recPod();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, c);
    const res = await tools.write_message({ sessionId: 's1', msgN: 3, body: 'hi' });
    expect(res).toMatchObject({ ok: true, path: '/aleph/sessions/s1/msg4.jsonld' });
    expect(pod.puts[0].path).toBe('/aleph/sessions/s1/msg4.jsonld');
    expect(JSON.parse(pod.puts[0].body)['@context']).toBe('./context.jsonld');
    expect(c.messageWritten).toBe(true);
  });
});

describe('assert_triples tool (advisory SHACL — default)', () => {
  it('web kind with derivedFrom writes a file and a WebSearchAssertion header', async () => {
    const pod = recPod();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, ctx());
    const res = await tools.assert_triples({
      sessionId: 's1', kind: 'web',
      jsonld: { '@graph': [{ '@id': 'g:Solid', '@type': 'Concept', prefLabel: { en: 'Solid' } }] },
      provenance: { derivedFrom: 'https://solidproject.org', searchQuery: 'solid' },
    });
    expect(res).toMatchObject({ ok: true });
    expect(pod.puts[0].path).toMatch(/^\/aleph\/assertions\/s1\/web_/);
  });

  it('still writes when SHACL would not conform (validation is advisory)', async () => {
    const pod = recPod();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, c);
    const res = await tools.assert_triples({
      sessionId: 's1', kind: 'sparql', jsonld: { '@graph': [] },
      provenance: { endpoints: ['https://dbpedia.org/sparql'] }, // no query
    });
    expect(res).toMatchObject({ ok: true });
    expect(pod.puts).toHaveLength(1);
    expect(c.shaclFailures.size).toBe(0);
  });
});

describe('assert_triples tool (enforceShacl: true)', () => {
  // A payload Concept missing its required prov fields fails ConceptShape, which
  // fires on the absolute g: IRI today (unlike the assertion-header constraints,
  // whose @id:"" node is dropped before validation — see the SHACL gate TODO).
  const badConceptPayload = {
    '@graph': [{ '@id': 'g:Solid', '@type': 'Concept', prefLabel: { en: 'Solid' } }],
  };

  it('blocks the write on a SHACL violation and increments failures', async () => {
    const pod = recPod();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any, enforceShacl: true }, c);
    const res = await tools.assert_triples({
      sessionId: 's1', kind: 'web', jsonld: badConceptPayload,
      provenance: { derivedFrom: 'https://solidproject.org', searchQuery: 'solid' },
    });
    expect(res).toMatchObject({ error: 'shacl' });
    expect(pod.puts).toHaveLength(0);
    expect(c.shaclFailures.get('web')).toBe(1);
  });

  it('returns persistent error after 3 shacl failures for the same kind', async () => {
    const pod = recPod();
    const c = ctx();
    c.shaclFailures.set('web', 3);
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any, enforceShacl: true }, c);
    const res = await tools.assert_triples({
      sessionId: 's1', kind: 'web', jsonld: badConceptPayload, provenance: {},
    });
    expect(res).toMatchObject({ error: 'persistent' });
  });
});

describe('read_pod tool', () => {
  it('returns 404 error when missing', async () => {
    const pod = recPod();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, ctx());
    const res = await tools.read_pod({ path: '/aleph/sessions/s1/meta.ttl' });
    expect(res).toEqual({ error: '404' });
  });
});
