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
      headers: { Accept: 'text/turtle' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.text();
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

  subscribe(path: string, onChange: (ev: { path: string; kind: 'created'|'updated'|'deleted' }) => void): () => void {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/';
    let ws: WebSocket | null = null;
    let closed = false;
    let backoff = 1000;

    const open = () => {
      if (closed) return;
      ws = new WebSocket(wsUrl);
      ws.addEventListener('open', () => {
        backoff = 1000;
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
