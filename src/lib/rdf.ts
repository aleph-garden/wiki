import init, { Store, type Term } from 'oxigraph/web.js';
import { ref } from 'vue';
import { PodClient } from './pod';
import { getPodBase } from './pod-config';
import { conceptContainers } from './typeindex';

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

export const POD_ROOT = '/aleph/';

let store: Store | null = null;
let ready: Promise<Store> | null = null;
let pod: PodClient | null = null;

export function getPod(): PodClient {
  if (!pod) pod = new PodClient(getPodBase());
  return pod;
}

// File extensions oxigraph can parse. JSS (--conneg) translates each to
// turtle on GET, so we only need extensions to skip non-RDF container
// entries during scan.
const RDF_EXTS = ['.ttl', '.nt', '.nq', '.trig', '.jsonld', '.json', '.rdf', '.xml'];

function isRdfPath(path: string): boolean {
  return RDF_EXTS.some((ext) => path.endsWith(ext));
}

async function loadResource(s: Store, podClient: PodClient, path: string): Promise<void> {
  console.log(`[rdf] loadResource ${path}`);
  let body: string | null;
  try {
    body = await podClient.getResource(path);
  } catch (e) {
    console.warn(`[rdf] fetch failed ${path}:`, e);
    return;
  }
  if (!body) { console.log(`[rdf] no body ${path}`); return; }
  const graphIri = podClient.baseUrl.replace(/\/$/, '') + path;
  try {
    s.load(body, { format: 'text/turtle', base_iri: graphIri });
  } catch (e) {
    console.warn(`[rdf] parse failed ${path}:`, e);
  }
}

async function loadContainer(s: Store, podClient: PodClient, path: string): Promise<void> {
  // listContainer returns absolute URLs; extract path component for recursive calls
  const entries = await podClient.listContainer(path);
  console.log(`[rdf] loadContainer ${path} → ${entries.length} entries:`, entries);
  await Promise.all(entries.map(async (entry) => {
    const entryPath = new URL(entry).pathname;
    if (entry.endsWith('/')) {
      await loadContainer(s, podClient, entryPath);
    } else if (isRdfPath(entryPath)) {
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
      for (const c of await conceptContainers(p)) {
        if (!c.startsWith(POD_ROOT)) await loadContainer(s, p, c);
      }
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
  // Default-graph mode: just re-load. RDF set semantics dedupes identical
  // triples. For mutation (amend/retract) we'd need triple-level diff which
  // is out of scope for v1.
  await loadResource(s, p, path);
  storeVersion.value++;
}

// Re-scan an entire container subtree. Useful after a PUT that creates new
// resources or implies new container listings (which we'd otherwise miss
// unless a WS notification arrives).
export async function reloadContainer(path: string): Promise<void> {
  const s = getStore();
  const p = getPod();
  await loadContainer(s, p, path);
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
      // JSS publishes `pub <containerUrl>` to every ancestor subscriber, not
      // the originally-changed file. A path ending in "/" means "something
      // under this container changed" → re-scan the container.
      if (ev.path.endsWith('/')) {
        await reloadContainer(ev.path);
      } else {
        await reloadResource(ev.path);
      }
      onChange(ev.path);
    },
    (s) => { podStatus.value = s; },
  );
}
