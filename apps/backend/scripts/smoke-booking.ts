/**
 * Live smoke test for the Phase 1 booking queue
 * (docs/architecture/booking-concurrency.md §9 / §13 Крок 5).
 *
 * Boots the real AppModule as an application context — same wiring as the
 * running server minus HTTP — so it exercises the whole path against real
 * infrastructure: BullMQ enqueue on Redis, the @Processor worker consuming,
 * the per-event Redis lock, EventsService.joinEvent on Postgres, and the
 * status read-back on Redis.
 *
 * Asserts: N concurrent joiners on a capacity-1 event → exactly one
 * CONFIRMED, N-1 REJECTED, Event.seatsTaken === 1, one participant row;
 * the idempotency key (same key twice → one requestId, one seat); and that
 * a transactional-outbox row was written for the confirmed join. With
 * SMOKE_KAFKA=1 it also waits for the relay to stamp `sentAt` (needs a
 * running broker); otherwise the relay is disabled for a clean run.
 *
 * Prerequisites (from apps/backend, Node >= 22.12):
 *
 *   docker compose --profile postgres up -d db-postgres redis     # + kafka for SMOKE_KAFKA=1
 *   DB_PROVIDER=postgresql node scripts/check-db.js
 *   pnpm exec prisma generate
 *   pnpm exec prisma db push
 *   DATABASE_URL=postgresql://user:password@localhost:5432/syncevent_db?schema=public \
 *   REDIS_HOST=localhost REDIS_PORT=6379 \
 *   pnpm exec ts-node scripts/smoke-booking.ts
 *
 *   # also verify the Kafka relay:
 *   SMOKE_KAFKA=1 KAFKA_BROKER=localhost:29092 DATABASE_URL=… REDIS_HOST=localhost pnpm smoke:booking
 *
 * Exit code 0 = all assertions passed, 1 = failure.
 */

// env.ts throws at import time on missing secrets; the booking path never
// uses them, so provide throwaway values before anything pulls env.ts in.
process.env.JWT_SECRET ??= 'smoke-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'smoke-jwt-refresh-secret';
process.env.NODE_ENV ??= 'development';
// Keep the outbox relay quiet unless we're explicitly testing the Kafka hop.
if (process.env.SMOKE_KAFKA !== '1') {
  process.env.OUTBOX_RELAY_DISABLED ??= 'true';
}

