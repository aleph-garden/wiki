// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { runAgent } from '../../../src/daemon/runner';
import { ShaclValidator } from '../../../src/daemon/shacl';
import type { DaemonDeps } from '../../../src/daemon/types';

let validator: ShaclValidator;
beforeAll(async () => { validator = await ShaclValidator.load('vocab/aleph-shapes.ttl'); });

/** In-memory pod recording writes and serving a seeded user msg. */
function memPod() {
  const store = new Map<string, string>();
  store.set('/aleph/sessions/s_abc/msg1.jsonld',
    JSON.stringify({ '@graph': [{ '@type': 'ChatMessage', position: 1, speaker: 'user', body: 'Was ist Solid?' }] }));
  return {
    store, baseUrl: 'http://localhost:3000',
    async getResource(p: string) { return store.get(p) ?? null; },
    async putResource(p: string, b: string) { store.set(p, b); },
    async listContainer() { return ['msg1.jsonld']; },
  };
}

function deps(pod: ReturnType<typeof memPod>): DaemonDeps {
  return {
    config: { podBase: 'http://localhost:3000', comunicaSources: [], promptPath: 'x', shaclEnforce: false },
    pod: pod as any, validator,
    sparql: { run: async () => ({ bindings: [] }) } as any,
    renderPrompt: () => 'PROMPT',
  };
}

describe('e2e: realistic tool sequence', () => {
  it('writes a SHACL-valid reply and a web claim', async () => {
    const pod = memPod();
    const mockQuery = async function* (_a: unknown, hooks: { tools: any }) {
      await hooks.tools.read_pod({ path: '/aleph/sessions/s_abc/msg1.jsonld' });
      const a = await hooks.tools.assert_claim({
        kind: 'web',
        concepts: [{ '@type': 'Concept', prefLabel: { en: 'Solid' } }],
        provenance: { derivedFrom: 'https://solidproject.org', searchQuery: 'what is solid' },
      });
      expect(a).toMatchObject({ ok: true });
      const w = await hooks.tools.write_message({
        msgN: 1, body: 'Solid ist eine Spezifikation für dezentrale Daten.',
      });
      expect(w).toMatchObject({ ok: true });
      yield { type: 'result', subtype: 'success' };
    };
    await runAgent({ sessionId: 's_abc', msgN: 1 }, deps(pod), mockQuery as any);

    expect(pod.store.has('/aleph.wiki/sessions/s_abc/msg2.ttl')).toBe(true);
    const claimKey = [...pod.store.keys()].find((k) => k.startsWith('/aleph.wiki/sessions/s_abc/claim_'));
    expect(claimKey).toBeDefined();
  });
});
