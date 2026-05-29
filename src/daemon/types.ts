import type { PodClient } from '../lib/pod';
import type { ShaclValidator } from './shacl';
import type { SparqlEngine } from './mcp/sparql';

/** Resolved daemon configuration. */
export interface Config {
  podBase: string;
  comunicaSources: string[];
  promptPath: string;
  model?: string;
  /**
   * When true, SHACL non-conformance blocks the write (and trips the retry cap).
   * When false (default), validation is advisory: it runs and logs warnings but
   * never blocks a write. Kept off while the vocab is still unstable.
   */
  shaclEnforce: boolean;
}

/** A genuinely-new, unanswered user message that needs a reply. */
export interface Trigger {
  sessionId: string;
  msgN: number;
}

/** Long-lived dependencies, built once at startup, shared across runs. */
export interface DaemonDeps {
  config: Config;
  pod: PodClient;
  validator: ShaclValidator;
  sparql: SparqlEngine;
  /** Renders the event prompt with {{sessionId}}/{{msgN}} substituted. */
  renderPrompt: (trigger: Trigger) => string;
}

/** Per-run mutable state threaded into the MCP tools. */
export interface RunContext {
  sessionId: string;
  msgN: number;
  /** Set true once write_message PUTs a reply successfully. */
  messageWritten: boolean;
}