const N = 5;
const POLL_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  // require(), not a static/dynamic ESM import: ts-node runs this script in
  // CommonJS mode, where a relative specifier keeps its literal extension
  // (Node won't remap `foo.js` to the `foo.ts` source that's actually on
  // disk — that remapping only happens under ts-node's ESM loader). require()
  // resolves the extensionless path through ts-node's registered `.ts`
  // extension, and — same as the dynamic import it replaces — still runs
  // after the env-var assignments above, which is what env.ts needs.
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { PrismaService } = require('../prisma/prisma.service');
  const { BookingQueueService } = require('../src/booking/booking-queue.service');
  const { BookingStatusService } = require('../src/booking/booking-status.service');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  const prisma = app.get(PrismaService);
  const queue = app.get(BookingQueueService);
  const status = app.get(BookingStatusService);

  const runId = Date.now();
  const eventIds: string[] = [];
  const userIds: string[] = [];

  const waitFor = async (requestId: string) => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const s = await status.getStatus(requestId);
      if (s && s.state !== 'PENDING') return s;
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`timed out waiting for ${requestId}`);
  };

  try {
    const author = await prisma.user.create({
      data: { email: `smoke-author-${runId}@test.local`, password: 'x' },
    });
    userIds.push(author.id);

    const candidates = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        prisma.user.create({
          data: { email: `smoke-cand-${runId}-${i}@test.local`, password: 'x' },
        }),
      ),
    );
    userIds.push(...candidates.map((c) => c.id));

    const event = await prisma.event.create({
      data: {
        title: `Smoke booking ${runId}`,
        date: new Date(Date.now() + 86_400_000),
        location: 'smoke',
        capacity: 1,
        authorId: author.id,
      },
    });
    eventIds.push(event.id);

    // --- 1. N concurrent joiners, one seat ---------------------------------
    console.log(`\n[1] ${N} concurrent joiners on a capacity-1 event`);
    const requestIds = await Promise.all(
      candidates.map((u) => queue.enqueueJoin(event.id, u.id)),
    );
    const outcomes = await Promise.all(requestIds.map(waitFor));

    const confirmed = outcomes.filter((o) => o.state === 'CONFIRMED');
    const rejected = outcomes.filter((o) => o.state === 'REJECTED');
    console.log(
      `    confirmed=${confirmed.length} rejected=${rejected.length}` +
        `  reasons=${JSON.stringify(rejected.map((r: any) => r.reason))}`,
    );
    assert(confirmed.length === 1, `exactly 1 CONFIRMED, got ${confirmed.length}`);
    assert(
      rejected.length === N - 1,
      `exactly ${N - 1} REJECTED, got ${rejected.length}`,
    );

    const fresh = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      include: { participants: true },
    });
    assert(fresh.seatsTaken === 1, `seatsTaken === 1, got ${fresh.seatsTaken}`);
    assert(
      fresh.participants.length === 1,
      `1 participant row, got ${fresh.participants.length}`,
    );

    // --- 2. idempotency key dedupes ---------------------------------------
    console.log(`\n[2] same idempotency key enqueued twice`);
    const event2 = await prisma.event.create({
      data: {
        title: `Smoke idem ${runId}`,
        date: new Date(Date.now() + 86_400_000),
        location: 'smoke',
        capacity: 10,
        authorId: author.id,
      },
    });
    eventIds.push(event2.id);

    const joiner = candidates[0];
    const key = `smoke-key-${runId}`;
    const r1 = await queue.enqueueJoin(event2.id, joiner.id, key);
    const r2 = await queue.enqueueJoin(event2.id, joiner.id, key);
    assert(r1 === r2, `same requestId for a repeated key (${r1} vs ${r2})`);
    const outcome = await waitFor(r1);
    console.log(`    requestId=${r1.slice(0, 12)}… outcome=${outcome.state}`);
    assert(outcome.state === 'CONFIRMED', `key join CONFIRMED, got ${outcome.state}`);

    const fresh2 = await prisma.event.findUniqueOrThrow({
      where: { id: event2.id },
    });
    assert(
      fresh2.seatsTaken === 1,
      `one seat taken despite double-submit, got ${fresh2.seatsTaken}`,
    );

    // --- 3. transactional outbox (Phase 2) -------------------------------
    console.log(`\n[3] outbox row for the confirmed join`);
    const joinRow = await prisma.outboxEvent.findFirst({
      where: { key: event.id, topic: 'event.user-joined' },
    });
    assert(joinRow, 'an event.user-joined outbox row was written');
    assert(
      (joinRow!.payload as Record<string, unknown>).messageId === joinRow!.id,
      'payload.messageId equals the row id',
    );
    console.log(`    row ${joinRow!.id.slice(0, 12)}… sentAt=${joinRow!.sentAt ?? 'null'}`);

    if (process.env.SMOKE_KAFKA === '1') {
      console.log('    waiting for the relay to publish it to Kafka…');
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let sent: Date | null = null;
      while (Date.now() < deadline && !sent) {
        const r = await prisma.outboxEvent.findUnique({ where: { id: joinRow!.id } });
        sent = r?.sentAt ?? null;
        if (!sent) await sleep(POLL_INTERVAL_MS);
      }
      assert(sent, 'relay stamped sentAt (published to Kafka within timeout)');
      console.log(`    published, sentAt=${sent!.toISOString()}`);
    } else {
      console.log('    (set SMOKE_KAFKA=1 + a running broker to verify the relay)');
    }

    console.log('\n✅ smoke test passed\n');
  } finally {
    if (eventIds.length) {
      await prisma.outboxEvent.deleteMany({ where: { key: { in: eventIds } } });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    }
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  });
