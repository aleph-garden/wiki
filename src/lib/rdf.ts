import init, { Store, namedNode, type Term } from 'oxigraph/web.js';
import { ref } from 'vue';
import { PodClient } from './pod';

export type PodStatus = 'connecting' | 'online' | 'offline' | 'reconnecting';
export const podStatus = ref<PodStatus>('connecting');

// Bumped on every successful load / reload. select()/ask() read this so any
// computed() that wraps a query auto-invalidates when the store mutates.
export const storeVersion = ref(0);

export const PREFIXES: Record<string, string> = {
  '': 'https://aleph.wiki/g/',
  aleph: 'https://vocab.aleph.wiki/',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  prov: 'http://www.w3.org/ns/prov#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  ldp: 'http://www.w3.org/ns/ldp#',
};

export const SPARQL_PREFIX_BLOCK = Object.entries(PREFIXES)
  .map(([pfx, ns]) => `PREFIX ${pfx}: <${ns}>`)
  .join('\n');

export const POD_BASE = (import.meta as any).env?.VITE_POD_BASE ?? 'http://localhost:3000';
export const POD_ROOT = '/aleph/';

let store: Store | null = null;
let ready: Promise<Store> | null = null;
let pod: PodClient | null = null;

export function getPod(): PodClient {
  if (!pod) pod = new PodClient(POD_BASE);
  return pod;
}

async function loadResource(s: Store, podClient: PodClient, path: string): Promise<void> {
  const ttl = await podClient.getResource(path);
  if (!ttl) return;
  const graphIri = podClient.baseUrl.replace(/\/$/, '') + path;
  s.load(ttl, {
    format: 'text/turtle',
    base_iri: graphIri,
    to_graph_name: namedNode(graphIri),
  });
}

async function loadContainer(s: Store, podClient: PodClient, path: string): Promise<void> {
  // listContainer returns absolute URLs; extract path component for recursive calls
  const entries = await podClient.listContainer(path);
  await Promise.all(entries.map(async (entry) => {
    // entry is a full URL like http://localhost:3000/aleph/foo.ttl
    const entryPath = new URL(entry).pathname;
    if (entry.endsWith('/')) {
      await loadContainer(s, podClient, entryPath);
    } else if (entry.endsWith('.ttl')) {
      await loadResource(s, podClient, entryPath);
    }
  }));
}

export function initStore(): Promise<Store> {
  if (ready) return ready;
  ready = (async () => {
    await init();
    const s = new Store();
    const p = getPod();
    try {
      await loadContainer(s, p, POD_ROOT);
      podStatus.value = 'online';
    } catch (err) {
      console.warn('pod load failed:', err);
      podStatus.value = 'offline';
    }
    store = s;
    storeVersion.value++;
    return s;
  })();
  return ready;
}

export function getStore(): Store {
  if (!store) throw new Error('RDF store not initialised — await initStore() first');
  return store;
}

export async function reloadResource(path: string): Promise<void> {
  const s = getStore();
  const p = getPod();
  const graphIri = p.baseUrl.replace(/\/$/, '') + path;
  // delete graph, re-load
  s.update(`DROP SILENT GRAPH <${graphIri}>`);
  await loadResource(s, p, path);
  storeVersion.value++;
}

export type Bindings = Map<string, Term>;

export function select(query: string): Bindings[] {
  // Touch the version ref so vue's reactivity system tracks this dependency
  // whenever select() is called from inside a computed().
  void storeVersion.value;
  const q = `${SPARQL_PREFIX_BLOCK}\n${query}`;
  const result = getStore().query(q);
  if (!Array.isArray(result)) {
    throw new Error('select() expects a SELECT query returning bindings');
  }
  return result as Bindings[];
}

export function ask(query: string): boolean {
  void storeVersion.value;
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

export function subscribePodChanges(onChange: (path: string) => void): () => void {
  const p = getPod();
  return p.subscribe(
    POD_ROOT,
    async (ev) => {
      podStatus.value = 'online';
      await reloadResource(ev.path);
      onChange(ev.path);
    },
    (s) => { podStatus.value = s; },
  );
}
