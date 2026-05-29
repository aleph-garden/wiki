// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { runAgent } from '../../src/daemon/runner';
import { ShaclValidator } from '../../src/daemon/shacl';
import type { DaemonDeps } from '../../src/daemon/types';

let validator: ShaclValidator;
beforeEach(async () => { validator = await ShaclValidator.load('vocab/aleph-shapes.ttl'); });

function recPod() {
  const puts: { path: string; body: string }[] = [];
  return {
    puts, baseUrl: 'http://localhost:3000',
    async putResource(path: string, body: string) { puts.push({ path, body }); },
    async getResource() { return null; },
    async listContainer() { return []; },
  };
}

function deps(pod: ReturnType<typeof recPod>): DaemonDeps {
  return {
    config: { podBase: 'http://localhost:3000', comunicaSources: [], promptPath: 'x', shaclEnforce: false },
    pod: pod as any, validator, sparql: { run: async () => ({ bindings: [] }) } as any,
    renderPrompt: () => 'PROMPT',
  };
}

describe('runAgent', () => {
  it('writes a fallback reply when the agent never calls write_message', async () => {
    const pod = recPod();
    const fakeQuery = async function* () {
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'thinking' }] } };
      yield { type: 'result', subtype: 'success' };
    };
    await runAgent({ sessionId: 's1', msgN: 3 }, deps(pod), fakeQuery as any);
    expect(pod.puts).toHaveLength(1);
    expect(pod.puts[0].path).toBe('/aleph/sessions/s1/msg4.ttl');
    expect(pod.puts[0].body).toMatch(/konnte keine Antwort/i);
  });

  it('does not write a fallback when write_message already ran', async () => {
    const pod = recPod();
    // The mock drives the run context's write_message via the exposed tools.
    const fakeQuery = async function* (_args: unknown, hooks: { tools: any }) {
      await hooks.tools.write_message({ sessionId: 's1', msgN: 3, body: 'real reply' });
      yield { type: 'result', subtype: 'success' };
    };
    await runAgent({ sessionId: 's1', msgN: 3 }, deps(pod), fakeQuery as any);
    const replies = pod.puts.filter((p) => p.path === '/aleph/sessions/s1/msg4.ttl');
    expect(replies).toHaveLength(1);
    expect(replies[0].body).toMatch(/real reply/);
  });
});
