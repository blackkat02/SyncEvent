import { BookingStatusService } from './booking-status.service';

/**
 * Unit tests for {@link BookingStatusService}. `RedisService` is mocked down
 * to just the `client.get`/`client.set` surface this service actually uses.
 */

const createRedisMock = () => ({
  client: {
    get: jest.fn(),
    set: jest.fn(),
  },
});

describe('BookingStatusService', () => {
  let redis: ReturnType<typeof createRedisMock>;
  let service: BookingStatusService;

  beforeEach(() => {
    redis = createRedisMock();
    service = new BookingStatusService(redis as never);
  });

  it('writes a PENDING status (with owner + event) and a TTL', async () => {
    await service.setPending('req-1', 'e1', 'u1');

    expect(redis.client.set).toHaveBeenCalledWith(
      'reqstatus:req-1',
      JSON.stringify({ state: 'PENDING', eventId: 'e1', userId: 'u1' }),
      'EX',
      3600,
    );
  });

  it('writes an arbitrary status verbatim', async () => {
    await service.setStatus('req-1', {
      state: 'CONFIRMED',
      eventId: 'e1',
      userId: 'u1',
    });

    expect(redis.client.set).toHaveBeenCalledWith(
      'reqstatus:req-1',
      JSON.stringify({ state: 'CONFIRMED', eventId: 'e1', userId: 'u1' }),
      'EX',
      3600,
    );
  });

  it('returns the parsed status when present', async () => {
    redis.client.get.mockResolvedValue(
      JSON.stringify({
        state: 'REJECTED',
        eventId: 'e1',
        userId: 'u1',
        reason: 'Event is full',
      }),
    );

    const result = await service.getStatus('req-1');

    expect(redis.client.get).toHaveBeenCalledWith('reqstatus:req-1');
    expect(result).toEqual({
      state: 'REJECTED',
      eventId: 'e1',
      userId: 'u1',
      reason: 'Event is full',
    });
  });

  it('returns null for an unknown/expired request id', async () => {
    redis.client.get.mockResolvedValue(null);

    const result = await service.getStatus('missing');

    expect(result).toBeNull();
  });
});
