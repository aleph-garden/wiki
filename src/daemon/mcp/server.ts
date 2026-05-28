import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { PodClient } from '../../lib/pod';
import type { ShaclValidator } from '../shacl';
import type { SparqlEngine } from './sparql';
import type { RunContext } from '../types';
import { buildReplyDoc, buildAssertionDoc, type AssertionKind } from '../templates';

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

  async function read_pod(input: { path: string }) {
    try {
      const body = await pod.getResource(input.path);
      if (body === null) return { error: '404' as const };
      return { body, contentType: 'text/turtle' };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function sparql_query(input: { query: string; sources?: string[] }) {
    return sparql.run(input.query, input.sources);
  }

  async function write_message(input: { sessionId: string; msgN: number; body: string }) {
    const built = buildReplyDoc({
      sessionId: input.sessionId, msgN: input.msgN, body: input.body, now: nowIso(),
    });
    const report = await validator.validateJsonLd(built.validationDoc, docUrl(built.path));
    if (!report.conforms) {
      if (enforceShacl) return { error: 'shacl' as const, report: report.results };
      console.warn(`[mcp] SHACL advisory (not blocking) on ${built.path}: ${report.results.join('; ')}`);
    }
    try {
      await pod.putResource(built.path, built.podBody, {
        contentType: 'application/ld+json', ifNoneMatch: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('412')) return { error: 'conflict' as const };
      throw e;
    }
    ctx.messageWritten = true;
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
    const report = await validator.validateJsonLd(built.validationDoc, docUrl(built.path));
    if (!report.conforms) {
      if (enforceShacl) {
        ctx.shaclFailures.set(input.kind, (ctx.shaclFailures.get(input.kind) ?? 0) + 1);
        return { error: 'shacl' as const, report: report.results };
      }
      console.warn(`[mcp] SHACL advisory (not blocking) on ${built.path}: ${report.results.join('; ')}`);
    }
    await pod.putResource(built.path, built.podBody, { contentType: 'application/ld+json' });
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
