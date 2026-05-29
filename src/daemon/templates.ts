// Inlined JSON-LD context — same terms as vocab/aleph-context.jsonld, embedded
// so SHACL validation never has to dereference the relative ./context.jsonld.
// TODO: no test currently guards INLINE_CONTEXT against drift from
// vocab/aleph-context.jsonld — a term added there but not here would let
// malformed triples validate silently. Add a sync check in a follow-up.
export const INLINE_CONTEXT: Record<string, unknown> = {
  aleph: 'https://vocab.aleph.wiki/',
  prov: 'http://www.w3.org/ns/prov#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  g: 'https://aleph.wiki/g/',
  ChatMessage: 'aleph:ChatMessage',
  Concept: 'aleph:Concept',
  Edit: 'aleph:Edit',
  WebSearchAssertion: 'aleph:WebSearchAssertion',
  SparqlAssertion: 'aleph:SparqlAssertion',
  ImaginedAssertion: 'aleph:ImaginedAssertion',
  position: { '@id': 'aleph:position', '@type': 'xsd:integer' },
  speaker: { '@id': 'aleph:speaker' },
  body: { '@id': 'aleph:body' },
  editKind: { '@id': 'aleph:editKind' },
  derivedFrom: { '@id': 'aleph:derivedFrom', '@type': '@id' },
  searchQuery: { '@id': 'aleph:searchQuery' },
  query: { '@id': 'aleph:query' },
  endpoints: { '@id': 'aleph:endpoints' },
  prefLabel: { '@id': 'skos:prefLabel', '@container': '@language' },
  broader: { '@id': 'skos:broader', '@type': '@id' },
  related: { '@id': 'skos:related', '@type': '@id' },
  wasGeneratedBy: { '@id': 'prov:wasGeneratedBy', '@type': '@id' },
  generatedAtTime: { '@id': 'prov:generatedAtTime', '@type': 'xsd:dateTime' },
};

export interface ReplyInput {
  sessionId: string;
  msgN: number;
  body: string;
  now: string;
}

export interface BuiltDoc {
  /** Inline-context JSON-LD for SHACL validation. */
  validationDoc: Record<string, unknown>;
  /** Serialized JSON-LD for PUT, using the relative ./context.jsonld. */
  podBody: string;
  /** Pod path to PUT to. */
  path: string;
}

function podSerialize(graph: unknown[]): string {
  return JSON.stringify({ '@context': './context.jsonld', '@graph': graph });
}

export function buildReplyDoc(input: ReplyInput): BuiltDoc {
  const { sessionId, msgN, body, now } = input;
  const next = msgN + 1;
  const graph = [
    {
      '@id': `g:${sessionId}_msg${next}`,
      '@type': 'ChatMessage',
      position: next,
      speaker: 'agent',
      body,
      wasGeneratedBy: `g:${sessionId}`,
      generatedAtTime: now,
    },
    {
      '@id': '',
      '@type': 'Edit',
      editKind: 'create',
      wasGeneratedBy: `g:${sessionId}`,
      generatedAtTime: now,
    },
  ];
  return {
    validationDoc: { '@context': INLINE_CONTEXT, '@graph': graph },
    podBody: podSerialize(graph),
    path: `/aleph/sessions/${sessionId}/msg${next}.jsonld`,
  };
}

export type AssertionKind = 'web' | 'sparql' | 'imagined';

export interface AssertionProvenance {
  derivedFrom?: string;
  searchQuery?: string;
  query?: string;
  endpoints?: string[];
}

export interface AssertionInput {
  sessionId: string;
  msgN: number;
  kind: AssertionKind;
  now: string;
  ts: string;
  jsonld: { '@graph'?: unknown[] };
  provenance: AssertionProvenance;
}

const KIND_TYPE: Record<AssertionKind, string> = {
  web: 'WebSearchAssertion',
  sparql: 'SparqlAssertion',
  imagined: 'ImaginedAssertion',
};

export function buildAssertionDoc(input: AssertionInput): BuiltDoc {
  const { sessionId, msgN, kind, now, ts, jsonld, provenance } = input;
  const header: Record<string, unknown> = {
    '@id': '',
    '@type': KIND_TYPE[kind],
    wasGeneratedBy: `g:${sessionId}_turn${msgN}`,
    generatedAtTime: now,
  };
  if (kind === 'web') {
    if (provenance.derivedFrom) header.derivedFrom = provenance.derivedFrom;
    if (provenance.searchQuery) header.searchQuery = provenance.searchQuery;
  } else if (kind === 'sparql') {
    if (provenance.query) header.query = provenance.query;
    if (provenance.endpoints) header.endpoints = provenance.endpoints;
  }
  const graph = [header, ...(jsonld['@graph'] ?? [])];
  return {
    validationDoc: { '@context': INLINE_CONTEXT, '@graph': graph },
    podBody: podSerialize(graph),
    path: `/aleph/assertions/${sessionId}/${kind}_${ts}.jsonld`,
  };
}
