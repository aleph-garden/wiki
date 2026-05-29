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

// Bodies arrive as Turtle: getResource sends `Accept: text/turtle` and JSS's
// --conneg serializes any stored format (.ttl, .jsonld, …) to Turtle. The
// router must be serialization-agnostic, so tests feed Turtle regardless of
// the resource's file extension.
const PREFIX = '@prefix v: <https://vocab.aleph.wiki/> .\n';
const turtleMsg = (n: number, speaker: string) =>
  `${PREFIX}<https://aleph.wiki/g/s_abc_msg${n}> a v:ChatMessage ;\n` +
  `  v:position ${n} ; v:speaker "${speaker}" ; v:body "hi" .`;

describe('routeEvent', () => {
  it('returns a trigger for a new unanswered user msg (.ttl)', async () => {
    const pod = stubPod({
      list: { '/aleph/sessions/s_abc/': ['meta.ttl', 'msg1.ttl', 'msg2.ttl', 'msg3.ttl'] },
      bodies: { '/aleph/sessions/s_abc/msg3.ttl': turtleMsg(3, 'user') },
    });
    const t = await routeEvent(`${BASE}/aleph/sessions/s_abc/`, pod as any);
    expect(t).toEqual({ sessionId: 's_abc', msgN: 3 });
  });

  it('is serialization-agnostic: a .jsonld resource served as Turtle still routes', async () => {
    const pod = stubPod({
      list: { '/aleph/sessions/s_abc/': ['msg1.jsonld'] },
      bodies: { '/aleph/sessions/s_abc/msg1.jsonld': turtleMsg(1, 'user') },
    });
    expect(await routeEvent(`${BASE}/aleph/sessions/s_abc/`, pod as any))
      .toEqual({ sessionId: 's_abc', msgN: 1 });
  });

  it('returns null when the latest msg is from the agent', async () => {
    const pod = stubPod({
      list: { '/aleph/sessions/s_abc/': ['msg1.ttl', 'msg2.ttl'] },
      bodies: { '/aleph/sessions/s_abc/msg2.ttl': turtleMsg(2, 'agent') },
    });
    expect(await routeEvent(`${BASE}/aleph/sessions/s_abc/`, pod as any)).toBeNull();
  });

  it('returns null when a reply already exists (msg{N+1})', async () => {
    const pod = stubPod({
      list: { '/aleph/sessions/s_abc/': ['msg3.ttl', 'msg4.ttl'] },
      bodies: { '/aleph/sessions/s_abc/msg4.ttl': turtleMsg(4, 'agent') },
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
