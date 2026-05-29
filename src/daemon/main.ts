import { readFileSync } from 'node:fs';
import { PodClient } from '../lib/pod';
import { loadConfig } from './config';
import { ShaclValidator } from './shacl';
import { SparqlEngine } from './mcp/sparql';
import { routeEvent, type PodLike } from './router';
import { SessionQueue } from './queue';
import { subscribeContainer } from './subscriber';
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
  const enqueueRun = (t: Trigger) => queue.enqueue(t.sessionId, () => runAgent(t, deps));

  console.log(`[daemon] draining unanswered sessions on ${config.podBase}`);
  await drainUnanswered(pod, enqueueRun);

  console.log(`[daemon] subscribing to ${SESSIONS_PATH}`);
  subscribeContainer(config.podBase, SESSIONS_PATH, async (url) => {
    const trigger = await routeEvent(url, pod);
    if (trigger) enqueueRun(trigger);
  }, { onStatus: (s) => console.log(`[daemon] ws ${s}`) });
}

if (import.meta.main) {
  main().catch((e) => {
    console.error('[daemon] fatal:', e);
    process.exit(1);
  });
}
