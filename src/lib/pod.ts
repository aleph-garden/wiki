export interface PutOptions {
  ifNoneMatch?: boolean;
  contentType?: string;
}

export class PodClient {
  constructor(public baseUrl: string) {}

  private url(path: string): string {
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
}
