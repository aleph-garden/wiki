import { computed, ref, unref, type MaybeRef, type Ref } from 'vue';
import { PREFIXES, localName, select, shrink, type Bindings } from './rdf';
import type { Term } from 'oxigraph/web.js';

import nodeCount from '../queries/node-count.sparql?raw';
import edgeCount from '../queries/edge-count.sparql?raw';
import focusNode from '../queries/focus-node.sparql?raw';
import triplesForSubject from '../queries/triples-for-subject.sparql?raw';
import backlinksForSubject from '../queries/backlinks-for-subject.sparql?raw';
import shaclResults from '../queries/shacl-results.sparql?raw';
import defaultFocus from '../queries/default-focus.sparql?raw';
import allNodes from '../queries/all-nodes.sparql?raw';
import allEdges from '../queries/all-edges.sparql?raw';
import viewTrail from '../queries/view-trail.sparql?raw';
import viewPath from '../queries/view-path.sparql?raw';
import viewEdgeNotes from '../queries/view-edge-notes.sparql?raw';
import viewPathNotes from '../queries/view-path-notes.sparql?raw';
import viewQuestion from '../queries/view-question.sparql?raw';
import viewSuggestions from '../queries/view-suggestions.sparql?raw';
import activeSession from '../queries/active-session.sparql?raw';
import sessions from '../queries/sessions.sparql?raw';
import chat from '../queries/chat.sparql?raw';

// Central catalog. Add a new .sparql file under src/queries/ and register it here.
// Each entry is the raw query body — PREFIX declarations are auto-prepended by select().
export const QUERIES = {
  nodeCount,
  edgeCount,
  focusNode,
  triplesForSubject,
  backlinksForSubject,
  shaclResults,
  defaultFocus,
  allNodes,
  allEdges,
  viewTrail,
  viewPath,
  viewEdgeNotes,
  viewPathNotes,
  viewQuestion,
  viewSuggestions,
  activeSession,
  sessions,
  chat,
} as const;

export type QueryKey = keyof typeof QUERIES;

export type Params = Record<string, string | number | undefined>;

// Substitute {{var}} placeholders. Values must be SPARQL-safe (use iri()/lit() helpers).
export function render(name: QueryKey, params: Params = {}): string {
  let q: string = QUERIES[name];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    q = q.replaceAll(`{{${k}}}`, String(v));
  }
  return q;
}

const PRETTY_PREDICATE: Record<string, string> = {
  'aleph:derivedFrom':    'derived from',
  'aleph:requires':       'requires',
  'aleph:exemplifies':    'exemplifies',
  'skos:broader':         'broader',
  'skos:related':         'related to',
  'prov:wasAttributedTo': 'attributed to',
};

export function prettyPredicate(curie: string): string {
  return PRETTY_PREDICATE[curie] ?? curie;
}

