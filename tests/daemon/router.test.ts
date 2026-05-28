// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { routeEvent } from '../../src/daemon/router';

const BASE = 'http://localhost:3000';

function stubPod(opts: {
  list: Record<string, string[]>;
  bodies: Record<string, string>;
}) {
  return {
    baseUrl: BASE,
    async listContainer(path: string) { return opts.list[path] ?? []; },
    async getResource(path: string) { return opts.bodies[path] ?? null; },
  };
}

const userMsg = (n: number) =>
  JSON.stringify({ '@graph': [{ '@type': 'ChatMessage', position: n, speaker: 'user' }] });
const agentMsg = (n: number) =>
  JSON.stringify({ '@graph': [{ '@type': 'ChatMessage', position: n, speaker: 'agent' }] });

describe('routeEvent', () => {
  it('returns a trigger for a new unanswered user msg', async () => {
    const pod = stubPod({
      list: { '/aleph/sessions/s_abc/': ['meta.ttl', 'msg1.jsonld', 'msg2.jsonld', 'msg3.jsonld'] },
      bodies: { '/aleph/sessions/s_abc/msg3.jsonld': userMsg(3) },
    });
    const t = await routeEvent(`${BASE}/aleph/sessions/s_abc/`, pod as any);
    expect(t).toEqual({ sessionId: 's_abc', msgN: 3 });
  });

  it('returns null when the latest msg is from the agent', async () => {
    const pod = stubPod({
      list: { '/aleph/sessions/s_abc/': ['msg1.jsonld', 'msg2.jsonld'] },
      bodies: { '/aleph/sessions/s_abc/msg2.jsonld': agentMsg(2) },
    });
    expect(await routeEvent(`${BASE}/aleph/sessions/s_abc/`, pod as any)).toBeNull();
  });

  it('returns null when a reply already exists (msg{N+1})', async () => {
    const pod = stubPod({
      list: { '/aleph/sessions/s_abc/': ['msg3.jsonld', 'msg4.jsonld'] },
      bodies: { '/aleph/sessions/s_abc/msg4.jsonld': agentMsg(4) },
    });
    expect(await routeEvent(`${BASE}/aleph/sessions/s_abc/`, pod as any)).toBeNull();
  });

  it('returns null for non-session paths', async () => {
    const pod = stubPod({ list: {}, bodies: {} });
    expect(await routeEvent(`${BASE}/aleph/concepts/Solid.ttl`, pod as any)).toBeNull();
    expect(await routeEvent(`${BASE}/aleph/assertions/s_abc/web_x.jsonld`, pod as any)).toBeNull();
  });

  it('returns null for an empty session container', async () => {
    const pod = stubPod({ list: { '/aleph/sessions/s_abc/': ['meta.ttl'] }, bodies: {} });
    expect(await routeEvent(`${BASE}/aleph/sessions/s_abc/`, pod as any)).toBeNull();
  });
});
