import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export type BookingRequestStatus =
  | { state: 'PENDING'; eventId: string; userId: string }
  | { state: 'CONFIRMED'; eventId: string; userId: string }
  | { state: 'REJECTED'; eventId: string; userId: string; reason: string };

/** How long a requestId stays pollable after the job settles. */
const STATUS_TTL_SECONDS = 3600;

/**
 * Tracks the outcome of a queued booking request in Redis, keyed by
 * `requestId` (design doc §4/§9: `reqstatus:{requestId}`). The HTTP handler
 * writes PENDING before enqueueing; the worker overwrites it with the final
 * CONFIRMED/REJECTED once the Postgres transaction settles.
 *
 * Every record carries `userId` so the status endpoint can refuse to reveal
 * another user's booking outcome, and `eventId` for the client's convenience.
 */
@Injectable()
export class BookingStatusService {
  constructor(private readonly redis: RedisService) {}

  private key(requestId: string): string {
    return `reqstatus:${requestId}`;
  }

  async setPending(
    requestId: string,
    eventId: string,
    userId: string,
  ): Promise<void> {
    await this.setStatus(requestId, { state: 'PENDING', eventId, userId });
  }

  async setStatus(requestId: string, status: BookingRequestStatus): Promise<void> {
    await this.redis.client.set(
      this.key(requestId),
      JSON.stringify(status),
      'EX',
      STATUS_TTL_SECONDS,
    );
  }

  async getStatus(requestId: string): Promise<BookingRequestStatus | null> {
    const raw = await this.redis.client.get(this.key(requestId));
    return raw ? (JSON.parse(raw) as BookingRequestStatus) : null;
  }
}
