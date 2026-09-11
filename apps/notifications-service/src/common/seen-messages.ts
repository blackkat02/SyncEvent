/**
 * Bounded in-memory set of already-processed message ids, for consumer-side
 * idempotency against Kafka redeliveries (design doc §8).
 *
 * Process-local: a restart re-processes recent messages. That is acceptable
 * while handlers only log; once a handler sends a real notification, move
 * this to a shared store (Redis `SET NX`, or a `processed_messages` table).
 */
export class SeenMessages {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];

  constructor(private readonly max = 10_000) {}

  /** Records `id` and returns true if it was new; false if already seen. */
  add(id: string): boolean {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    this.order.push(id);
    if (this.order.length > this.max) {
      const evicted = this.order.shift();
      if (evicted !== undefined) this.seen.delete(evicted);
    }
    return true;
  }
}
