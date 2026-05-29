// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildReplyDoc, buildAssertionDoc, INLINE_CONTEXT } from '../../src/daemon/templates';

describe('buildReplyDoc', () => {
  it('produces msg{N+1} with agent speaker and relative context in pod body', () => {
    const { validationDoc, podBody, path } = buildReplyDoc({
      sessionId: 'Session_1', msgN: 3, body: 'Solid is a spec.', now: '2026-05-28T10:00:00Z',
    });
    expect(path).toBe('/aleph/sessions/Session_1/msg4.jsonld');
    const chat = (validationDoc['@graph'] as any[]).find((n) => n['@type'] === 'ChatMessage');
    expect(chat.speaker).toBe('agent');
    expect(chat.position).toBe(4);
    expect(chat['@id']).toBe('g:Session_1_msg4');
    expect(validationDoc['@context']).toBe(INLINE_CONTEXT);
    expect(JSON.parse(podBody)['@context']).toBe('./context.jsonld');
  });
});

describe('buildAssertionDoc', () => {
  it('builds a WebSearchAssertion header with derivedFrom + searchQuery', () => {
    const { validationDoc, podBody, path } = buildAssertionDoc({
      sessionId: 'Session_1', msgN: 3, kind: 'web', now: '2026-05-28T10:00:00Z', ts: '20260528T100000',
      jsonld: { '@graph': [{ '@id': 'g:Solid', '@type': 'Concept', prefLabel: { en: 'Solid' } }] },
      provenance: { derivedFrom: 'https://solidproject.org', searchQuery: 'what is solid' },
    });
    expect(path).toBe('/aleph/assertions/Session_1/web_20260528T100000.jsonld');
    const act = (validationDoc['@graph'] as any[]).find((n) => n['@type'] === 'WebSearchAssertion');
    expect(act.derivedFrom).toBe('https://solidproject.org');
    expect(act.searchQuery).toBe('what is solid');
    expect(act.wasGeneratedBy).toBe('g:Session_1_turn3');
    expect((validationDoc['@graph'] as any[]).some((n) => n['@id'] === 'g:Solid')).toBe(true);
    expect(JSON.parse(podBody)['@context']).toBe('./context.jsonld');
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
