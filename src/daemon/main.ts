import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PodClient } from '../lib/pod';
import { loadConfig } from './config';
import { ShaclValidator } from './shacl';
import { SparqlEngine } from './mcp/sparql';
import { routeEvent, type PodLike } from './router';
import { SessionQueue } from './queue';
import { watchSessions } from './subscriptions';
import { runAgent } from './runner';
import type { DaemonDeps, Trigger } from './types';

const SESSIONS_PATH = '/aleph/sessions/';

/** List all sessions, route each, and hand every trigger to `enqueueRun`. */
export async function drainUnanswered(
  pod: PodLike,
  enqueueRun: (trigger: Trigger) => void,
): Promise<void> {
  const sessions = await pod.listContainer(SESSIONS_PATH);
  for (const sessionUrl of sessions) {
    const url = sessionUrl.startsWith('http') ? sessionUrl : `${pod.baseUrl}${SESSIONS_PATH}${sessionUrl}`;
    const trigger = await routeEvent(url, pod);
    if (trigger) enqueueRun(trigger);
  }
}

export async function main(): Promise<void> {
  const config = loadConfig();
  const pod = new PodClient(config.podBase);
  const validator = await ShaclValidator.load('vocab/aleph-shapes.ttl');
  const sparql = new SparqlEngine(config.comunicaSources);
  const promptTemplate = readFileSync(config.promptPath, 'utf-8');

  const deps: DaemonDeps = {
    config, pod, validator, sparql,
    renderPrompt: (t) => promptTemplate
      .replaceAll('{{sessionId}}', t.sessionId)
      .replaceAll('{{msgN}}', String(t.msgN)),
  };

  const queue = new SessionQueue();
  const enqueueRun = (t: Trigger) => {
    console.log(`[daemon] enqueue run: ${t.sessionId} msg${t.msgN}`);
    queue.enqueue(t.sessionId, () => runAgent(t, deps));
  };

  console.log(`[daemon] draining unanswered sessions on ${config.podBase}`);
  await drainUnanswered(pod, enqueueRun);

  // Per-session subscriptions: JSS doesn't surface descendant writes on the
  // parent container, so we watch each session and the parent (for new ones).
  const onPub = async (url: string) => {
    console.log(`[daemon] pub ${url}`);
    const trigger = await routeEvent(url, pod);
    if (trigger) enqueueRun(trigger);
    else console.log(`[daemon] pub ${url}: no trigger (not a new unanswered user msg)`);
  };
  await watchSessions(pod, config.podBase, onPub, {
    log: (m) => console.log(`[daemon] ${m}`),
  });
}

// Entry guard. `import.meta.main` is Bun-only; the daemon runs under Node
// (Comunica needs Node's undici). Compare the module URL to argv[1] so it
// fires when invoked directly under either runtime, but not when imported.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((e) => {
    console.error('[daemon] fatal:', e);
    process.exit(1);
  });
}
