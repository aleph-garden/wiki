import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { PodClient } from '../../lib/pod';
import type { ShaclValidator } from '../shacl';
import type { SparqlEngine } from './sparql';
import type { RunContext } from '../types';
import { buildReplyDoc, buildAssertionDoc, toTurtle, type AssertionKind } from '../templates';

export interface ToolDeps {
  pod: PodClient;
  validator: ShaclValidator;
  sparql: SparqlEngine;
  /**
   * Block writes on SHACL non-conformance (and apply the retry cap). Defaults
   * to false: validation is advisory while the vocab is unstable — it runs and
   * logs warnings, but every write proceeds.
   */
  enforceShacl?: boolean;
}

const MAX_SHACL_FAILURES = 3;

function nowIso(): string { return new Date().toISOString(); }
function fileTs(): string { return new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, ''); }

/** Bare tool handlers — pure-ish, unit-testable without the SDK. */
export function makeTools(deps: ToolDeps, ctx: RunContext) {
  const { pod, validator, sparql, enforceShacl = false } = deps;

  /** Absolute IRI a doc will be stored at — the JSON-LD base for `@id: ""`. */
  const docUrl = (path: string) => pod.baseUrl.replace(/\/$/, '') + path;

  /**
   * Fetch the session's meta.ttl so the typed `aleph:AlephSession` node is
   * present in the data graph — needed for the `wasGeneratedBy → sh:class
   * aleph:AlephSession` constraints on concepts and edits to resolve. Returns
   * undefined when there's no meta (e.g. tests); validation then proceeds
   * without the session context.
   */
  async function sessionMeta(sessionId: string): Promise<string | undefined> {
    try {
      return (await pod.getResource(`/aleph/sessions/${sessionId}/meta.ttl`)) ?? undefined;
    } catch {
      return undefined;
    }
  }

  async function read_pod(input: { path: string }) {
    try {
      const body = await pod.getResource(input.path);
      if (body === null) {
        console.log(`[mcp] read_pod ${input.path} → 404`);
        return { error: '404' as const };
      }
      console.log(`[mcp] read_pod ${input.path} → ${body.length} bytes`);
      return { body, contentType: 'text/turtle' };
    } catch (e) {
      console.warn(`[mcp] read_pod ${input.path} → error: ${e instanceof Error ? e.message : String(e)}`);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function sparql_query(input: { query: string; sources?: string[] }) {
    const result = await sparql.run(input.query, input.sources);
    if ('error' in result) console.warn(`[mcp] sparql_query → error: ${result.detail} | query: ${input.query.replace(/\s+/g, ' ').trim().slice(0, 200)}`);
    else console.log(`[mcp] sparql_query (${input.sources?.length ?? 'default'} src) → ${result.bindings.length} rows`);
    return result;
  }

  async function write_message(input: { sessionId: string; msgN: number; body: string }) {
    const built = buildReplyDoc({
      sessionId: input.sessionId, msgN: input.msgN, body: input.body, now: nowIso(),
    });
    const report = await validator.validateJsonLd(built.validationDoc, {
      documentUrl: docUrl(built.path),
      contextTurtle: await sessionMeta(input.sessionId),
    });
    if (!report.conforms) {
      if (enforceShacl) return { error: 'shacl' as const, report: report.results };
      console.warn(`[mcp] SHACL advisory (not blocking) on ${built.path}: ${report.results.join('; ')}`);
    }
    const podBody = await toTurtle(built.validationDoc, docUrl(built.path));
    try {
      await pod.putResource(built.path, podBody, {
        contentType: 'text/turtle', ifNoneMatch: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('412')) {
        console.warn(`[mcp] write_message ${built.path} → conflict (already exists)`);
        return { error: 'conflict' as const };
      }
      throw e;
    }
    ctx.messageWritten = true;
    console.log(`[mcp] write_message → ${built.path}`);
    return { ok: true as const, path: built.path };
  }

  async function assert_triples(input: {
    sessionId: string;
    kind: AssertionKind;
    jsonld: { '@graph'?: unknown[] };
    provenance: { derivedFrom?: string; searchQuery?: string; query?: string; endpoints?: string[] };
  }) {
    if (enforceShacl && (ctx.shaclFailures.get(input.kind) ?? 0) >= MAX_SHACL_FAILURES) {
      return { error: 'persistent' as const, kind: input.kind };
    }
    const built = buildAssertionDoc({
      sessionId: input.sessionId, msgN: ctx.msgN, kind: input.kind,
      now: nowIso(), ts: fileTs(), jsonld: input.jsonld, provenance: input.provenance,
    });
    const report = await validator.validateJsonLd(built.validationDoc, {
      documentUrl: docUrl(built.path),
      contextTurtle: await sessionMeta(input.sessionId),
    });
    if (!report.conforms) {
      if (enforceShacl) {
        ctx.shaclFailures.set(input.kind, (ctx.shaclFailures.get(input.kind) ?? 0) + 1);
        return { error: 'shacl' as const, report: report.results };
      }
      console.warn(`[mcp] SHACL advisory (not blocking) on ${built.path}: ${report.results.join('; ')}`);
    }
    const podBody = await toTurtle(built.validationDoc, docUrl(built.path));
    await pod.putResource(built.path, podBody, { contentType: 'text/turtle' });
    console.log(`[mcp] assert_triples ${input.kind} → ${built.path}`);
    return { ok: true as const, path: built.path };
  }

  return { read_pod, sparql_query, write_message, assert_triples };
}

/** Wrap the bare handlers as an in-process SDK MCP server named "aleph". */
export function createAlephServer(deps: ToolDeps, ctx: RunContext) {
  const t = makeTools(deps, ctx);
  const txt = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }] });

  const server = createSdkMcpServer({
    name: 'aleph',
    version: '0.1.0',
    tools: [
      tool('read_pod', 'GET a pod resource as text/turtle.',
        { path: z.string() },
        async (i) => txt(await t.read_pod(i))),
      tool('sparql_query', 'Run a federated SPARQL query via Comunica.',
        { query: z.string(), sources: z.array(z.string()).optional() },
        async (i) => txt(await t.sparql_query(i))),
      tool('write_message', 'Write the agent reply as the next chat message (SHACL-validated).',
        { sessionId: z.string(), msgN: z.number(), body: z.string() },
        async (i) => txt(await t.write_message(i))),
      tool('assert_triples', 'Persist provenance-tagged triples as an assertion file (SHACL-validated).',
        {
          sessionId: z.string(),
          kind: z.enum(['web', 'sparql', 'imagined']),
          jsonld: z.object({ '@graph': z.array(z.any()).optional() }).passthrough(),
          provenance: z.object({
            derivedFrom: z.string().optional(),
            searchQuery: z.string().optional(),
            query: z.string().optional(),
            endpoints: z.array(z.string()).optional(),
          }),
        },
        async (i) => txt(await t.assert_triples(i as any))),
    ],
  });
  return { server, tools: t };
}
