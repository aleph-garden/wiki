import { Parser } from 'n3';
import type { PodClient } from './pod';

const SOLID = 'http://www.w3.org/ns/solid/terms#';
const TYPE_INDEX_PATH = '/settings/publicTypeIndex.ttl';
const DEFAULT_CONTAINER = '/g/';

type PodLike = Pick<PodClient, 'baseUrl' | 'getResource'>;

/** Local path of a container IRI/relative ref, normalized to start with `/`. */
function toPath(base: string, ref: string): string {
  if (ref.startsWith('/')) return ref;
  if (ref.startsWith('http')) {
    const baseNorm = base.replace(/\/$/, '');
    return ref.replace(baseNorm, '') || '/';
  }
  return `/${ref}`;
}

/**
 * Containers registered for `classIri` in the pod's public TypeIndex. Falls
 * back to the default `/g/` when the class is unregistered or no index exists.
 */
export async function resolveContainers(pod: PodLike, classIri: string): Promise<string[]> {
  let ttl: string | null = null;
  try { ttl = await pod.getResource(TYPE_INDEX_PATH); } catch { ttl = null; }
  if (!ttl) return [DEFAULT_CONTAINER];
  const quads = new Parser({ baseIRI: pod.baseUrl }).parse(ttl);
  const regs = quads
    .filter((q) => q.predicate.value === `${SOLID}forClass` && q.object.value === classIri)
    .map((q) => q.subject.value);
  const containers = quads
    .filter((q) => regs.includes(q.subject.value) && q.predicate.value === `${SOLID}instanceContainer`)
    .map((q) => {
      const val = q.object.value;
      // If it's a relative IRI (starts with /), extract the path
      return val.startsWith(pod.baseUrl) ? val.substring(pod.baseUrl.length) : val;
    });
  return containers.length > 0 ? containers : [DEFAULT_CONTAINER];
}
