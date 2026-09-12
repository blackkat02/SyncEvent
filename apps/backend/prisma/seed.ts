import { PrismaClient, Visibility } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({ log: ['error'] });

async function main() {
  const password = await bcrypt.hash('password123', 10);

  const user1 = await prisma.user.upsert({
    where: { email: 'eduard@example.com' },
    update: {},
    create: { email: 'eduard@example.com', password, displayName: 'eduard' },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'jane@example.com' },
    update: {},
    create: { email: 'jane@example.com', password, displayName: 'Jane Participant' },
  });

  const user3 = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', password, displayName: 'Admin User' },
  });

  // Test users for concurrency testing (design doc §13,
  // docs/architecture/booking-concurrency.md). Deliberately NOT connected to
  // any event here — they exist so a script/curl loop can log in as N
  // distinct accounts and race for the last seat on `event-race-seat` below,
  // e.g.:
  //   for i in $(seq -w 1 10); do
  //     TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  //       -H 'content-type: application/json' \
  //       -d "{\"email\":\"race-user-$i@test.local\",\"password\":\"password123\"}" \
  //       | jq -r .accessToken)
  //     curl -s -X POST localhost:3000/api/events/event-race-seat/join \
  //       -H "authorization: Bearer $TOKEN" &
  //   done; wait
  // Same password as the other seed users (hashed once, above).
  const RACE_TEST_USER_COUNT = 10;
  await Promise.all(
    Array.from({ length: RACE_TEST_USER_COUNT }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      const email = `race-user-${n}@test.local`;
      return prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, password, displayName: `Race Tester ${n}` },
      });
    }),
  );

  // Filler participants so the two fixtures below don't *look* almost empty
  // in the UI. Kept as a separate pool from race-user-* (which must stay
  // unjoined — it's the pool that actually races for the open seat) and
  // never includes jane (user2), who is the dedup test's designated joiner
  // for `event-duplicate-check` and must stay free to join it.
  const FILLER_COUNT = 6;
  const fillers = await Promise.all(
    Array.from({ length: FILLER_COUNT }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      const email = `filler-${n}@test.local`;
      return prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, password, displayName: `Filler Guest ${n}` },
      });
    }),
  );

  await prisma.event.upsert({
    where: { id: 'event-sold-out' },
    update: {
      seatsTaken: 2,
      // Must match `create` below — the author (user1) is always a
      // participant (same invariant `EventsService.create` enforces).
      // Explicit join model has no "set" (replace-whole-relation) shorthand,
      // so re-seeding clears and recreates the rows instead.
      participants: {
        deleteMany: {},
        createMany: { data: [{ userId: user1.id }, { userId: user2.id }] },
      },
    },
    create: {
      id: 'event-sold-out',
      title: 'Sold Out Workshop',
      description: 'This event is already full to test UI labels and capacity logic',
      date: new Date('2026-12-01T10:00:00Z'),
      location: 'Small Meeting Room',
      capacity: 2,
      seatsTaken: 2,
      visibility: Visibility.PUBLIC,
      authorId: user1.id,
      participants: { create: [{ userId: user1.id }, { userId: user2.id }] },
    },
  });

  await prisma.event.upsert({
    where: { id: 'event-main' },
    update: {},
    create: {
      id: 'event-main',
      title: 'Tech Conference 2026',
      description: 'Annual technology conference featuring the latest innovations',
      date: new Date('2026-11-15T09:00:00Z'),
      location: 'Convention Center, San Francisco',
      capacity: 500,
      seatsTaken: 1,
      visibility: Visibility.PUBLIC,
      authorId: user1.id,
      participants: { create: [{ userId: user2.id }] },
    },
  });

  // Fixture for manual/automated race-condition testing (design doc
  // docs/architecture/booking-concurrency.md §13): capacity 6, author + 4
  // fillers already hold 5 seats, exactly 1 seat left open — looks "almost
  // sold out" instead of near-empty, while still leaving room for the
  // race-user-* pool to actually compete for the last seat. Fire N
  // concurrent `POST /events/event-race-seat/join` from *different* users
  // (e.g. a small script hitting the queue) and confirm exactly one
  // CONFIRMED, the rest REJECTED with "Event is full", `seatsTaken` stays at 6.
  const raceSeatParticipants = [user1, ...fillers.slice(0, 4)];
  await prisma.event.upsert({
    where: { id: 'event-race-seat' },
    update: {
      capacity: 6,
      seatsTaken: raceSeatParticipants.length,
      participants: {
        deleteMany: {},
        createMany: {
          data: raceSeatParticipants.map((u) => ({ userId: u.id })),
        },
      },
    },
    create: {
      id: 'event-race-seat',
      title: 'Race For The Last Seat (concurrency test)',
      description:
        'Capacity 6, 5 seats already taken (author + fillers) — exactly 1 seat ' +
        'left. Fire concurrent joins from different users (e.g. the seeded ' +
        'race-user-01..10@test.local accounts) to confirm only one wins.',
      date: new Date('2026-12-05T18:00:00Z'),
      location: 'Test Lab',
      capacity: 6,
      seatsTaken: raceSeatParticipants.length,
      visibility: Visibility.PUBLIC,
      authorId: user1.id,
      participants: {
        create: raceSeatParticipants.map((u) => ({ userId: u.id })),
      },
    },
  });

  // Fixture for testing the same-user duplicate-join dedup (design doc §13,
  // "Закрито на рівні Redis-черги" / `pending-join:{eventId}:{userId}`
  // claim in `BookingQueueService.enqueueJoin`). Author + all 6 fillers
  // already seated (looks well-populated), but 3 seats stay open — still
  // "plenty", so a rejection here can only mean the dedup path fired, not
  // "event full". Jane (user2) is deliberately left OUT of the filler list —
  // she's the designated joiner for the test below. Fire 2+ concurrent joins
  // as Jane (no Idempotency-Key needed) and confirm they collapse to a
  // single requestId, exactly one CONFIRMED, and `seatsTaken` increases by 1
  // (not by the number of concurrent requests).
  const duplicateCheckParticipants = [user1, ...fillers];
  await prisma.event.upsert({
    where: { id: 'event-duplicate-check' },
    update: {
      capacity: 10,
      seatsTaken: duplicateCheckParticipants.length,
      participants: {
        deleteMany: {},
        createMany: {
          data: duplicateCheckParticipants.map((u) => ({ userId: u.id })),
        },
      },
    },
    create: {
      id: 'event-duplicate-check',
      title: 'Duplicate Join Check (same-user race test)',
      description:
        'Capacity 10, 7 seats already taken (author + fillers) — still 3 ' +
        'open, so a rejection here can only mean the dedup path fired, not ' +
        '"event full". Send two+ concurrent join requests as the same user ' +
        '(e.g. jane@example.com) to confirm they dedupe into one seat ' +
        'instead of double-counting.',
      date: new Date('2026-12-06T18:00:00Z'),
      location: 'Test Lab',
      capacity: 10,
      seatsTaken: duplicateCheckParticipants.length,
      visibility: Visibility.PUBLIC,
      authorId: user1.id,
      participants: {
        create: duplicateCheckParticipants.map((u) => ({ userId: u.id })),
      },
    },
  });

  await prisma.event.upsert({
    where: { id: 'event-private' },
    update: {},
    create: {
      id: 'event-private',
      title: 'Secret Strategy Meeting',
      description: 'Only for invited organizers',
      date: new Date('2026-12-10T15:00:00Z'),
      location: 'Hidden Office',
      capacity: 10,
      seatsTaken: 1,
      visibility: Visibility.PRIVATE,
      authorId: user3.id,
      // Match how EventsService.create behaves: the author is a participant.
      participants: { create: [{ userId: user3.id }] },
    },
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});