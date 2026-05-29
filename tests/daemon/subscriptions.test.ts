// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { watchSessions } from '../../src/daemon/subscriptions';

const BASE = 'http://localhost:3000';

class FakeWS {
  static instances: FakeWS[] = [];
  sent: string[] = [];
  handlers: Record<string, ((a?: unknown) => void)[]> = {};
  constructor(public url: string, public protocols: string[]) { FakeWS.instances.push(this); }
  on(ev: string, cb: (a?: unknown) => void) { (this.handlers[ev] ??= []).push(cb); }
  send(m: string) { this.sent.push(m); }
  close() {}
  fireOpen() { this.handlers['open']?.forEach((f) => f()); }
  fireMessage(m: string) { this.handlers['message']?.forEach((f) => f(m)); }
}

function stubPod(sessions: () => string[]) {
  return {
    baseUrl: BASE,
    async listContainer() { return sessions(); },
    async getResource() { return null; },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const targetsOf = () => {
  FakeWS.instances.forEach((ws) => ws.fireOpen());
  return FakeWS.instances.map((ws) => ws.sent[0]).filter(Boolean).sort();
};

beforeEach(() => { FakeWS.instances = []; });

describe('watchSessions', () => {
  it('subscribes to every existing session container plus the parent, skipping stray files', async () => {
    const pod = stubPod(() => [
      `${BASE}/aleph/sessions/s1/`,
      `${BASE}/aleph/sessions/s2/`,
      `${BASE}/aleph/sessions/stray.ttl`,
    ]);
    const stop = await watchSessions(pod as any, BASE, () => {}, { WebSocketCtor: FakeWS as any });
    expect(targetsOf()).toEqual([
      `sub ${BASE}/aleph/sessions/`,
      `sub ${BASE}/aleph/sessions/s1/`,
      `sub ${BASE}/aleph/sessions/s2/`,
    ]);
    stop();
  });

  it('forwards a session-container pub to onSessionPub', async () => {
    const pod = stubPod(() => [`${BASE}/aleph/sessions/s1/`]);
    const pubs: string[] = [];
    await watchSessions(pod as any, BASE, (u) => pubs.push(u), { WebSocketCtor: FakeWS as any });
    FakeWS.instances.forEach((ws) => ws.fireOpen());
    const s1 = FakeWS.instances.find((ws) => ws.sent[0] === `sub ${BASE}/aleph/sessions/s1/`)!;
    s1.fireMessage(`pub ${BASE}/aleph/sessions/s1/`);
    expect(pubs).toEqual([`${BASE}/aleph/sessions/s1/`]);
  });

  it('subscribes to a new session that appears after start (parent pub)', async () => {
    let sessions = [`${BASE}/aleph/sessions/s1/`];
    const pod = stubPod(() => sessions);
    await watchSessions(pod as any, BASE, () => {}, { WebSocketCtor: FakeWS as any });
    FakeWS.instances.forEach((ws) => ws.fireOpen());

    sessions = [`${BASE}/aleph/sessions/s1/`, `${BASE}/aleph/sessions/s2/`];
    const parent = FakeWS.instances.find((ws) => ws.sent[0] === `sub ${BASE}/aleph/sessions/`)!;
    parent.fireMessage(`pub ${BASE}/aleph/sessions/`);
    await flush();

    expect(targetsOf()).toContain(`sub ${BASE}/aleph/sessions/s2/`);
  });

  it('does not double-subscribe an already-watched session', async () => {
    const pod = stubPod(() => [`${BASE}/aleph/sessions/s1/`]);
    await watchSessions(pod as any, BASE, () => {}, { WebSocketCtor: FakeWS as any });
    FakeWS.instances.forEach((ws) => ws.fireOpen());
    const parent = FakeWS.instances.find((ws) => ws.sent[0] === `sub ${BASE}/aleph/sessions/`)!;
    parent.fireMessage(`pub ${BASE}/aleph/sessions/`);
    await flush();
    const s1Subs = targetsOf().filter((t) => t === `sub ${BASE}/aleph/sessions/s1/`);
    expect(s1Subs).toHaveLength(1);
  });
});
