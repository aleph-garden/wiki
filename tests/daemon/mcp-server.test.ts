// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTools } from '../../src/daemon/mcp/server';
import { ShaclValidator } from '../../src/daemon/shacl';
import type { RunContext } from '../../src/daemon/types';

let validator: ShaclValidator;
beforeEach(async () => { validator = await ShaclValidator.load('vocab/aleph-shapes.ttl'); });

function ctx(): RunContext {
  return { sessionId: 's1', msgN: 3, messageWritten: false };
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
    const res = await tools.write_message({ msgN: 3, body: 'hi' });
    expect(res).toMatchObject({ ok: true, path: '/aleph/sessions/s1/msg4.ttl' });
    expect(pod.puts[0].path).toBe('/aleph/sessions/s1/msg4.ttl');
    // Body is now Turtle with full URIs (JSS can't serve JSON-LD as Turtle).
    expect(pod.puts[0].body).toMatch(/aleph\.wiki\/g\/s1_msg4/);
    expect(pod.puts[0].body).toMatch(/vocab\.aleph\.wiki\/ChatMessage/);
    expect(c.messageWritten).toBe(true);
  });

  it('write_message ignores any agent-supplied sessionId and uses the run session', async () => {
    const pod = recPod();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, c);
    // @ts-expect-error — sessionId is no longer part of the input type
    await tools.write_message({ sessionId: 'EVIL', msgN: 3, body: 'hi' });
    expect(pod.puts[0].path).toBe('/aleph/sessions/s1/msg4.ttl');
  });

  it('assert_claim has no sessionId parameter (compile-time enforced)', async () => {
    const pod = recPod();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, c);
    await tools.assert_claim({
      // @ts-expect-error — sessionId is not part of assert_claim's input
      sessionId: 'EVIL',
      kind: 'imagined',
      concepts: [{ '@type': 'Concept', prefLabel: { en: 'X' } }],
      provenance: {},
    });
    expect(pod.puts[0].path).toMatch(/^\/aleph\/sessions\/s1\/claim_/);
  });
});

describe('assert_claim tool (advisory SHACL — default)', () => {
  it('web kind with derivedFrom writes a file and a WebSearchAssertion header', async () => {
    const pod = recPod();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, ctx());
    const res = await tools.assert_claim({
      kind: 'web',
      concepts: [{ '@type': 'Concept', prefLabel: { en: 'Solid' } }],
      provenance: { derivedFrom: 'https://solidproject.org', searchQuery: 'solid' },
    });
    expect(res).toMatchObject({ ok: true });
    expect(pod.puts[0].path).toMatch(/^\/aleph\/sessions\/s1\/claim_/);
  });

  it('still writes when SHACL would not conform (validation is advisory)', async () => {
    const pod = recPod();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, c);
    const res = await tools.assert_claim({
      kind: 'sparql',
      concepts: [],
      provenance: { endpoints: ['https://dbpedia.org/sparql'] }, // no query
    });
    expect(res).toMatchObject({ ok: true });
    expect(pod.puts).toHaveLength(1);
  });

  it('assert_claim writes into the run session container', async () => {
    const pod = recPod();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any }, c);
    const res = await tools.assert_claim({
      kind: 'imagined',
      concepts: [{ '@type': 'Concept', prefLabel: { en: 'Game Theory' } }],
      provenance: {},
    });
    expect(res).toMatchObject({ ok: true });
    expect(pod.puts[0].path).toMatch(/^\/aleph\/sessions\/s1\/claim_/);
    expect(pod.puts[0].body).toMatch(/sessions\/s1\/g\/GameTheory/);
  });
});

describe('assert_claim tool (enforceShacl: true)', () => {
  it('blocks the write on a SHACL violation', async () => {
    const pod = recPod();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any, enforceShacl: true }, c);
    const res = await tools.assert_claim({
      kind: 'sparql',
      concepts: [],
      provenance: { endpoints: ['https://dbpedia.org/sparql'] }, // no query
    });
    expect(res).toMatchObject({ error: 'shacl' });
    expect(pod.puts).toHaveLength(0);
  });
});

describe('enforceShacl: true + session-meta merge', () => {
  // Concepts/Edits require `wasGeneratedBy → sh:class aleph:AlephSession`. The
  // typed session node lives in meta.ttl (a separate resource); the daemon
  // fetches and merges it so these cross-document constraints resolve.

  it('write_message conforms once the session meta is merged', async () => {
    const pod = recPodWithMeta();
    const c = ctx();
    const tools = makeTools({ pod: pod as any, validator, sparql: {} as any, enforceShacl: true }, c);
    const res = await tools.write_message({ msgN: 3, body: 'hi' });
    expect(res).toMatchObject({ ok: true });
    expect(c.messageWritten).toBe(true);
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
