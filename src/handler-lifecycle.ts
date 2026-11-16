/** Tracks work, not network responses: disconnecting a client does not cancel work. */
export class HandlerLifecycle {
  private accepting = true;
  private readonly active = new Set<Promise<unknown>>();
  async run<T>(handler: () => Promise<T> | T): Promise<T> {
    if (!this.accepting) throw new Error("Server closing");
    // Register before handler executes so even synchronous throws are tracked.
    const operation = Promise.resolve().then(handler);
    this.active.add(operation);
    try { return await operation; } finally { this.active.delete(operation); }
  }
  stopAccepting(): void { this.accepting = false; }
  async drain(): Promise<void> {
    while (this.active.size) await Promise.allSettled([...this.active]);
  }
}
