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

export interface ChatMessage {
  position: number;
  speaker: 'user' | 'agent';
  body: string;
  hint?: string;
  generatedAt?: string;
  session: string;
}

export interface ShaclEntry {
  shape: string;            // CURIE of shape IRI
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  label?: string;
}

export type FocusTripleKind = 'type' | 'literal' | 'iri';

export interface FocusTriple {
  predicate: string;        // CURIE-ish, e.g. "skos:prefLabel"
  object: string;           // display string
  kind: FocusTripleKind;
}

export interface Backlink {
  from: string;             // node id
  fromLabel: string;
  predicate: string;        // CURIE
  pretty: string;
  kind: NodeKind;
  via?: string;             // intermediate node label for 2-hop chains
}

export interface DemoGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  view: DemoView;
  sessions: DemoSession[];
  chat: ChatMessage[];
  shacl: ShaclEntry[];
  activeSession: string;    // sessions whose generatedBy is "highlighted"
  focusId: string;          // id of the central node for the view
  pretty: (predicate: string) => string;
  triplesFor: (id: string) => FocusTriple[];
  backlinksFor: (id: string) => Backlink[];
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

  // ── chat messages ────────────────────────────────────────
  const chat: ChatMessage[] = [];
  for (const [subj, qs] of store.bySubject) {
    const types = qs.filter((q) => q.predicate.value === PREFIXES.rdf + 'type').map((q) => q.object.value);
    if (!types.includes(PREFIXES.aleph + 'ChatMessage')) continue;
    const speakerRaw = store.oneObject(subj, 'aleph:speaker')?.value ?? 'agent';
    const speaker: ChatMessage['speaker'] = speakerRaw === 'user' ? 'user' : 'agent';
    const sessionIri = store.oneObject(subj, 'prov:wasGeneratedBy')?.value;
    chat.push({
      position: Number(store.oneObject(subj, 'aleph:position')?.value ?? 0),
      speaker,
      body: store.oneObject(subj, 'aleph:body')?.value ?? '',
      hint: store.oneObject(subj, 'aleph:hint')?.value,
      generatedAt: store.oneObject(subj, 'prov:generatedAtTime')?.value,
      session: sessionIri ? localName(sessionIri) : '',
    });
  }
  chat.sort((a, b) => a.position - b.position);

  // ── SHACL results ────────────────────────────────────────
  const shacl: ShaclEntry[] = [];
  for (const [subj, qs] of store.bySubject) {
    const types = qs.filter((q) => q.predicate.value === PREFIXES.rdf + 'type').map((q) => q.object.value);
    if (!types.includes(PREFIXES.aleph + 'ShaclResult')) continue;
    for (const r of store.objects(subj, 'aleph:result')) {
      const shapeIri = store.oneObject(r.value, 'aleph:shape')?.value;
      const status = (store.oneObject(r.value, 'aleph:status')?.value ?? 'pass') as ShaclEntry['status'];
      const detail = store.oneObject(r.value, 'aleph:detail')?.value ?? '';
      const labelOverride = store.oneObject(r.value, 'rdfs:label')?.value;
      shacl.push({
        shape: shapeIri ? localName(shapeIri) : '',
        status,
        detail,
        label: labelOverride,
      });
    }
  }

  // ── focus subject (central node for views) ───────────────
  const focusId = view.path[0] ?? [...nodeMap.values()][0]?.id ?? '';
  const focusIri = focusId ? PREFIXES[''] + focusId : '';

  const renderObject = (term: Term): { object: string; kind: FocusTripleKind } => {
    if (term.termType === 'Literal') {
      const lit = term as Term & { language?: string; datatype?: Term };
      const lang = lit.language;
      const dt = lit.datatype?.value;
      const v = JSON.stringify(term.value);
      if (lang) return { object: `${v}@${lang}`, kind: 'literal' };
      if (dt && dt !== PREFIXES.xsd + 'string') return { object: `${v}^^${shrink(dt)}`, kind: 'literal' };
      return { object: term.value, kind: 'literal' };
    }
    return { object: shrink(term.value), kind: 'iri' };
  };

  const triplesFor = (id: string): FocusTriple[] => {
    const iri = PREFIXES[''] + id;
    const out: FocusTriple[] = [];
    for (const q of store.bySubject.get(iri) ?? []) {
      const pCurie = shrink(q.predicate.value);
      // hide layout-only hints from the triples view
      if (pCurie === 'aleph:layoutX' || pCurie === 'aleph:layoutY') continue;
      if (q.predicate.value === PREFIXES.rdf + 'type') {
        out.push({ predicate: 'a', object: shrink(q.object.value), kind: 'type' });
      } else {
        const { object, kind } = renderObject(q.object);
        out.push({ predicate: pCurie, object, kind });
      }
    }
    return out;
  };

  const backlinksFor = (id: string): Backlink[] => {
    const direct = edges
      .filter((e) => e.o === id)
      .map<Backlink>((e) => {
        const src = nodeMap.get(PREFIXES[''] + e.s);
        return {
          from: e.s,
          fromLabel: src?.label ?? e.s,
          predicate: e.predicate,
          pretty: e.pretty,
          kind: src?.kind ?? 'concept',
        };
      });

    // 2-hop chains via skos:broader → skos:broader or skos:related → skos:broader
    const indirect: Backlink[] = [];
    for (const mid of edges.filter((e) => e.o === id && e.predicate === 'skos:broader')) {
      for (const leaf of edges.filter((e) => e.o === mid.s && e.predicate === 'skos:broader')) {
        const src = nodeMap.get(PREFIXES[''] + leaf.s);
        const via = nodeMap.get(PREFIXES[''] + mid.s);
        indirect.push({
          from: leaf.s,
          fromLabel: src?.label ?? leaf.s,
          predicate: 'skos:broader',
          pretty: 'broader',
          kind: src?.kind ?? 'concept',
          via: via?.label,
        });
      }
    }
    return [...direct, ...indirect];
  };

  const graph: DemoGraph = {
    nodes: [...nodeMap.values()],
    edges,
    view,
    sessions,
    chat,
    shacl,
    activeSession: 'Session_042',
    focusId,
    pretty: (p) => PRETTY_PREDICATE[shrink(p)] ?? shrink(p),
    triplesFor,
    backlinksFor,
    raw: demoTtl,
    source: DEMO_TTL_SOURCE,
    tripleCount: quads.length,
    byteSize: new TextEncoder().encode(demoTtl).length,
  };
  void focusIri;
  cached = graph;
  return graph;
}
