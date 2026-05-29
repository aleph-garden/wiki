import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { DaemonDeps, Trigger, RunContext } from './types';
import { createAlephServer } from './mcp/server';

const TIMEOUT_MS = 5 * 60_000;
const FALLBACK_BODY = 'Agent konnte keine Antwort generieren.';

/** One-line summary of a tool_use block for logging. */
function summarizeTool(name: string, input: any): string {
  const short = name.replace(/^mcp__aleph__/, '');
  if (!input) return short;
  switch (short) {
    case 'read_pod': return `read_pod ${input.path}`;
    case 'sparql_query': return `sparql_query "${String(input.query ?? '').replace(/\s+/g, ' ').slice(0, 70)}…"`;
    case 'write_message': return `write_message ${input.sessionId} msg${input.msgN} (${String(input.body ?? '').length} chars)`;
    case 'assert_triples': return `assert_triples ${input.kind}`;
    case 'WebSearch': return `WebSearch "${input.query ?? ''}"`;
    case 'WebFetch': return `WebFetch ${input.url ?? ''}`;
    default: return short;
  }
}

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

  const started = Date.now();
  let toolCalls = 0;
  console.log(`[runner] ▶ ${trigger.sessionId} msg${trigger.msgN}: starting agent`);

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
          if (block.type === 'tool_use') {
            toolCalls++;
            console.log(`[runner]   → ${summarizeTool(block.name, (block as any).input)}`);
          } else if (block.type === 'text' && (block as any).text?.trim()) {
            console.log(`[runner]   · ${(block as any).text.replace(/\s+/g, ' ').trim().slice(0, 140)}`);
          }
        }
      } else if (msg.type === 'result') {
        const log = msg.subtype === 'success' ? console.log : console.warn;
        log(`[runner] result subtype=${msg.subtype}`);
      }
    }
  } catch (e) {
    console.error(`[runner] query failed for ${trigger.sessionId}:`, e);
  } finally {
    clearTimeout(timer);
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (!ctx.messageWritten) {
    console.warn(`[runner] no write_message for ${trigger.sessionId} → fallback (${toolCalls} tool calls, ${secs}s)`);
    await tools.write_message({
      sessionId: trigger.sessionId, msgN: trigger.msgN, body: FALLBACK_BODY,
    });
  } else {
    console.log(`[runner] ■ ${trigger.sessionId}: done (${toolCalls} tool calls, ${secs}s)`);
  }
}
