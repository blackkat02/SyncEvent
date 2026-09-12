import { BookingProcessor } from './booking.processor';

/**
 * Unit tests for {@link BookingProcessor}. `RedisService`, `EventsService`
 * and `BookingStatusService` are all mocked — this only verifies the
 * worker's own control flow (lock → joinEvent → status → unlock), not the
 * real Redis/Postgres behaviour those collaborators provide.
 *
 * `@nestjs/bullmq` ships ESM-only (no CJS build), which Jest's CommonJS
 * module loader can't `require()` — a test-runner gap only (Node itself
 * `require()`s synchronous ESM natively since 22.12). `@Processor`/`WorkerHost`
 * are never exercised via real Nest DI or a real BullMQ worker here, so
 * no-op stubs are enough — `WorkerHost` just needs to be an extendable class.
 */
jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => {},
  WorkerHost: class {},
}));

const makeJob = (overrides: Partial<{ eventId: string; userId: string; requestId: string }> = {}) =>
  ({
    data: {
      eventId: 'event-1',
      userId: 'user-1',
      requestId: 'req-1',
      ...overrides,
    },
  }) as never;

describe('BookingProcessor', () => {
  let redis: { acquireLock: jest.Mock; releaseLock: jest.Mock };
  let eventsService: { joinEvent: jest.Mock };
  let status: { setStatus: jest.Mock };
  let processor: BookingProcessor;

  beforeEach(() => {
    redis = { acquireLock: jest.fn(), releaseLock: jest.fn() };
    eventsService = { joinEvent: jest.fn() };
    status = { setStatus: jest.fn() };
    processor = new BookingProcessor(
      redis as never,
      eventsService as never,
      status as never,
    );
  });

  it('confirms the request when joinEvent succeeds, then releases the lock', async () => {
    redis.acquireLock.mockResolvedValue('token-1');
    eventsService.joinEvent.mockResolvedValue({ id: 'event-1' });

    await processor.process(makeJob());

    expect(redis.acquireLock).toHaveBeenCalledWith('lock:event:event-1', 10_000);
    expect(eventsService.joinEvent).toHaveBeenCalledWith('event-1', 'user-1');
    expect(status.setStatus).toHaveBeenCalledWith('req-1', {
      state: 'CONFIRMED',
      eventId: 'event-1',
      userId: 'user-1',
    });
    expect(redis.releaseLock).toHaveBeenCalledWith('lock:event:event-1', 'token-1');
    expect(redis.releaseLock).toHaveBeenCalledWith(
      'pending-join:event-1:user-1',
      'req-1',
    );
  });

  it('records REJECTED (not a thrown failure) when joinEvent rejects, and still releases the lock', async () => {
    redis.acquireLock.mockResolvedValue('token-1');
    eventsService.joinEvent.mockRejectedValue(new Error('Event is full'));

    await expect(processor.process(makeJob())).resolves.toBeUndefined();

    expect(status.setStatus).toHaveBeenCalledWith('req-1', {
      state: 'REJECTED',
      eventId: 'event-1',
      userId: 'user-1',
      reason: 'Event is full',
    });
    expect(redis.releaseLock).toHaveBeenCalledWith('lock:event:event-1', 'token-1');
    expect(redis.releaseLock).toHaveBeenCalledWith(
      'pending-join:event-1:user-1',
      'req-1',
    );
  });

  it('throws (so BullMQ retries) when the per-event lock is not acquired, without touching status or the pending-join claim', async () => {
    redis.acquireLock.mockResolvedValue(null);

    await expect(processor.process(makeJob())).rejects.toThrow(
      'Could not acquire lock for event event-1',
    );

    expect(eventsService.joinEvent).not.toHaveBeenCalled();
    expect(status.setStatus).not.toHaveBeenCalled();
    expect(redis.releaseLock).not.toHaveBeenCalled();
  });
});
