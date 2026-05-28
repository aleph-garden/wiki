// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { subscribeContainer } from '../../src/daemon/subscriber';

describe('subscribeContainer', () => {
  it('opens ws, sends sub, forwards pub urls', async () => {
    const sent: string[] = [];
    const handlers: Record<string, ((arg?: unknown) => void)[]> = {};
    class FakeWS {
      constructor(public url: string, public protocols: string[]) {}
      on(ev: string, cb: (arg?: unknown) => void) { (handlers[ev] ??= []).push(cb); }
      send(msg: string) { sent.push(msg); }
      close() {}
    }
    const pubs: string[] = [];
    const stop = subscribeContainer(
      'http://localhost:3000', '/aleph/sessions/', (url) => pubs.push(url),
      { WebSocketCtor: FakeWS as any },
    );
    handlers['open'][0]();
    expect(sent[0]).toBe('sub http://localhost:3000/aleph/sessions/');
    handlers['message'][0]('pub http://localhost:3000/aleph/sessions/s_abc/');
    expect(pubs).toEqual(['http://localhost:3000/aleph/sessions/s_abc/']);
    stop();
  });

  it('ignores non-pub frames', async () => {
    const handlers: Record<string, ((arg?: unknown) => void)[]> = {};
    class FakeWS {
      constructor(public url: string, public protocols: string[]) {}
      on(ev: string, cb: (arg?: unknown) => void) { (handlers[ev] ??= []).push(cb); }
      send() {} close() {}
    }
    const pubs: string[] = [];
    subscribeContainer('http://localhost:3000', '/aleph/sessions/', (u) => pubs.push(u),
      { WebSocketCtor: FakeWS as any });
    handlers['message'][0]('ack');
    expect(pubs).toEqual([]);
  });
});
