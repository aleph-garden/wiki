import { subscribeContainer, type SubscribeOptions } from './subscriber';

const SESSIONS_PATH = '/aleph/sessions/';

interface PodLike {
  baseUrl: string;
  listContainer(path: string): Promise<string[]>;
}

export interface WatchOptions extends SubscribeOptions {
  log?: (msg: string) => void;
}

/**
 * Watch for new user messages across every session.
 *
 * JSS notifications do not propagate descendant writes up to an ancestor
 * container's subscriber (a write to `/aleph/sessions/{id}/msgN` publishes only
 * on `{id}/`, not on `/aleph/sessions/`). So a single subscription to the
 * parent never sees new messages in existing sessions. Instead we open one
 * subscription per session container, and keep a subscription on the parent
 * purely to detect *new* sessions and subscribe to them too.
 *
 * `onSessionPub(url)` fires for each `pub` on a session container.
 * Returns a teardown that closes every subscription.
 */
export async function watchSessions(
  pod: PodLike,
  podBase: string,
  onSessionPub: (url: string) => void,
  opts: WatchOptions = {},
): Promise<() => void> {
  const log = opts.log ?? (() => {});
  const base = podBase.replace(/\/$/, '');
  const subs = new Map<string, () => void>(); // sessionId → teardown

  const sessionIdOf = (entry: string): string | null => {
    const url = entry.startsWith('http') ? entry : `${base}${SESSIONS_PATH}${entry}`;
    // Trailing slash → it's a container (a session), not a stray file.
    const m = url.match(/\/aleph\/sessions\/([^/]+)\/$/);
    return m ? m[1] : null;
  };

  const watchSession = (sessionId: string) => {
    if (subs.has(sessionId)) return;
    log(`watching session ${sessionId}`);
    subs.set(sessionId, subscribeContainer(podBase, `${SESSIONS_PATH}${sessionId}/`, onSessionPub, opts));
  };

  const refresh = async () => {
    const entries = await pod.listContainer(SESSIONS_PATH);
    for (const e of entries) {
      const id = sessionIdOf(e);
      if (id) watchSession(id);
    }
  };

  await refresh();
  log(`watching ${subs.size} session(s); subscribing to parent for new sessions`);

  // Parent subscription: a pub here means the session set changed → re-scan.
  const stopParent = subscribeContainer(podBase, SESSIONS_PATH, () => { void refresh(); }, opts);

  return () => {
    stopParent();
    for (const stop of subs.values()) stop();
    subs.clear();
  };
}
