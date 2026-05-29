import { Parser, Writer, DataFactory, type Quad } from 'n3';
import type { PodClient } from '../lib/pod';
import { findCanonicalByLabel } from './lookup';
import { resolveContainers } from '../lib/typeindex';

const PROV = 'http://www.w3.org/ns/prov#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const V = 'https://vocab.aleph.wiki/';

const { namedNode, quad: mkQuad } = DataFactory;

export type PodLike = Pick<PodClient, 'baseUrl' | 'getResource' | 'listContainer' | 'putResource'>;

export const sessionDir = (sid: string) => `/aleph/sessions/${sid}/`;

/** Quads from every non-invalidated claim_*.ttl in the session container. */
export async function gatherClaims(pod: PodLike, sessionId: string): Promise<Quad[]> {
  const dir = sessionDir(sessionId);
  const entries = await pod.listContainer(dir);
  const out: Quad[] = [];
  for (const entry of entries) {
    const path = entry.startsWith('http') ? new URL(entry).pathname : entry;
    const base = path.replace(/^.*\//, '');
    if (!/^claim_.*\.ttl$/.test(base)) continue;
    const ttl = await pod.getResource(path);
    if (!ttl) continue;
    const quads = new Parser({ baseIRI: pod.baseUrl + path }).parse(ttl);
    const invalidated = quads.some((q) => q.predicate.value === `${PROV}wasInvalidatedBy`);
    if (invalidated) continue;
    out.push(...quads);
  }
  return out;
}

function writeTurtle(quads: Quad[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = new Writer();
    w.addQuads(quads);
    w.end((e, r) => (e ? reject(e) : resolve(r)));
  });
}

function dedupeQuads(quads: Quad[]): Quad[] {
  const seen = new Set<string>();
  return quads.filter((q) => {
    const k = `${q.subject.value}|${q.predicate.value}|${q.object.value}|${q.object.termType}|${(q.object as any).language ?? ''}|${(q.object as any).datatype?.value ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

type Term = Quad['subject'] | Quad['object'];

/** Promote non-invalidated session claims into canonical `/g/` resources. */
export async function blessSession(pod: PodLike, sessionId: string): Promise<{ promoted: string[] }> {
  const dir = sessionDir(sessionId);
  const sessionPrefix = `${pod.baseUrl}${dir}g/`;
  const quads = await gatherClaims(pod, sessionId);

  const entities = [...new Set(
    quads.filter((q) => q.subject.value.startsWith(sessionPrefix)).map((q) => q.subject.value),
  )];

  // Mint target for new concepts — resolved once (same for every entity).
  const conceptContainer = (await resolveContainers(pod, `${V}Concept`))[0].replace(/\/$/, '');

  const remap = new Map<string, string>();
  for (const iri of entities) {
    const slug = iri.slice(sessionPrefix.length);
    if (!slug) { console.warn(`[bless] empty slug for ${iri} — skipped`); continue; }
    const label = quads.find(
      (q) => q.subject.value === iri && q.predicate.value === `${SKOS}prefLabel`,
    )?.object.value;
    const existing = label ? await findCanonicalByLabel(pod, label) : null;
    remap.set(iri, existing ?? `${pod.baseUrl}${conceptContainer}/${slug}`);
  }

  const remapTerm = (t: Term): Term =>
    t.termType === 'NamedNode' && remap.has(t.value) ? namedNode(remap.get(t.value)!) : t;

  const rewritten = quads
    .filter((q) => remap.has(q.subject.value))
    .map((q) => mkQuad(remapTerm(q.subject) as ReturnType<typeof namedNode>, q.predicate, remapTerm(q.object) as Term));

  const bySubject = new Map<string, Quad[]>();
  for (const q of rewritten) {
    if (!bySubject.has(q.subject.value)) bySubject.set(q.subject.value, []);
    bySubject.get(q.subject.value)!.push(q);
  }

  const sessionActivity = `${pod.baseUrl}${dir.replace(/\/$/, '')}`;
  const promoted: string[] = [];
  for (const [subjIri, subjQuads] of bySubject) {
    const baseUrl = pod.baseUrl.replace(/\/$/, '');
    const path = subjIri.slice(baseUrl.length) + '.ttl';
    const existingTtl = await pod.getResource(path);
    const existing = existingTtl ? new Parser({ baseIRI: pod.baseUrl + path }).parse(existingTtl) : [];
    const prov = mkQuad(namedNode(subjIri), namedNode(`${PROV}wasGeneratedBy`), namedNode(sessionActivity));
    await pod.putResource(path, await writeTurtle(dedupeQuads([...existing, ...subjQuads, prov])), { contentType: 'text/turtle' });
    promoted.push(subjIri);
  }
  return { promoted };
}
