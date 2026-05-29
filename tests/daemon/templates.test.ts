// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { Parser } from 'n3';
import { buildReplyDoc, buildAssertionDoc, toTurtle, INLINE_CONTEXT } from '../../src/daemon/templates';

const V = 'https://vocab.aleph.wiki/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const PROV = 'http://www.w3.org/ns/prov#';

function quads(ttl: string) {
  return new Parser().parse(ttl);
}
const has = (qs: ReturnType<typeof quads>, s: RegExp | string, p: string, o?: RegExp | string) =>
  qs.some((q) =>
    (s instanceof RegExp ? s.test(q.subject.value) : q.subject.value === s) &&
    q.predicate.value === p &&
    (o === undefined || (o instanceof RegExp ? o.test(q.object.value) : q.object.value === o)));

describe('buildReplyDoc', () => {
  it('produces a .ttl msg{N+1} with an agent ChatMessage in the validation graph', () => {
    const { validationDoc, path } = buildReplyDoc({
      sessionId: 'Session_1', msgN: 3, body: 'Solid is a spec.', now: '2026-05-28T10:00:00Z',
    });
    expect(path).toBe('/aleph/sessions/Session_1/msg4.ttl');
    const chat = (validationDoc['@graph'] as any[]).find((n) => n['@type'] === 'ChatMessage');
    expect(chat.speaker).toBe('agent');
    expect(chat.position).toBe(4);
    expect(chat['@id']).toBe('g:Session_1_msg4');
    expect(validationDoc['@context']).toBe(INLINE_CONTEXT);
  });

  it('toTurtle emits the triples the chat query needs (full URIs, no context dependency)', async () => {
    const built = buildReplyDoc({
      sessionId: 'Session_1', msgN: 3, body: 'Solid is a spec.', now: '2026-05-28T10:00:00Z',
    });
    const base = `http://localhost:3000${built.path}`;
    const qs = quads(await toTurtle(built.validationDoc, base));
    const ID = 'https://aleph.wiki/g/Session_1_msg4';
    expect(has(qs, ID, RDF_TYPE, `${V}ChatMessage`)).toBe(true);
    expect(has(qs, ID, `${V}speaker`, 'agent')).toBe(true);
    expect(has(qs, ID, `${V}body`, 'Solid is a spec.')).toBe(true);
    expect(has(qs, ID, `${V}position`, '4')).toBe(true);
    expect(has(qs, ID, `${PROV}wasGeneratedBy`, 'https://aleph.wiki/g/Session_1')).toBe(true);
    // Edit node with @id "" resolves to the document URL.
    expect(has(qs, base, RDF_TYPE, `${V}Edit`)).toBe(true);
  });
});

describe('buildAssertionDoc', () => {
  it('builds a .ttl WebSearchAssertion with derivedFrom + searchQuery', async () => {
    const built = buildAssertionDoc({
      sessionId: 'Session_1', msgN: 3, kind: 'web', now: '2026-05-28T10:00:00Z', ts: '20260528T100000',
      jsonld: { '@graph': [{ '@id': 'g:Solid', '@type': 'Concept', prefLabel: { en: 'Solid' } }] },
      provenance: { derivedFrom: 'https://solidproject.org', searchQuery: 'what is solid' },
    });
    expect(built.path).toBe('/aleph/assertions/Session_1/web_20260528T100000.ttl');
    const base = `http://localhost:3000${built.path}`;
    const qs = quads(await toTurtle(built.validationDoc, base));
    expect(has(qs, base, RDF_TYPE, `${V}WebSearchAssertion`)).toBe(true);
    expect(has(qs, base, `${V}derivedFrom`, 'https://solidproject.org')).toBe(true);
    expect(has(qs, base, `${V}searchQuery`, 'what is solid')).toBe(true);
    expect(has(qs, base, `${PROV}wasGeneratedBy`, 'https://aleph.wiki/g/Session_1_turn3')).toBe(true);
    expect(has(qs, 'https://aleph.wiki/g/Solid', RDF_TYPE, `${V}Concept`)).toBe(true);
  });

  it('builds a SparqlAssertion header with query + endpoints', () => {
    const { validationDoc } = buildAssertionDoc({
      sessionId: 'Session_1', msgN: 3, kind: 'sparql', now: '2026-05-28T10:00:00Z', ts: 't',
      jsonld: { '@graph': [] },
      provenance: { query: 'SELECT * WHERE {?s ?p ?o}', endpoints: ['https://dbpedia.org/sparql'] },
    });
    const act = (validationDoc['@graph'] as any[]).find((n) => n['@type'] === 'SparqlAssertion');
    expect(act.query).toContain('SELECT');
    expect(act.endpoints).toEqual(['https://dbpedia.org/sparql']);
  });

  it('builds a minimal ImaginedAssertion header', () => {
    const { validationDoc } = buildAssertionDoc({
      sessionId: 'Session_1', msgN: 3, kind: 'imagined', now: '2026-05-28T10:00:00Z', ts: 't',
      jsonld: { '@graph': [] }, provenance: {},
    });
    const act = (validationDoc['@graph'] as any[]).find((n) => n['@type'] === 'ImaginedAssertion');
    expect(act.wasGeneratedBy).toBe('g:Session_1_turn3');
    expect(act.derivedFrom).toBeUndefined();
  });
});
