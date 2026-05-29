// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { Parser } from 'n3';
import { buildReplyDoc, buildClaimDoc, toTurtle, INLINE_CONTEXT } from '../../src/daemon/templates';

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
    expect(path).toBe('/aleph.wiki/sessions/Session_1/msg4.ttl');
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

describe('buildClaimDoc', () => {
  it('targets the session container as .ttl and mints concept @id from prefLabel', async () => {
    const built = buildClaimDoc({
      sessionId: '260529-001', ts: '20260529T100000', kind: 'imagined',
      now: '2026-05-29T10:00:00Z',
      concepts: [{ '@type': 'Concept', prefLabel: { en: 'Game Theory' },
                   definition: { en: 'Study of strategic interaction.' } }],
      provenance: {},
    });
    expect(built.path).toBe('/aleph.wiki/sessions/260529-001/claim_20260529T100000.ttl');

    const base = `http://localhost:3000${built.path}`;
    const qs = new Parser().parse(await toTurtle(built.validationDoc, base));
    const conceptIri = 'http://localhost:3000/aleph.wiki/sessions/260529-001/g/GameTheory';
    const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    const V = 'https://vocab.aleph.wiki/';
    // concept got a session-scoped g/<slug> IRI, not an empty @id
    expect(qs.some((q) => q.subject.value === conceptIri && q.predicate.value === RDF_TYPE && q.object.value === `${V}Concept`)).toBe(true);
    // the claim/provenance node is the document itself (@id "")
    expect(qs.some((q) => q.subject.value === base && q.predicate.value === RDF_TYPE && q.object.value === `${V}ImaginedAssertion`)).toBe(true);
  });
});
