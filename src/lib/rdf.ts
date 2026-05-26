import init, { Store, type Term } from 'oxigraph/web.js';
import demoTtl from '../../data/demo-game-theory.ttl?raw';

export const PREFIXES: Record<string, string> = {
  '': 'https://aleph.wiki/g/',
  aleph: 'https://vocab.aleph.wiki/',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  prov: 'http://www.w3.org/ns/prov#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

export const SPARQL_PREFIX_BLOCK = Object.entries(PREFIXES)
  .map(([pfx, ns]) => `PREFIX ${pfx}: <${ns}>`)
  .join('\n');

export const DEMO_TTL_SOURCE = 'demo-game-theory.ttl';
export const DEMO_TTL_RAW = demoTtl;

let store: Store | null = null;
let ready: Promise<Store> | null = null;

export function initStore(): Promise<Store> {
  if (ready) return ready;
  ready = (async () => {
    await init();
    const s = new Store();
    s.load(demoTtl, { format: 'text/turtle', base_iri: PREFIXES[''] });
    store = s;
    return s;
  })();
  return ready;
}

export function getStore(): Store {
  if (!store) throw new Error('RDF store not initialised — await initStore() first');
  return store;
}

export type Bindings = Map<string, Term>;

export function select(query: string): Bindings[] {
  const q = `${SPARQL_PREFIX_BLOCK}\n${query}`;
  const result = getStore().query(q);
  if (!Array.isArray(result)) {
    throw new Error('select() expects a SELECT query returning bindings');
  }
  return result as Bindings[];
}

export function ask(query: string): boolean {
  const q = `${SPARQL_PREFIX_BLOCK}\n${query}`;
  const result = getStore().query(q);
  if (typeof result !== 'boolean') {
    throw new Error('ask() expects an ASK query');
  }
  return result;
}

export function shrink(iri: string): string {
  for (const [pfx, ns] of Object.entries(PREFIXES)) {
    if (iri.startsWith(ns)) return pfx ? `${pfx}:${iri.slice(ns.length)}` : iri.slice(ns.length);
  }
  return iri;
}

export function localName(iri: string): string {
  const s = iri.lastIndexOf('/');
  const h = iri.lastIndexOf('#');
  return iri.slice(Math.max(s, h) + 1);
}

