import type { Trigger } from './types';

export interface PodLike {
  baseUrl: string;
  listContainer(path: string): Promise<string[]>;
  getResource(path: string): Promise<string | null>;
}

const SESSION_RE = /\/aleph\/sessions\/([^/]+)\/?$/;

/** Highest N among msg{N}.jsonld entries (basename or full URL), or 0. */
function highestMsg(entries: string[]): number {
  let max = 0;
  for (const e of entries) {
    const m = e.match(/msg(\d+)\.jsonld$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function speakerOf(body: string): string | null {
  try {
    const doc = JSON.parse(body);
    const graph: any[] = doc['@graph'] ?? [doc];
    const chat = graph.find((n) => n['@type'] === 'ChatMessage' || n['@type'] === 'aleph:ChatMessage');
    return chat?.speaker ?? null;
  } catch {
    return null;
  }
}

export async function routeEvent(url: string, pod: PodLike): Promise<Trigger | null> {
  const local = url.replace(pod.baseUrl.replace(/\/$/, ''), '');
  const m = local.match(SESSION_RE);
  if (!m) return null;
  const sessionId = m[1];
  const containerPath = `/aleph/sessions/${sessionId}/`;

  const entries = await pod.listContainer(containerPath);
  const n = highestMsg(entries);
  if (n === 0) return null;

  const body = await pod.getResource(`${containerPath}msg${n}.jsonld`);
  if (!body) return null;
  if (speakerOf(body) !== 'user') return null;

  return { sessionId, msgN: n };
}
