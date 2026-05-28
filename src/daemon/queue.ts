/** Per-session FIFO. Same sessionId chains; different sessionIds run in parallel. */
export class SessionQueue {
  private tails = new Map<string, Promise<void>>();

  enqueue(sessionId: string, work: () => Promise<void>): void {
    const prev = this.tails.get(sessionId) ?? Promise.resolve();
    // A failed job must not poison the chain: swallow here, log in the worker.
    const next = prev.then(() => work().catch((e) => {
      console.error(`[queue] job failed for ${sessionId}:`, e);
    }));
    this.tails.set(sessionId, next);
    // Drop the map entry once this is the last job and it settles.
    next.finally(() => {
      if (this.tails.get(sessionId) === next) this.tails.delete(sessionId);
    });
  }
}
