import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PodClient } from '../src/lib/pod';

describe('PodClient.putResource', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
  });

  it('PUTs ttl to absolute pod URL with correct headers', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 201 }));
    const c = new PodClient('http://localhost:3000');
    await c.putResource('/aleph/sessions/Session_1/msg1.ttl', ':x a :Y .', { ifNoneMatch: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/aleph/sessions/Session_1/msg1.ttl');
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('text/turtle');
    expect(init.headers['If-None-Match']).toBe('*');
    expect(init.body).toBe(':x a :Y .');
  });

  it('throws on 412 conflict', async () => {
    fetchMock.mockResolvedValueOnce(new Response('conflict', { status: 412 }));
    const c = new PodClient('http://localhost:3000');
    await expect(c.putResource('/x.ttl', '', { ifNoneMatch: true }))
      .rejects.toThrow(/412/);
  });

  it('throws on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad', { status: 400 }));
    const c = new PodClient('http://localhost:3000');
    await expect(c.putResource('/x.ttl', '')).rejects.toThrow(/400/);
  });
});

describe('PodClient.getResource', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
  });

  it('GETs and returns text', async () => {
    fetchMock.mockResolvedValueOnce(new Response(':x a :Y .', {
      status: 200, headers: { 'Content-Type': 'text/turtle' },
    }));
    const c = new PodClient('http://localhost:3000');
    const txt = await c.getResource('/x.ttl');
    expect(txt).toBe(':x a :Y .');
  });

  it('returns null on 404', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    const c = new PodClient('http://localhost:3000');
    expect(await c.getResource('/missing.ttl')).toBeNull();
  });
});

describe('PodClient.listContainer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
  });

  it('parses ldp:contains URIs', async () => {
    fetchMock.mockResolvedValueOnce(new Response(`
      @prefix ldp: <http://www.w3.org/ns/ldp#> .
      <> a ldp:BasicContainer ;
         ldp:contains <msg1.ttl>, <msg2.ttl> .
    `, { status: 200, headers: { 'Content-Type': 'text/turtle' } }));
    const c = new PodClient('http://localhost:3000');
    const paths = await c.listContainer('/aleph/sessions/Session_1/');
    expect(paths.sort()).toEqual(['msg1.ttl', 'msg2.ttl']);
  });
});
