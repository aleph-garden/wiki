import { QueryEngine } from '@comunica/query-sparql';

export type SparqlResult =
  | { bindings: Record<string, string>[] }
  | { error: 'sparql'; detail: string };

const TIMEOUT_MS = 15_000;

interface BindingsLike {
  forEach(cb: (value: { value: string }, key: { value: string }) => void): void;
}
interface EngineLike {
  queryBindings(query: string, ctx: { sources: string[] }): Promise<{ toArray(): Promise<BindingsLike[]> }>;
}

export class SparqlEngine {
  private engine: EngineLike;
  constructor(private defaultSources: string[], engine?: EngineLike) {
    this.engine = engine ?? (new QueryEngine() as unknown as EngineLike);
  }

  async run(query: string, sources?: string[]): Promise<SparqlResult> {
    const useSources = sources?.length ? sources : this.defaultSources;
    try {
      const result = await withTimeout(
        this.engine.queryBindings(query, { sources: useSources }),
        TIMEOUT_MS,
      );
      const rows = await result.toArray();
      const bindings = rows.map((b) => {
        const obj: Record<string, string> = {};
        b.forEach((v, k) => { obj[k.value] = v.value; });
        return obj;
      });
      return { bindings };
    } catch (e) {
      return { error: 'sparql', detail: e instanceof Error ? e.message : String(e) };
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`sparql timeout after ${ms}ms`)), ms)),
  ]);
}
