import { Parser, type Quad, type Term } from 'n3';
import demoTtl from '../../data/demo-game-theory.ttl?raw';

export type NodeKind = 'concept' | 'person' | 'event';

export interface GraphNode {
  id: string;             // IRI local-name, e.g. "GameTheory"
  iri: string;            // full IRI
  label: string;
  kind: NodeKind;
  importance: number;
  x: number;
  y: number;
  generatedBy?: string;   // session id, e.g. "Session_042"
}

export interface GraphEdge {
  s: string;
  o: string;
  predicate: string;      // CURIE-ish, e.g. "skos:broader"
  pretty: string;
}

export interface EdgeNote {
  from: string;
  to: string;
  label: string;
  cite?: string;
}

export interface PathNote {
  atConcept: string;
  text: string;
}

export interface Suggestion {
  target: string;
  reason: string;
}

export interface DemoView {
  question: string;
  path: string[];           // node ids in order
  trail: string[];          // upper labels
  edgeNotes: EdgeNote[];
  pathNotes: PathNote[];
  suggestions: Suggestion[];
}

export interface DemoSession {
  id: string;
  label: string;
  agent: string;
  focus: string;
  startedAt: string;
  endedAt?: string;
  conceptCount: number;
}

export interface DemoGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  view: DemoView;
  sessions: DemoSession[];
  activeSession: string;    // sessions whose generatedBy is "highlighted"
  pretty: (predicate: string) => string;
  raw: string;              // verbatim TTL source
  source: string;           // human-friendly filename
  tripleCount: number;      // number of parsed quads
  byteSize: number;         // utf-8 byte length of raw
}

export const DEMO_TTL_SOURCE = 'demo-game-theory.ttl';
export const DEMO_TTL_RAW = demoTtl;

