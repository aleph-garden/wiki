import { Parser } from 'n3';
import type { Trigger } from './types';

export interface PodLike {
  baseUrl: string;
  listContainer(path: string): Promise<string[]>;
  getResource(path: string): Promise<string | null>;
}

const SESSION_RE = /\/aleph\/sessions\/([^/]+)\/?$/;

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const V = 'https://vocab.aleph.wiki/';
const CHAT_MESSAGE = `${V}ChatMessage`;
const SPEAKER = `${V}speaker`;

/** Highest N among msg{N}.<ext> entries (basename or full URL), or 0. */
function highestMsg(entries: string[]): number {
  let max = 0;
  for (const e of entries) {
    const m = e.match(/msg(\d+)\.\w+$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * Speaker of the ChatMessage in an RDF document, or null. Serialization-
 * agnostic: bodies reach us as Turtle (getResource sends Accept: text/turtle,
 * JSS --conneg serializes any stored format), so we parse RDF and query the
 * triple rather than assuming a JSON-LD shape.
 */
function speakerOf(body: string): string | null {
  try {
    const quads = new Parser().parse(body);
    const subject = quads.find(
      (q) => q.predicate.value === RDF_TYPE && q.object.value === CHAT_MESSAGE,
    )?.subject.value;
    if (!subject) return null;
    const speaker = quads.find(
      (q) => q.subject.value === subject && q.predicate.value === SPEAKER,
    );
    return speaker?.object.value ?? null;
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

  // Find the actual filename for msg{n} (extension is not fixed).
  const file = entries.find((e) => new RegExp(`msg${n}\\.\\w+$`).test(e));
  if (!file) return null;
  const basename = file.replace(/^.*\//, '');

  const body = await pod.getResource(`${containerPath}${basename}`);
  if (!body) return null;
  if (speakerOf(body) !== 'user') return null;

  return { sessionId, msgN: n };
}