// Wrap an IRI for safe substitution. Accepts full IRI, CURIE, or bare local name.
export function iri(value: string): string {
  if (/^[A-Za-z_][\w-]*:[A-Za-z_][\w-]*$/.test(value)) {
    const [pfx] = value.split(':');
    if (pfx in PREFIXES) return value;
  }
  if (/^https?:\/\//.test(value)) return `<${value}>`;
  return `<${PREFIXES['']}${value}>`;
}

// Wrap a string literal for safe substitution (escapes ", \, newline).
export function lit(value: string, lang?: string): string {
  const esc = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return lang ? `"${esc}"@${lang}` : `"${esc}"`;
}

// Generic reactive runner. Re-executes whenever the name or any param changes.
export function useSparql(
  name: MaybeRef<QueryKey>,
  params?: MaybeRef<Params>,
): Ref<Bindings[]> {
  return computed(() => select(render(unref(name), unref(params) ?? {})));
}

// ── shaped result types ─────────────────────────────────────

export type NodeKind = 'concept' | 'person' | 'event';

export interface FocusNode {
  id: string;
  iri: string;
  label: string;
  kind: NodeKind;
  importance: number;
  generatedBy?: string;
}

export type FocusTripleKind = 'type' | 'literal' | 'iri';

export interface FocusTriple {
  predicate: string;
  object: string;
  kind: FocusTripleKind;
}

export interface Backlink {
  from: string;
  fromLabel: string;
  predicate: string;
  kind: NodeKind;
  via?: string;
}

export interface ShaclEntry {
  shape: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  label?: string;
}

export interface GraphNode {
  id: string;
  iri: string;
  label: string;
  kind: NodeKind;
  importance: number;
  generatedBy?: string;
}

export interface GraphEdge {
  s: string;
  o: string;
  predicate: string;
}

export interface ViewEdgeNote {
  from: string;
  to: string;
  label: string;
  cite?: string;
}

export interface ViewPathNote {
  atConcept: string;
  text: string;
}

export interface ViewSuggestion {
  target: string;
  reason: string;
}

export interface ChatMessage {
  id: string;
  position: number;
  speaker: 'user' | 'agent';
  body: string;
  hint?: string;
  generatedAt?: string;
  session: string;
}

export interface Session {
  id: string;
  label: string;
  agent: string;
  focus: string;
  startedAt: string;
  endedAt?: string;
  conceptCount: number;
}

// ── shaping helpers ────────────────────────────────────────

function asKind(value: string | undefined): NodeKind {
  return value === 'person' || value === 'event' ? value : 'concept';
}

function renderLiteral(term: Term): { object: string; kind: FocusTripleKind } {
  const lit = term as Term & { language?: string; datatype?: { value: string } };
  const lang = lit.language;
  const dt = lit.datatype?.value;
  const v = JSON.stringify(term.value);
  if (lang) return { object: `${v}@${lang}`, kind: 'literal' };
  if (dt && dt !== PREFIXES.xsd + 'string') return { object: `${v}^^${shrink(dt)}`, kind: 'literal' };
  return { object: term.value, kind: 'literal' };
}

// ── domain composables ─────────────────────────────────────

export function useFocusNode(
  subjectIri: MaybeRef<string | null | undefined>,
): Ref<FocusNode | null> {
  return computed(() => {
    const raw = unref(subjectIri);
    if (!raw) return null;
    const rows = select(render('focusNode', { subject: iri(raw) }));
    const row = rows[0];
    if (!row) return null;
    const iriVal = row.get('iri')!.value;
    return {
      id: localName(iriVal),
      iri: iriVal,
      label: row.get('label')?.value ?? localName(iriVal),
      kind: asKind(row.get('kind')?.value),
      importance: Number(row.get('importance')?.value ?? 0.5),
      generatedBy: row.get('generatedBy') ? localName(row.get('generatedBy')!.value) : undefined,
    };
  });
}

export function useFocusTriples(
  subjectIri: MaybeRef<string | null | undefined>,
): Ref<FocusTriple[]> {
  return computed(() => {
    const raw = unref(subjectIri);
    if (!raw) return [];
    const rows = select(render('triplesForSubject', { subject: iri(raw) }));
    const rdfType = PREFIXES.rdf + 'type';
    return rows.map<FocusTriple>((row) => {
      const p = row.get('p')!;
      const o = row.get('o')!;
      if (p.value === rdfType) {
        return { predicate: 'a', object: shrink(o.value), kind: 'type' };
      }
      const pCurie = shrink(p.value);
      if (o.termType === 'Literal') {
        return { predicate: pCurie, ...renderLiteral(o) };
      }
      return { predicate: pCurie, object: shrink(o.value), kind: 'iri' };
    });
  });
}

export function useBacklinks(
  subjectIri: MaybeRef<string | null | undefined>,
): Ref<Backlink[]> {
  return computed(() => {
    const raw = unref(subjectIri);
    if (!raw) return [];
    const rows = select(render('backlinksForSubject', { subject: iri(raw) }));
    return rows.map<Backlink>((row) => {
      const fromIri = row.get('from')!.value;
      return {
        from: localName(fromIri),
        fromLabel: row.get('fromLabel')?.value ?? localName(fromIri),
        predicate: shrink(row.get('predicate')!.value),
        kind: asKind(row.get('kind')?.value),
        via: row.get('viaLabel')?.value,
      };
    });
  });
}

export function useShaclResults(): Ref<ShaclEntry[]> {
  return computed(() => {
    const rows = select(render('shaclResults'));
    return rows.map<ShaclEntry>((row) => ({
      shape: localName(row.get('shape')!.value),
      status: (row.get('status')?.value ?? 'pass') as ShaclEntry['status'],
      detail: row.get('detail')?.value ?? '',
      label: row.get('label')?.value,
    }));
  });
}

export function useCount(name: 'nodeCount' | 'edgeCount'): Ref<number> {
  return computed(() => {
    const rows = select(render(name));
    return Number(rows[0]?.get('n')?.value ?? 0);
  });
}

export function useDefaultFocusIri(): Ref<string | null> {
  return computed(() => {
    const rows = select(render('defaultFocus'));
    return rows[0]?.get('focus')?.value ?? null;
  });
}

export function useAllNodes(): Ref<GraphNode[]> {
  return computed(() => {
    const rows = select(render('allNodes'));
    const all = rows.map<GraphNode>((row) => {
      const iriVal = row.get('iri')!.value;
      const gen = row.get('generatedBy');
      return {
        id: localName(iriVal),
        iri: iriVal,
        label: row.get('label')?.value ?? localName(iriVal),
        kind: asKind(row.get('kind')?.value),
        importance: Number(row.get('importance')?.value ?? 0.5),
        generatedBy: gen ? localName(gen.value) : undefined,
      };
    });
    const active = selectedSessionId.value;
    return active ? all.filter((n) => n.generatedBy === active) : all;
  });
}

export function useAllEdges(): Ref<GraphEdge[]> {
  return computed(() => {
    const rows = select(render('allEdges'));
    const all = rows.map<GraphEdge>((row) => ({
      s: localName(row.get('s')!.value),
      o: localName(row.get('o')!.value),
      predicate: shrink(row.get('p')!.value),
    }));
    // Filter edges to those whose endpoints are both in the active-session
    // node set; otherwise orbital would draw edges to nodes it can't show.
    const active = selectedSessionId.value;
    if (!active) return all;
    const allNodeRows = select(render('allNodes'));
    const inSession = new Set<string>();
    for (const row of allNodeRows) {
      const gen = row.get('generatedBy');
      if (gen && localName(gen.value) === active) {
        inSession.add(localName(row.get('iri')!.value));
      }
    }
    return all.filter((e) => inSession.has(e.s) && inSession.has(e.o));
  });
}

export function useViewTrail(): Ref<string[]> {
  return computed(() => {
    const rows = select(render('viewTrail'));
    return rows.map((row) => row.get('label')?.value ?? '');
  });
}

export function useViewPath(): Ref<string[]> {
  return computed(() => {
    const rows = select(render('viewPath'));
    return rows.map((row) => localName(row.get('iri')!.value));
  });
}

export function useViewEdgeNotes(): Ref<ViewEdgeNote[]> {
  return computed(() => {
    const rows = select(render('viewEdgeNotes'));
    return rows.map<ViewEdgeNote>((row) => ({
      from: localName(row.get('from')!.value),
      to: localName(row.get('to')!.value),
      label: row.get('label')?.value ?? '',
      cite: row.get('cite')?.value,
    }));
  });
}

export function useViewPathNotes(): Ref<ViewPathNote[]> {
  return computed(() => {
    const rows = select(render('viewPathNotes'));
    return rows.map<ViewPathNote>((row) => ({
      atConcept: localName(row.get('atConcept')!.value),
      text: row.get('text')?.value ?? '',
    }));
  });
}

export function useViewQuestion(): Ref<string> {
  return computed(() => {
    const rows = select(render('viewQuestion'));
    return rows[0]?.get('question')?.value ?? '';
  });
}

export function useViewSuggestions(): Ref<ViewSuggestion[]> {
  return computed(() => {
    const rows = select(render('viewSuggestions'));
    return rows.map<ViewSuggestion>((row) => ({
      target: localName(row.get('target')!.value),
      reason: row.get('reason')?.value ?? '',
    }));
  });
}

export function useChat(): Ref<ChatMessage[]> {
  return computed(() => {
    const rows = select(render('chat'));
    const all = rows.map<ChatMessage>((row) => {
      const speakerRaw = row.get('speaker')?.value ?? 'agent';
      const sessionIri = row.get('session')!.value;
      return {
        id: localName(row.get('msg')!.value),
        position: Number(row.get('position')?.value ?? 0),
        speaker: speakerRaw === 'user' ? 'user' : 'agent',
        body: row.get('body')?.value ?? '',
        hint: row.get('hint')?.value,
        generatedAt: row.get('generatedAt')?.value,
        session: localName(sessionIri),
      };
    });
    // Scope to the active session if one is pinned; otherwise show everything
    // (debug / multi-session aggregate view).
    const active = selectedSessionId.value;
    return active ? all.filter((m) => m.session === active) : all;
  });
}

// User-selected session overrides the SPARQL "most-recent" default. Lives in
// memory only; survives HMR refresh by stashing into sessionStorage.
const SS_KEY = 'aleph:selectedSession';
const initialSelection = typeof sessionStorage !== 'undefined'
  ? sessionStorage.getItem(SS_KEY)
  : null;
export const selectedSessionId = ref<string | null>(initialSelection);

export function setActiveSessionId(id: string | null): void {
  selectedSessionId.value = id;
  if (typeof sessionStorage !== 'undefined') {
    if (id) sessionStorage.setItem(SS_KEY, id);
    else sessionStorage.removeItem(SS_KEY);
  }
}

export function useActiveSessionId(): Ref<string | null> {
  return computed(() => {
    if (selectedSessionId.value) return selectedSessionId.value;
    const rows = select(render('activeSession'));
    const iriVal = rows[0]?.get('session')?.value;
    return iriVal ? localName(iriVal) : null;
  });
}

export function useSessions(): Ref<Session[]> {
  return computed(() => {
    const rows = select(render('sessions'));
    return rows.map<Session>((row) => {
      const iriVal = row.get('session')!.value;
      return {
        id: localName(iriVal),
        label: row.get('label')?.value ?? localName(iriVal),
        agent: row.get('agent')?.value ?? '—',
        focus: row.get('focus')?.value ?? '',
        startedAt: row.get('startedAt')?.value ?? '',
        endedAt: row.get('endedAt')?.value,
        conceptCount: Number(row.get('conceptCount')?.value ?? 0),
      };
    });
  });
}
