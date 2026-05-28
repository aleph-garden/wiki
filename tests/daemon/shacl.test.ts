// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { ShaclValidator } from '../../src/daemon/shacl';
import { INLINE_CONTEXT } from '../../src/daemon/templates';

let v: ShaclValidator;
beforeAll(async () => { v = await ShaclValidator.load('vocab/aleph-shapes.ttl'); });

function webDoc(extra: Record<string, unknown> = {}) {
  return {
    '@context': INLINE_CONTEXT,
    '@graph': [{
      '@id': 'https://aleph.wiki/g/Session_1_turn3',
      '@type': 'WebSearchAssertion',
      'wasGeneratedBy': 'https://aleph.wiki/g/Session_1',
      'generatedAtTime': { '@value': '2026-05-28T10:00:00Z', '@type': 'http://www.w3.org/2001/XMLSchema#dateTime' },
      'derivedFrom': 'https://example.org/solid',
      ...extra,
    }],
  };
}

describe('ShaclValidator', () => {
  it('passes a WebSearchAssertion with derivedFrom', async () => {
    const r = await v.validateJsonLd(webDoc());
    expect(r.conforms).toBe(true);
  });

  it('fails a WebSearchAssertion missing derivedFrom', async () => {
    const doc = webDoc();
    delete (doc['@graph'][0] as Record<string, unknown>).derivedFrom;
    const r = await v.validateJsonLd(doc);
    expect(r.conforms).toBe(false);
    expect(r.results.join(' ')).toMatch(/derivedFrom/);
  });

  it('fails a SparqlAssertion missing query', async () => {
    const doc = {
      '@context': INLINE_CONTEXT,
      '@graph': [{
        '@id': 'https://aleph.wiki/g/Session_1_turn3',
        '@type': 'SparqlAssertion',
        'wasGeneratedBy': 'https://aleph.wiki/g/Session_1',
        'endpoints': 'https://dbpedia.org/sparql',
      }],
    };
    const r = await v.validateJsonLd(doc);
    expect(r.conforms).toBe(false);
    expect(r.results.join(' ')).toMatch(/query/);
  });

  it('passes a minimal ImaginedAssertion', async () => {
    const r = await v.validateJsonLd({
      '@context': INLINE_CONTEXT,
      '@graph': [{
        '@id': 'https://aleph.wiki/g/Session_1_turn3',
        '@type': 'ImaginedAssertion',
        'wasGeneratedBy': 'https://aleph.wiki/g/Session_1',
      }],
    });
    expect(r.conforms).toBe(true);
  });
});
