export const EVENT_BOOKING_QUEUE = 'event-booking';

/**
 * How long a `pending-join:{eventId}:{userId}` claim (see
 * `pendingJoinKey`) survives without being explicitly released. Bounds how
 * long a crashed worker (one that took the claim but never reached the
 * `finally` that releases it) can block a genuine retry by the same user;
 * generous relative to the queue's own worst case (5 attempts, exponential
 * backoff starting at 200ms, plus the 10s per-event lock TTL).
 */
export const PENDING_JOIN_TTL_SECONDS = 60;

/**
 * Key used to dedupe concurrent join requests from the *same user* for the
 * *same event* (design doc §2.3/§13 residual risk: two truly simultaneous
 * join calls from one user, with no shared idempotency key, would otherwise
 * mint two requestIds and enqueue two jobs). Whoever claims this key first
 * owns the in-flight request; everyone else piggybacks on that requestId
 * instead of enqueueing a duplicate job.
 */
export function pendingJoinKey(eventId: string, userId: string): string {
  return `pending-join:${eventId}:${userId}`;
}
