import { Parser, type Quad } from 'n3';
import type { PodClient } from '../lib/pod';

const PROV = 'http://www.w3.org/ns/prov#';

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
