import WS from 'ws';

export interface SubscribeOptions {
  /** Injectable WS constructor for tests. Defaults to the `ws` package. */
  WebSocketCtor?: typeof WS;
  onStatus?: (s: 'connecting' | 'online' | 'reconnecting') => void;
}

/**
 * Subscribe to a JSS container's notifications. Calls onPub(fullUrl) for each
 * `pub <url>` frame. Reconnects with exponential backoff (1s → 30s).
 * Returns an unsubscribe function.
 */
export function subscribeContainer(
  podBase: string,
  path: string,
  onPub: (url: string) => void,
  opts: SubscribeOptions = {},
): () => void {
  const Ctor = opts.WebSocketCtor ?? WS;
  const wsUrl = podBase.replace(/^http/, 'ws').replace(/\/$/, '') + '/.notifications';
  const subTarget = podBase.replace(/\/$/, '') + path;
  let ws: WS | null = null;
  let closed = false;
  let backoff = 1000;

  const open = () => {
    if (closed) return;
    opts.onStatus?.('connecting');
    ws = new Ctor(wsUrl, ['solid-0.1']);
    ws.on('open', () => {
      backoff = 1000;
      opts.onStatus?.('online');
      ws!.send(`sub ${subTarget}`);
    });
    ws.on('message', (data: unknown) => {
      const text = typeof data === 'string' ? data : String(data);
      if (!text.startsWith('pub ')) return;
      onPub(text.slice(4).trim());
    });
    ws.on('close', () => {
      if (closed) return;
      opts.onStatus?.('reconnecting');
      setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, 30000);
    });
    ws.on('error', () => { ws?.close(); });
  };

  open();
  return () => { closed = true; ws?.close(); };
}
