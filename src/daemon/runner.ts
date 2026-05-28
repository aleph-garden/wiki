import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { DaemonDeps, Trigger, RunContext } from './types';
import { createAlephServer } from './mcp/server';

const TIMEOUT_MS = 5 * 60_000;
const FALLBACK_BODY = 'Agent konnte keine Antwort generieren.';

/** Signature compatible with both the real SDK query() and the test MockSdk.
 *  The second arg (bound tools) is only consumed by the MockSdk. */
type QueryFn = (
  args: { prompt: string; options: Record<string, unknown> },
  hooks: { tools: ReturnType<typeof createAlephServer>['tools'] },
) => AsyncGenerator<{ type: string; subtype?: string; message?: { content: any[] } }>;

export async function runAgent(
  trigger: Trigger,
  deps: DaemonDeps,
  queryFn: QueryFn = sdkQuery as unknown as QueryFn,
): Promise<void> {
  const ctx: RunContext = {
    sessionId: trigger.sessionId, msgN: trigger.msgN,
    messageWritten: false, shaclFailures: new Map(),
  };
  const { server, tools } = createAlephServer(
    { pod: deps.pod, validator: deps.validator, sparql: deps.sparql, enforceShacl: deps.config.shaclEnforce },
    ctx,
  );
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const gen = queryFn(
      {
        prompt: deps.renderPrompt(trigger),
        options: {
          model: deps.config.model,
          mcpServers: { aleph: server },
          allowedTools: ['WebSearch', 'WebFetch', 'mcp__aleph__*'],
          permissionMode: 'acceptEdits',
          abortController: ac,
        },
      },
      { tools },
    );
    for await (const msg of gen) {
      if (msg.type === 'assistant') {
        for (const block of msg.message?.content ?? []) {
          if (block.type === 'tool_use') console.log(`[runner] tool_use ${block.name}`);
        }
      } else if (msg.type === 'result') {
        if (msg.subtype !== 'success') console.warn(`[runner] result subtype=${msg.subtype}`);
      }
    }
  } catch (e) {
    console.error(`[runner] query failed for ${trigger.sessionId}:`, e);
  } finally {
    clearTimeout(timer);
  }

  if (!ctx.messageWritten) {
    console.warn(`[runner] no write_message for ${trigger.sessionId} → fallback`);
    await tools.write_message({
      sessionId: trigger.sessionId, msgN: trigger.msgN, body: FALLBACK_BODY,
    });
  }
}
