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

/** A SessionShape-valid meta.ttl for session s1, served at its meta path. */
const SESSION_META = `@prefix : <https://aleph.wiki/g/> .
@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
:s1 a aleph:AlephSession ;
    prov:startedAtTime "2026-04-12T14:23:00Z"^^xsd:dateTime ;
    prov:wasAssociatedWith :Claude_sonnet .
:Claude_sonnet a prov:Agent .`;

/** recPod that also serves SESSION_META at /aleph/sessions/s1/meta.ttl. */
function recPodWithMeta() {
  const pod = recPod();
  return {
    ...pod,
    async getResource(path: string) {
      return path === '/aleph/sessions/s1/meta.ttl' ? SESSION_META : null;
    },
  };
}

describe('write_message tool', () => {
  it('PUTs msg{N+1}, sets messageWritten', async () => {
    const pod = recPod();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, c);
    const res = await tools.write_message({ sessionId: 's1', msgN: 3, body: 'hi' });
    expect(res).toMatchObject({ ok: true, path: '/aleph/sessions/s1/msg4.ttl' });
    expect(pod.puts[0].path).toBe('/aleph/sessions/s1/msg4.ttl');
    // Body is now Turtle with full URIs (JSS can't serve JSON-LD as Turtle).
    expect(pod.puts[0].body).toMatch(/aleph\.wiki\/g\/s1_msg4/);
    expect(pod.puts[0].body).toMatch(/vocab\.aleph\.wiki\/ChatMessage/);
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
  // The assertion *header* (@id: "") now resolves against the doc URL the daemon
  // passes as the JSON-LD base, so header shapes actually run: a SparqlAssertion
  // without aleph:query is now a real violation (it silently passed before).
  it('blocks the write on a SHACL violation and increments failures', async () => {
    const pod = recPod();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any, enforceShacl: true }, c);
    const res = await tools.assert_triples({
      sessionId: 's1', kind: 'sparql', jsonld: { '@graph': [] },
      provenance: { endpoints: ['https://dbpedia.org/sparql'] }, // no query
    });
    expect(res).toMatchObject({ error: 'shacl' });
    expect(pod.puts).toHaveLength(0);
    expect(c.shaclFailures.get('sparql')).toBe(1);
  });

  it('returns persistent error after 3 shacl failures for the same kind', async () => {
    const pod = recPod();
    const c = ctx();
    c.shaclFailures.set('sparql', 3);
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any, enforceShacl: true }, c);
    const res = await tools.assert_triples({
      sessionId: 's1', kind: 'sparql', jsonld: { '@graph': [] }, provenance: {},
    });
    expect(res).toMatchObject({ error: 'persistent' });
  });
});

describe('enforceShacl: true + session-meta merge', () => {
  // Concepts/Edits require `wasGeneratedBy → sh:class aleph:AlephSession`. The
  // typed session node lives in meta.ttl (a separate resource); the daemon
  // fetches and merges it so these cross-document constraints resolve.
  const concept = (extra: Record<string, unknown> = {}) => ({
    '@graph': [{
      '@id': 'g:Solid', '@type': 'Concept', prefLabel: { en: 'Solid' },
      wasGeneratedBy: 'g:s1', generatedAtTime: '2026-04-12T15:00:00Z', ...extra,
    }],
  });

  it('write_message conforms once the session meta is merged', async () => {
    const pod = recPodWithMeta();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any, enforceShacl: true }, c);
    const res = await tools.write_message({ sessionId: 's1', msgN: 3, body: 'hi' });
    expect(res).toMatchObject({ ok: true });
    expect(c.messageWritten).toBe(true);
  });

  it('assert_triples(web) with a provenanced concept conforms with merged meta', async () => {
    const pod = recPodWithMeta();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any, enforceShacl: true }, ctx());
    const res = await tools.assert_triples({
      sessionId: 's1', kind: 'web', jsonld: concept(),
      provenance: { derivedFrom: 'https://solidproject.org', searchQuery: 'solid' },
    });
    expect(res).toMatchObject({ ok: true });
    expect(pod.puts[0].path).toMatch(/^\/aleph\/assertions\/s1\/web_/);
  });

  it('blocks the same concept write when the session meta is absent', async () => {
    const pod = recPod(); // getResource → null, no session node to satisfy sh:class
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any, enforceShacl: true }, c);
    const res = await tools.assert_triples({
      sessionId: 's1', kind: 'web', jsonld: concept(),
      provenance: { derivedFrom: 'https://solidproject.org', searchQuery: 'solid' },
    });
    expect(res).toMatchObject({ error: 'shacl' });
    expect(pod.puts).toHaveLength(0);
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
