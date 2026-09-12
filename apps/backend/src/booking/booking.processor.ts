import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EVENT_BOOKING_QUEUE, pendingJoinKey } from './booking.constants';
import { RedisService } from '../redis/redis.service';
import { EventsService } from '../events/events.service';
import { BookingStatusService } from './booking-status.service';
import { JoinJobData } from './booking-queue.service';

/**
 * Worker for the `event-booking` queue (design doc §4/§9): takes the
 * per-event Redis lock so concurrent join jobs for the same event never hit
 * Postgres at the same time, delegates the actual write (and the
 * overbooking guarantee) to `EventsService.joinEvent`, and records the
 * outcome for the HTTP layer to poll.
 */
@Processor(EVENT_BOOKING_QUEUE)
export class BookingProcessor extends WorkerHost {
  private readonly logger = new Logger(BookingProcessor.name);

  constructor(
    private readonly redis: RedisService,
    private readonly eventsService: EventsService,
    private readonly status: BookingStatusService,
  ) {
    super();
  }

  async process(job: Job<JoinJobData>): Promise<void> {
    const { eventId, userId, requestId } = job.data;
    const lockKey = `lock:event:${eventId}`;
    const token = await this.redis.acquireLock(lockKey, 10_000);

    if (!token) {
      // Не взяли лок — інша job для тієї ж події ще виконується. Кидок тут
      // повертає job у чергу; BullMQ повторить її з backoff (attempts=5).
      throw new Error(`Could not acquire lock for event ${eventId}`);
    }

    try {
      await this.eventsService.joinEvent(eventId, userId);
      await this.status.setStatus(requestId, { state: 'CONFIRMED', eventId, userId });
    } catch (err) {
      // "подія повна" / "вже учасник" / "не знайдено" — не транзієнтні
      // помилки, ретраїти нема сенсу. Фіксуємо REJECTED і НЕ перекидаємо
      // помилку далі: інакше BullMQ трактував би job як failed і ретраїв би
      // її ще 4 рази намарно.
      const reason = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(
        `join rejected: event=${eventId} user=${userId} requestId=${requestId}: ${reason}`,
      );
      await this.status.setStatus(requestId, {
        state: 'REJECTED',
        eventId,
        userId,
        reason,
      });
    } finally {
      await this.redis.releaseLock(lockKey, token);
      // Request has settled (CONFIRMED or REJECTED) — release the
      // per-(event,user) claim so a legitimate future join by this same
      // user (e.g. after leaving) isn't blocked until the TTL expires.
      // Compare-and-delete (via releaseLock's token semantics) so we never
      // clobber a newer claim than the one this job made.
      await this.redis.releaseLock(pendingJoinKey(eventId, userId), requestId);
    }
  }
}
