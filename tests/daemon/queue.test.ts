// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SessionQueue } from '../../src/daemon/queue';

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('SessionQueue', () => {
  it('runs same-session work serially in FIFO order', async () => {
    const q = new SessionQueue();
    const order: string[] = [];
    q.enqueue('s', async () => { await tick(); order.push('a'); });
    q.enqueue('s', async () => { order.push('b'); });
    await tick(); await tick();
    expect(order).toEqual(['a', 'b']);
  });

  it('runs different sessions concurrently', async () => {
    const q = new SessionQueue();
    const order: string[] = [];
    q.enqueue('s1', async () => { await tick(); order.push('s1'); });
    q.enqueue('s2', async () => { order.push('s2'); }); // no await → finishes first
    await tick(); await tick();
    expect(order).toEqual(['s2', 's1']);
  });

  it('a throwing job does not block the next job in the same session', async () => {
    const q = new SessionQueue();
    const order: string[] = [];
    q.enqueue('s', async () => { throw new Error('boom'); });
    q.enqueue('s', async () => { order.push('after'); });
    await tick(); await tick();
    expect(order).toEqual(['after']);
  });
});
