// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SparqlEngine } from '../../src/daemon/mcp/sparql';

/** Fake Comunica engine: queryBindings → object with toArray(). */
function fakeEngine(rows: Record<string, { value: string }>[]) {
  return {
    queryBindings: async () => ({
      toArray: async () => rows.map((r) => ({
        entries: { keys: () => Object.keys(r) },
        get: (k: string) => r[k],
        forEach: (cb: (v: { value: string }, k: { value: string }) => void) =>
          Object.entries(r).forEach(([k, v]) => cb(v, { value: k })),
      })),
    }),
  };
}

describe('SparqlEngine', () => {
  it('maps bindings to plain objects', async () => {
    const eng = new SparqlEngine(['https://dbpedia.org/sparql'],
      fakeEngine([{ s: { value: 'http://x' }, label: { value: 'X' } }]) as any);
    const r = await eng.run('SELECT * WHERE {?s ?p ?o}');
    expect(r).toEqual({ bindings: [{ s: 'http://x', label: 'X' }] });
  });

  it('returns a structured error when the engine throws', async () => {
    const eng = new SparqlEngine(['x'],
      { queryBindings: async () => { throw new Error('bad query'); } } as any);
    const r = await eng.run('NONSENSE');
    expect(r).toEqual({ error: 'sparql', detail: expect.stringContaining('bad query') });
  });
});
