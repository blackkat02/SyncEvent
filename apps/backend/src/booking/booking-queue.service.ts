import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import { EVENT_BOOKING_QUEUE } from './booking.constants';
import { BookingStatusService } from './booking-status.service';

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
   * Without a client key each call mints a fresh `randomUUID()` — a genuine
   * double-click then enqueues two jobs, but both are harmless: they
   * serialize on the same per-event Redis lock and the same guarded
   * Postgres UPDATE in `EventsService.joinEvent`.
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
