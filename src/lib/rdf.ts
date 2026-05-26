import init, { Store, type Term } from 'oxigraph/web.js';
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

// All RDF serializations oxigraph can parse. Mapping covers both file
// extensions (for early-skip during container scan) and the
// Content-Type the server returns at fetch time.
const FORMAT_BY_EXT: Record<string, string> = {
  '.ttl':    'text/turtle',
  '.nt':     'application/n-triples',
  '.nq':     'application/n-quads',
  '.trig':   'application/trig',
  '.jsonld': 'application/ld+json',
  '.json':   'application/ld+json',
  '.rdf':    'application/rdf+xml',
  '.xml':    'application/rdf+xml',
};
const RDF_CONTENT_TYPES = new Set(Object.values(FORMAT_BY_EXT));

function formatForPath(path: string): string | null {
  for (const [ext, mime] of Object.entries(FORMAT_BY_EXT)) {
    if (path.endsWith(ext)) return mime;
  }
  return null;
}

async function loadResource(s: Store, podClient: PodClient, path: string): Promise<void> {
  console.log(`[rdf] loadResource ${path}`);
  let fetched;
  try {
    fetched = await podClient.getResourceWithType(path);
  } catch (e) {
    console.warn(`[rdf] fetch failed ${path}:`, e);
    return;
  }
  if (!fetched) { console.log(`[rdf] no body ${path}`); return; }
  console.log(`[rdf] fetched ${path} content-type=${fetched.contentType} bytes=${fetched.body.length}`);
  // Prefer the server's Content-Type — that's authoritative. Fall back to
  // the extension if the server didn't send one we recognise.
  const format = RDF_CONTENT_TYPES.has(fetched.contentType)
    ? fetched.contentType
    : formatForPath(path);
  if (!format) {
    console.warn(`[rdf] no parser for ${path} (content-type=${fetched.contentType})`);
    return;
  }
  const graphIri = podClient.baseUrl.replace(/\/$/, '') + path;

  // JSON-LD with an external @context URL: oxigraph won't resolve it on its
  // own in the browser, so we pre-expand via jsonld.js and feed the result
  // as N-Quads (which oxigraph definitely understands).
  if (format === 'application/ld+json') {
    try {
      const jsonld = (await import('jsonld')).default as any;
      const doc = JSON.parse(fetched.body);
      // Document loader that follows relative @context URLs via the pod.
      const documentLoader = async (url: string) => {
        const res = await fetch(url, { headers: { Accept: 'application/ld+json' } });
        if (!res.ok) throw new Error(`context fetch ${url} → ${res.status}`);
        const body = await res.json();
        return { contextUrl: null, documentUrl: url, document: body };
      };
      const nquads = await jsonld.toRDF(doc, {
        base: graphIri,
        format: 'application/n-quads',
        documentLoader,
      });
      const before = s.size;
      s.load(nquads, { format: 'application/n-quads' });
      const added = s.size - before;
      console.log(`[rdf] ${path} → ${added} quads from jsonld (nquads bytes=${(nquads as string).length})`);
      if (added === 0 && (nquads as string).length < 10) {
        console.warn(`[rdf] jsonld expansion empty — context loader output:`, (nquads as string).slice(0, 200));
      }
    } catch (e) {
      console.warn(`[rdf] jsonld expand failed ${path}:`, e);
    }
    return;
  }

  try {
    s.load(fetched.body, {
      format,
      base_iri: graphIri,
    });
  } catch (e) {
    console.warn(`[rdf] parse failed ${path} (format=${format}):`, e);
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
    } else if (formatForPath(entryPath)) {
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
