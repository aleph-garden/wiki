// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { drainUnanswered } from '../../src/daemon/main';

const BASE = 'http://localhost:3000';

function stubPod(list: Record<string, string[]>, bodies: Record<string, string>) {
  return {
    baseUrl: BASE,
    async listContainer(p: string) { return list[p] ?? []; },
    async getResource(p: string) { return bodies[p] ?? null; },
  };
}
// Bodies arrive as Turtle (getResource → Accept: text/turtle + JSS --conneg).
const V = '@prefix v: <https://vocab.aleph.wiki/> .\n';
const msg = (n: number, speaker: string) =>
  `${V}<https://aleph.wiki/g/msg${n}> a v:ChatMessage ; v:position ${n} ; v:speaker "${speaker}" .`;

describe('drainUnanswered', () => {
  it('enqueues one run per unanswered session', async () => {
    const pod = stubPod(
      {
        '/aleph/sessions/': [`${BASE}/aleph/sessions/s1/`, `${BASE}/aleph/sessions/s2/`],
        '/aleph/sessions/s1/': ['msg1.ttl'],
        '/aleph/sessions/s2/': ['msg1.ttl'],
      },
      {
        '/aleph/sessions/s1/msg1.ttl': msg(1, 'user'),
        '/aleph/sessions/s2/msg1.ttl': msg(1, 'user'),
      },
    );
    const enqueued: string[] = [];
    await drainUnanswered(pod as any, (t) => enqueued.push(t.sessionId));
    expect(enqueued.sort()).toEqual(['s1', 's2']);
  });

  it('skips sessions whose latest msg is answered', async () => {
    const pod = stubPod(
      { '/aleph/sessions/': [`${BASE}/aleph/sessions/s1/`], '/aleph/sessions/s1/': ['msg1.ttl', 'msg2.ttl'] },
      {
        '/aleph/sessions/s1/msg2.ttl': msg(2, 'agent'),
      },
    );
    const enqueued: string[] = [];
    await drainUnanswered(pod as any, (t) => enqueued.push(t.sessionId));
    expect(enqueued).toEqual([]);
  });
});
