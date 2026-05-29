import { Parser } from 'n3';
import type { PodClient } from '../lib/pod';
import { resolveContainers } from '../lib/typeindex';

const V = 'https://vocab.aleph.wiki/';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';

type PodLike = Pick<PodClient, 'baseUrl' | 'getResource' | 'listContainer'>;

/**
 * IRI of an existing canonical concept whose prefLabel or altLabel matches
 * `label` (case-insensitive), or null. Searches the containers registered for
 * aleph:Concept (default `/g/`).
 */
export async function findCanonicalByLabel(pod: PodLike, label: string): Promise<string | null> {
  const want = label.trim().toLowerCase();
  if (!want) return null;
  const containers = await resolveContainers(pod, `${V}Concept`);
  for (const container of containers) {
    const entries = await pod.listContainer(container);
    for (const entry of entries) {
      const path = entry.startsWith('http') ? new URL(entry).pathname : entry;
      if (!path.endsWith('.ttl')) continue;
      const ttl = await pod.getResource(path);
      if (!ttl) continue;
      const quads = new Parser().parse(ttl);
      const hit = quads.find(
        (q) => (q.predicate.value === `${SKOS}prefLabel` || q.predicate.value === `${SKOS}altLabel`) &&
               q.object.value.trim().toLowerCase() === want,
      );
      if (hit) return hit.subject.value;
    }
  }
  return null;
}
