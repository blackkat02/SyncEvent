import { OutboxRelayService } from './outbox-relay.service';

/**
 * Unit tests for {@link OutboxRelayService}. `PrismaService` and
 * `KafkaProducerService` are mocked; the timer/scheduler is never started —
 * tests call `tick()` directly.
 */

type PrismaMock = {
  outboxEvent: { findMany: jest.Mock; update: jest.Mock };
};

const row = (id: string, over: Partial<Record<string, unknown>> = {}) => ({
  id,
  topic: 'event.user-joined',
  key: 'evt-1',
  payload: { eventId: 'evt-1', messageId: id },
  createdAt: new Date(),
  sentAt: null,
  ...over,
});

describe('OutboxRelayService', () => {
  let prisma: PrismaMock;
  let kafka: { emit: jest.Mock };
  let service: OutboxRelayService;

  beforeEach(() => {
    prisma = {
      outboxEvent: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    };
    kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new OutboxRelayService(prisma as never, kafka as never);
  });

  it('publishes each unsent row keyed by eventId and stamps sentAt', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([row('a'), row('b')]);

    await service.tick();

    expect(kafka.emit).toHaveBeenNthCalledWith(
      1,
      'event.user-joined',
      { eventId: 'evt-1', messageId: 'a' },
      'evt-1',
    );
    expect(kafka.emit).toHaveBeenCalledTimes(2);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { sentAt: expect.any(Date) },
    });
    expect(prisma.outboxEvent.update).toHaveBeenCalledTimes(2);
  });

  it('stops the batch at the first publish failure, leaving that row unsent', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([row('a'), row('b'), row('c')]);
    kafka.emit
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('broker down'));

    await service.tick();

    expect(kafka.emit).toHaveBeenCalledTimes(2); // a ok, b fails, c not attempted
    expect(prisma.outboxEvent.update).toHaveBeenCalledTimes(1); // only a marked sent
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { sentAt: expect.any(Date) },
    });
  });

  it('does not run a second tick while one is in flight', async () => {
    let release!: () => void;
    prisma.outboxEvent.findMany.mockImplementation(
      () => new Promise((r) => (release = () => r([]))),
    );

    const first = service.tick();
    const second = service.tick(); // should early-return immediately

    await second;
    expect(prisma.outboxEvent.findMany).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('swallows a DB error so the scheduler keeps going', async () => {
    prisma.outboxEvent.findMany.mockRejectedValue(new Error('pool timeout'));
    await expect(service.tick()).resolves.toBeUndefined();
  });
});
