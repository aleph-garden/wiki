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
const userMsg = (n: number) =>
  JSON.stringify({ '@graph': [{ '@type': 'ChatMessage', position: n, speaker: 'user' }] });

describe('drainUnanswered', () => {
  it('enqueues one run per unanswered session', async () => {
    const pod = stubPod(
      {
        '/aleph/sessions/': [`${BASE}/aleph/sessions/s1/`, `${BASE}/aleph/sessions/s2/`],
        '/aleph/sessions/s1/': ['msg1.jsonld'],
        '/aleph/sessions/s2/': ['msg1.jsonld'],
      },
      {
        '/aleph/sessions/s1/msg1.jsonld': userMsg(1),
        '/aleph/sessions/s2/msg1.jsonld': userMsg(1),
      },
    );
    const enqueued: string[] = [];
    await drainUnanswered(pod as any, (t) => enqueued.push(t.sessionId));
    expect(enqueued.sort()).toEqual(['s1', 's2']);
  });

  it('skips sessions whose latest msg is answered', async () => {
    const pod = stubPod(
      { '/aleph/sessions/': [`${BASE}/aleph/sessions/s1/`], '/aleph/sessions/s1/': ['msg1.jsonld', 'msg2.jsonld'] },
      {
        '/aleph/sessions/s1/msg2.jsonld':
          JSON.stringify({ '@graph': [{ '@type': 'ChatMessage', position: 2, speaker: 'agent' }] }),
      },
    );
    const enqueued: string[] = [];
    await drainUnanswered(pod as any, (t) => enqueued.push(t.sessionId));
    expect(enqueued).toEqual([]);
  });
});