// ── prefix table — mirrors the TTL @prefix block ────────────
const PREFIXES: Record<string, string> = {
  '': 'https://aleph.wiki/g/',
  aleph: 'https://vocab.aleph.wiki/',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  prov: 'http://www.w3.org/ns/prov#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

function shrink(iri: string): string {
  for (const [pfx, ns] of Object.entries(PREFIXES)) {
    if (iri.startsWith(ns)) return pfx ? `${pfx}:${iri.slice(ns.length)}` : iri.slice(ns.length);
  }
  return iri;
}

function localName(iri: string): string {
  const s = iri.lastIndexOf('/');
  const h = iri.lastIndexOf('#');
  return iri.slice(Math.max(s, h) + 1);
}

const PRETTY_PREDICATE: Record<string, string> = {
  'aleph:derivedFrom':    'derived from',
  'aleph:requires':       'requires',
  'aleph:exemplifies':    'exemplifies',
  'skos:broader':         'broader',
  'skos:related':         'related to',
  'prov:wasAttributedTo': 'attributed to',
};

// ── minimal indexed store on top of n3 quads ───────────────
class Store {
  bySubject = new Map<string, Quad[]>();

  constructor(quads: Quad[]) {
    for (const q of quads) {
      const k = q.subject.value;
      const arr = this.bySubject.get(k);
      if (arr) arr.push(q);
      else this.bySubject.set(k, [q]);
    }
  }

  out(subject: string, predicate: string): Quad[] {
    const ns = PREFIXES.aleph;
    const skos = PREFIXES.skos;
    const prov = PREFIXES.prov;
    const rdfs = PREFIXES.rdfs;
    const rdf = PREFIXES.rdf;
    const map: Record<string, string> = {
      'aleph:': ns, 'skos:': skos, 'prov:': prov, 'rdfs:': rdfs, 'rdf:': rdf,
    };
    let full = predicate;
    for (const [pfx, ns2] of Object.entries(map)) {
      if (predicate.startsWith(pfx)) { full = ns2 + predicate.slice(pfx.length); break; }
    }
    return (this.bySubject.get(subject) ?? []).filter((q) => q.predicate.value === full);
  }

  oneObject(subject: string, predicate: string): Term | undefined {
    return this.out(subject, predicate)[0]?.object;
  }

  objects(subject: string, predicate: string): Term[] {
    return this.out(subject, predicate).map((q) => q.object);
  }

  // resolve rdf:List head into ordered terms
  list(head: Term): Term[] {
    const out: Term[] = [];
    let cur: Term = head;
    const NIL = PREFIXES.rdf + 'nil';
    while (cur.value !== NIL) {
      const first = this.oneObject(cur.value, 'rdf:first');
      const rest = this.oneObject(cur.value, 'rdf:rest');
      if (!first || !rest) break;
      out.push(first);
      cur = rest;
    }
    return out;
  }
}

// ── main loader ────────────────────────────────────────────
let cached: DemoGraph | null = null;

export function loadDemoGraph(): DemoGraph {
  if (cached) return cached;

  const parser = new Parser({ baseIRI: PREFIXES[''] });
  const quads = parser.parse(demoTtl);
  const store = new Store(quads);

  // ── collect nodes (any subject typed as Concept/Person/Event)
  const NODE_TYPES = new Set([
    PREFIXES.aleph + 'Concept',
    PREFIXES.aleph + 'ImportantConcept',
    PREFIXES.aleph + 'Person',
    PREFIXES.aleph + 'Event',
    PREFIXES.foaf + 'Person',
  ]);

  const nodeMap = new Map<string, GraphNode>();
  for (const [subj, quads] of store.bySubject) {
    const types = quads
      .filter((q) => q.predicate.value === PREFIXES.rdf + 'type')
      .map((q) => q.object.value);
    if (!types.some((t) => NODE_TYPES.has(t))) continue;
    if (!subj.startsWith(PREFIXES[''])) continue; // ignore vocab-internal subjects

    const kind: NodeKind = types.includes(PREFIXES.aleph + 'Person') || types.includes(PREFIXES.foaf + 'Person')
      ? 'person'
      : types.includes(PREFIXES.aleph + 'Event')
        ? 'event'
        : 'concept';

    const label = store.oneObject(subj, 'skos:prefLabel')?.value
              ?? store.oneObject(subj, 'rdfs:label')?.value
              ?? localName(subj);

    const importance = Number(store.oneObject(subj, 'aleph:perceivedImportance')?.value ?? 0.5);
    const x = Number(store.oneObject(subj, 'aleph:layoutX')?.value ?? 0);
    const y = Number(store.oneObject(subj, 'aleph:layoutY')?.value ?? 0);
    const genBy = store.oneObject(subj, 'prov:wasGeneratedBy')?.value;

    nodeMap.set(subj, {
      id: localName(subj),
      iri: subj,
      label,
      kind,
      importance,
      x,
      y,
      generatedBy: genBy ? localName(genBy) : undefined,
    });
  }

  // ── collect edges (relations between known nodes) ─────────
  const EDGE_PREDICATES = [
    'aleph:derivedFrom',
    'aleph:requires',
    'aleph:exemplifies',
    'skos:broader',
    'skos:related',
    'prov:wasAttributedTo',
  ];

  const edges: GraphEdge[] = [];
  for (const subj of nodeMap.keys()) {
    for (const pred of EDGE_PREDICATES) {
      for (const obj of store.objects(subj, pred)) {
        if (nodeMap.has(obj.value)) {
          edges.push({
            s: localName(subj),
            o: localName(obj.value),
            predicate: pred,
            pretty: PRETTY_PREDICATE[pred] ?? pred,
          });
        }
      }
    }
  }

  // ── view ────────────────────────────────────────────────
  const viewSubj = [...store.bySubject.keys()].find((s) => {
    const ts = store.objects(s, 'rdf:type').map((t) => t.value);
    return ts.includes(PREFIXES.aleph + 'View');
  });

  let view: DemoView = {
    question: '',
    path: [],
    trail: [],
    edgeNotes: [],
    pathNotes: [],
    suggestions: [],
  };

  if (viewSubj) {
    view.question = store.oneObject(viewSubj, 'aleph:question')?.value ?? '';

    const trailHead = store.oneObject(viewSubj, 'aleph:trail');
    if (trailHead) view.trail = store.list(trailHead).map((t) => t.value);

    const pathHead = store.oneObject(viewSubj, 'aleph:path');
    if (pathHead) view.path = store.list(pathHead).map((t) => localName(t.value));

    for (const en of store.objects(viewSubj, 'aleph:edgeNote')) {
      const from = store.oneObject(en.value, 'aleph:from')?.value;
      const to = store.oneObject(en.value, 'aleph:to')?.value;
      const label = store.oneObject(en.value, 'rdfs:label')?.value ?? '';
      const cite = store.oneObject(en.value, 'aleph:cite')?.value;
      if (from && to) {
        view.edgeNotes.push({ from: localName(from), to: localName(to), label, cite });
      }
    }
    for (const pn of store.objects(viewSubj, 'aleph:pathNote')) {
      const at = store.oneObject(pn.value, 'aleph:atConcept')?.value;
      const text = store.oneObject(pn.value, 'aleph:noteText')?.value ?? '';
      if (at) view.pathNotes.push({ atConcept: localName(at), text });
    }
    for (const sg of store.objects(viewSubj, 'aleph:suggestion')) {
      const target = store.oneObject(sg.value, 'aleph:target')?.value;
      const reason = store.oneObject(sg.value, 'aleph:reason')?.value ?? '';
      if (target) view.suggestions.push({ target: localName(target), reason });
    }
  }

  // ── sessions ────────────────────────────────────────────
  const sessions: DemoSession[] = [];
  for (const [subj, qs] of store.bySubject) {
    const types = qs.filter((q) => q.predicate.value === PREFIXES.rdf + 'type').map((q) => q.object.value);
    if (!types.includes(PREFIXES.aleph + 'AlephSession')) continue;
    const agentTerm = store.objects(subj, 'prov:wasAssociatedWith')
      .map((t) => store.oneObject(t.value, 'rdfs:label')?.value)
      .find((v) => v && v.startsWith('Claude'));
    sessions.push({
      id: localName(subj),
      label: store.oneObject(subj, 'rdfs:label')?.value ?? localName(subj),
      agent: agentTerm ?? '—',
      focus: store.oneObject(subj, 'aleph:focus')?.value ?? '',
      startedAt: store.oneObject(subj, 'prov:startedAtTime')?.value ?? '',
      endedAt: store.oneObject(subj, 'prov:endedAtTime')?.value,
      conceptCount: Number(store.oneObject(subj, 'aleph:conceptCount')?.value ?? 0),
    });
  }
  sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const graph: DemoGraph = {
    nodes: [...nodeMap.values()],
    edges,
    view,
    sessions,
    activeSession: 'Session_042',
    pretty: (p) => PRETTY_PREDICATE[shrink(p)] ?? shrink(p),
    raw: demoTtl,
    source: DEMO_TTL_SOURCE,
    tripleCount: quads.length,
    byteSize: new TextEncoder().encode(demoTtl).length,
  };
  cached = graph;
  return graph;
}
