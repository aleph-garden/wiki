export interface PutOptions {
  ifNoneMatch?: boolean;
  contentType?: string;
}

export class PodClient {
  constructor(public baseUrl: string) {}

  url(path: string): string {
    return this.baseUrl.replace(/\/$/, '') + path;
  }

  async putResource(path: string, body: string, opts: PutOptions = {}): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': opts.contentType ?? 'text/turtle',
    };
    if (opts.ifNoneMatch) headers['If-None-Match'] = '*';
    const res = await fetch(this.url(path), { method: 'PUT', headers, body });
    if (!res.ok) {
      throw new Error(`PUT ${path} → ${res.status}`);
    }
  }

  async getResource(path: string): Promise<string | null> {
    const res = await fetch(this.url(path), {
      headers: {
        // Ask for any RDF the server can serialize. q-values nudge the server
        // toward turtle (smallest, most legible) but accept everything.
        Accept: 'text/turtle;q=1.0, application/ld+json;q=0.9, application/n-triples;q=0.8, application/n-quads;q=0.8, application/trig;q=0.7, application/rdf+xml;q=0.6, */*;q=0.1',
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.text();
  }

  // Like getResource but also surfaces the server's Content-Type so the caller
  // can pick a matching parser.
  async getResourceWithType(path: string): Promise<{ body: string; contentType: string } | null> {
    const res = await fetch(this.url(path), {
      headers: {
        Accept: 'text/turtle;q=1.0, application/ld+json;q=0.9, application/n-triples;q=0.8, application/n-quads;q=0.8, application/trig;q=0.7, application/rdf+xml;q=0.6, */*;q=0.1',
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    const contentType = (res.headers.get('content-type') ?? 'text/turtle').split(';')[0].trim();
    return { body: await res.text(), contentType };
  }

  async listContainer(path: string): Promise<string[]> {
    const ttl = await this.getResource(path);
    if (!ttl) return [];
    // Parse ldp:contains URIs. Cheap regex pass — enough for JSS output.
    const matches = ttl.matchAll(/ldp:contains\s+((?:<[^>]*>)(?:\s*,\s*(?:<[^>]*>))*)\s*[.;]/g);
    const out: string[] = [];
    for (const m of matches) {
      for (const ref of m[1].split(',')) {
        const trimmed = ref.trim();
        const angle = trimmed.match(/^<([^>]+)>$/);
        if (angle) out.push(angle[1]);
      }
    }
    return out;
  }

  subscribe(
    path: string,
    onChange: (ev: { path: string; kind: 'created'|'updated'|'deleted' }) => void,
    onStatus?: (s: 'connecting'|'online'|'reconnecting') => void,
  ): () => void {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/.notifications';
    let ws: WebSocket | null = null;
    let closed = false;
    let backoff = 1000;

    const open = () => {
      if (closed) return;
      ws = new WebSocket(wsUrl, ['solid-0.1']);
      ws.addEventListener('open', () => {
        backoff = 1000;
        onStatus?.('online');
        ws!.send(`sub ${this.url(path)}`);
      });
      ws.addEventListener('message', (e: any) => {
        const data: string = typeof e.data === 'string' ? e.data : '';
        if (!data.startsWith('pub ')) return;
        const fullUrl = data.slice(4).trim();
        const localPath = fullUrl.replace(this.baseUrl.replace(/\/$/, ''), '');
        onChange({ path: localPath, kind: 'updated' });
      });
      ws.addEventListener('close', () => {
        if (closed) return;
        onStatus?.('reconnecting');
        setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, 30000);
      });
      ws.addEventListener('error', () => {
        ws?.close();
      });
    };

    open();
    return () => { closed = true; ws?.close(); };
  }
}
