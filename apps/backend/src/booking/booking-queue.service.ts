import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import {
  EVENT_BOOKING_QUEUE,
  PENDING_JOIN_TTL_SECONDS,
  pendingJoinKey,
} from './booking.constants';
import { BookingStatusService } from './booking-status.service';
import { RedisService } from '../redis/redis.service';

export interface JoinJobData {
  eventId: string;
  userId: string;
  requestId: string;
}

@Injectable()
export class BookingQueueService {
  constructor(
    @InjectQueue(EVENT_BOOKING_QUEUE) private readonly queue: Queue<JoinJobData>,
    private readonly status: BookingStatusService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Enqueues a join request and returns its requestId for status polling.
   *
   * Idempotency (design doc §4/§9): when the client sends its own key, the
   * requestId is `sha256(userId : eventId : key)` — deterministic, so a
   * double-submit or a client retry maps back to the *same* job and the
   * *same* cached outcome. Scoping the hash by userId keeps the id
   * unguessable and stops one client's key from colliding with another's.
   *
   * Without a client key each call mints a fresh `randomUUID()`. A genuine
   * double-click (or two browser tabs) would then enqueue two jobs; both are
   * harmless correctness-wise — `EventsService.joinEvent` dedupes membership
   * on `EventParticipant`'s composite PK (eventId,userId), a real DB
   * constraint, so the second job just gets a clean "already a participant"
   * conflict instead of drifting `seatsTaken` (design doc §13). The
   * `pending-join:{eventId}:{userId}` claim below exists to avoid that wasted
   * duplicate job/DB round-trip in the first place, independently of whether
   * the client sends an idempotency key at all.
   */
  async enqueueJoin(
    eventId: string,
    userId: string,
    idempotencyKey?: string,
  ): Promise<string> {
    const requestId = idempotencyKey
      ? createHash('sha256')
          .update(`${userId}:${eventId}:${idempotencyKey}`)
          .digest('hex')
      : randomUUID();

    // Seen this key before (job still queued, or a settled result still
    // within the status TTL)? Return it untouched — don't enqueue a dupe.
    if (idempotencyKey && (await this.status.getStatus(requestId))) {
      return requestId;
    }

    // Claim the per-(event,user) slot. If someone else already holds it —
    // an in-flight request from this same user for this same event, however
    // it was triggered — piggyback on their requestId instead of enqueueing
    // a second job that would race it for the same seat.
    const claim = await this.redis.setIfAbsent(
      pendingJoinKey(eventId, userId),
      requestId,
      PENDING_JOIN_TTL_SECONDS,
    );
    if (claim) {
      return claim;
    }

    await this.status.setPending(requestId, eventId, userId);
    // `jobId: requestId` is BullMQ's own dedupe: if two concurrent requests
    // with the same key both get past the check above, the second `add` is a
    // no-op while the first job exists, and the double `setPending` writes
    // an identical value — so the race is harmless.
    await this.queue.add(
      'join',
      { eventId, userId, requestId },
      {
        jobId: requestId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 200 },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );
    return requestId;
  }
}
