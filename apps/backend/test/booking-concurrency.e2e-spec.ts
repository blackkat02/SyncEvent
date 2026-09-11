import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../src/events/events.service';

/**
 * Real-Postgres proof that `EventsService.joinEvent` cannot overbook a
 * capacity-limited event under concurrency — design doc §13 Крок 5
 * (docs/architecture/booking-concurrency.md). Runs against an actual
 * database (not mocked Prisma), because the guarantee lives in Postgres
 * row-locking behaviour that a mock cannot exercise.
 *
 * Prerequisite: a Postgres instance reachable via DATABASE_URL, migrated
 * with the `postgresql` provider (schema.prisma ships committed as
 * `mysql` — see check-db.js). From apps/backend:
 *
 *   docker compose --profile postgres up -d db-postgres
 *   DB_PROVIDER=postgresql node scripts/check-db.js
 *   pnpm exec prisma generate
 *   pnpm exec prisma db push
 *   DATABASE_URL=postgresql://<user>:<password>@localhost:<port>/<db>?schema=public pnpm test:e2e
 */
describe('EventsService.joinEvent concurrency (real Postgres)', () => {
  let prisma: PrismaService;
  let service: EventsService;

  const runId = Date.now();
  const cleanupEventIds: string[] = [];
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new EventsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    if (cleanupEventIds.length) {
      // OutboxEvent has no FK to Event, so it does not cascade — clean it here.
      await prisma.outboxEvent.deleteMany({
        where: { key: { in: cleanupEventIds } },
      });
      await prisma.event.deleteMany({ where: { id: { in: cleanupEventIds } } });
      cleanupEventIds.length = 0;
    }
    if (cleanupUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
      cleanupUserIds.length = 0;
    }
  });

  it('lets exactly one of N concurrent joiners claim the last seat', async () => {
    const N = 10;

    const author = await prisma.user.create({
      data: { email: `author-${runId}@test.local`, password: 'x' },
    });
    cleanupUserIds.push(author.id);

    const candidates = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        prisma.user.create({
          data: { email: `candidate-${runId}-${i}@test.local`, password: 'x' },
        }),
      ),
    );
    cleanupUserIds.push(...candidates.map((c) => c.id));

    const event = await prisma.event.create({
      data: {
        title: `Race condition fixture ${runId}`,
        date: new Date(Date.now() + 24 * 60 * 60 * 1000),
        location: 'test',
        capacity: 1,
        authorId: author.id,
      },
    });
    cleanupEventIds.push(event.id);

    const results = await Promise.allSettled(
      candidates.map((user) => service.joinEvent(event.id, user.id)),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    // exactly one winner, no overbooking, no lost/duplicate writes
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(N - 1);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(ConflictException);
    }

    const finalEvent = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      include: { participants: true },
    });
    expect(finalEvent.seatsTaken).toBe(1);
    expect(finalEvent.participants).toHaveLength(1);
  }, 30_000);
});
