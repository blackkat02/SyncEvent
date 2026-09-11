import { BookingQueueService } from './booking-queue.service';

/**
 * Unit tests for {@link BookingQueueService}. `Queue` and `BookingStatusService`
 * are mocked; `crypto.randomUUID` is stubbed for a deterministic requestId
 * (the real `crypto.createHash` is kept for the idempotency-key path).
 *
 * `@nestjs/bullmq` ships ESM-only (no CJS build), which Jest's CommonJS
 * module loader can't `require()` — a test-runner gap only (Node itself
 * `require()`s synchronous ESM natively since 22.12). `@InjectQueue` is a
 * parameter decorator we never exercise via real Nest DI here, so a no-op
 * stub is enough.
 */
jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => {},
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'fixed-request-id'),
}));

describe('BookingQueueService', () => {
  let queue: { add: jest.Mock };
  let status: { setPending: jest.Mock; getStatus: jest.Mock };
  let redis: { setIfAbsent: jest.Mock };
  let service: BookingQueueService;

  beforeEach(() => {
    queue = { add: jest.fn() };
    status = { setPending: jest.fn(), getStatus: jest.fn().mockResolvedValue(null) };
    // null = claim succeeded (no one else holds the pending-join slot).
    redis = { setIfAbsent: jest.fn().mockResolvedValue(null) };
    service = new BookingQueueService(queue as never, status as never, redis as never);
  });

  describe('without an idempotency key', () => {
    it('mints a fresh requestId, marks it PENDING, and enqueues a join job', async () => {
      const requestId = await service.enqueueJoin('event-1', 'user-1');

      expect(requestId).toBe('fixed-request-id');
      expect(status.setPending).toHaveBeenCalledWith(
        'fixed-request-id',
        'event-1',
        'user-1',
      );
      expect(queue.add).toHaveBeenCalledWith(
        'join',
        { eventId: 'event-1', userId: 'user-1', requestId: 'fixed-request-id' },
        expect.objectContaining({
          jobId: 'fixed-request-id',
          attempts: 5,
          backoff: { type: 'exponential', delay: 200 },
        }),
      );
    });

    it('marks PENDING before enqueueing, so a poll never races an unset status', async () => {
      const order: string[] = [];
      status.setPending.mockImplementation(() => {
        order.push('setPending');
      });
      queue.add.mockImplementation(() => {
        order.push('add');
      });

      await service.enqueueJoin('event-1', 'user-1');

      expect(order).toEqual(['setPending', 'add']);
    });

    it('never consults existing status (each call is a new request)', async () => {
      await service.enqueueJoin('event-1', 'user-1');
      expect(status.getStatus).not.toHaveBeenCalled();
    });

    it('claims the pending-join slot for this event+user before enqueueing', async () => {
      await service.enqueueJoin('event-1', 'user-1');

      expect(redis.setIfAbsent).toHaveBeenCalledWith(
        'pending-join:event-1:user-1',
        'fixed-request-id',
        60,
      );
    });
  });

  describe('when another request for this user+event is already in flight', () => {
    it('returns the existing requestId without enqueueing a second job', async () => {
      redis.setIfAbsent.mockResolvedValue('in-flight-request-id');

      const requestId = await service.enqueueJoin('event-1', 'user-1');

      expect(requestId).toBe('in-flight-request-id');
      expect(status.setPending).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('piggybacks even when this call carries its own idempotency key', async () => {
      redis.setIfAbsent.mockResolvedValue('in-flight-request-id');

      const requestId = await service.enqueueJoin('event-1', 'user-1', 'key-xyz');

      expect(requestId).toBe('in-flight-request-id');
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('with a client idempotency key', () => {
    it('derives a stable 64-hex requestId scoped by user + event + key', async () => {
      const a = await service.enqueueJoin('event-1', 'user-1', 'key-abc');
      const b = await service.enqueueJoin('event-1', 'user-1', 'key-abc');
      const other = await service.enqueueJoin('event-1', 'user-1', 'key-xyz');
      const otherUser = await service.enqueueJoin('event-1', 'user-2', 'key-abc');

      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(b).toBe(a);
      expect(other).not.toBe(a);
      expect(otherUser).not.toBe(a);
    });

    it('enqueues once when the key is new', async () => {
      const requestId = await service.enqueueJoin('event-1', 'user-1', 'key-abc');

      expect(status.getStatus).toHaveBeenCalledWith(requestId);
      expect(status.setPending).toHaveBeenCalledWith(requestId, 'event-1', 'user-1');
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('returns the existing requestId without re-enqueueing when the key was already seen', async () => {
      status.getStatus.mockResolvedValue({
        state: 'PENDING',
        eventId: 'event-1',
        userId: 'user-1',
      });

      const requestId = await service.enqueueJoin('event-1', 'user-1', 'key-abc');

      expect(requestId).toMatch(/^[0-9a-f]{64}$/);
      expect(status.setPending).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
