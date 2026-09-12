/**
 * Drives the two seeded test fixtures (prisma/seed.ts) through the REAL,
 * already-running HTTP API — not an in-process AppModule context like
 * scripts/smoke-booking.ts. The point is to actually change the rows behind
 * `event-race-seat` / `event-duplicate-check` via real requests, so the
 * effect is visible when you open the app: refresh the events page (or
 * `GET /api/events/:id`) afterwards and the seat counts/participants will
 * have moved.
 *
 * Prerequisites:
 *   - The backend must already be running and reachable at API_URL
 *     (docker compose up, or `pnpm --filter backend start:dev`).
 *   - The DB must be seeded: `pnpm db:seed` (creates race-user-01..10@test.local,
 *     jane@example.com, and the two fixture events).
 *
 * Usage (from apps/backend):
 *   pnpm test:seeded                # both scenarios
 *   pnpm test:seeded race           # only the race-for-the-last-seat scenario
 *   pnpm test:seeded duplicate      # only the same-user dedup scenario
 *
 *   API_URL=http://localhost:3000/api pnpm test:seeded   # override target
 *
 * Exit code 0 = both scenarios ran and matched the expected shape, 1 = not.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'password123';
const RACE_USER_COUNT = 10;
const DUPLICATE_JOIN_ATTEMPTS = 3;
const POLL_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

type JoinAccepted = { requestId: string; statusUrl: string };
type JoinStatus =
  | { state: 'PENDING'; eventId: string; userId: string }
  | { state: 'CONFIRMED'; eventId: string; userId: string }
  | { state: 'REJECTED'; eventId: string; userId: string; reason: string };

// Every success response is wrapped by the global TransformInterceptor
// (src/common/interceptors/transform.interceptor.ts) as
// { success, message, data, timestamp } — unwrap `data` here so the rest of
// the script can work with the plain shapes documented on each endpoint.
async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json()) as { data: T };
  return body.data;
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const { accessToken } = await unwrap<{ accessToken: string }>(res);
  return accessToken;
}

async function joinEvent(
  token: string,
  eventId: string,
  idempotencyKey?: string,
): Promise<JoinAccepted> {
  const res = await fetch(`${API_URL}/events/${eventId}/join`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
  });
  if (res.status !== 202) {
    throw new Error(`join failed: ${res.status} ${await res.text()}`);
  }
  return unwrap<JoinAccepted>(res);
}

async function pollStatus(token: string, requestId: string): Promise<JoinStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_URL}/events/join-requests/${requestId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const status = await unwrap<JoinStatus>(res);
      if (status.state !== 'PENDING') return status;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`timed out waiting for requestId ${requestId}`);
}

async function printEvent(eventId: string): Promise<void> {
  const res = await fetch(`${API_URL}/events/${eventId}`);
  assert(res.ok, `GET /events/${eventId} → ${res.status}`);
  const event = await unwrap<{
    seatsTaken: number;
    capacity: number;
    participants: { email: string }[];
  }>(res);
  console.log(
    `    ${eventId}: ${event.seatsTaken}/${event.capacity} seats — ` +
      event.participants.map((p) => p.email).join(', '),
  );
}

async function runRaceScenario(): Promise<void> {
  console.log('\n[race] N different users race for the last seat on event-race-seat');
  const emails = Array.from(
    { length: RACE_USER_COUNT },
    (_, i) => `race-user-${String(i + 1).padStart(2, '0')}@test.local`,
  );
  const tokens = await Promise.all(emails.map(login));

  const accepted = await Promise.all(
    tokens.map((token) => joinEvent(token, 'event-race-seat')),
  );
  const outcomes = await Promise.all(
    accepted.map((a, i) => pollStatus(tokens[i], a.requestId)),
  );

  const confirmed = outcomes.filter((o) => o.state === 'CONFIRMED');
  const rejected = outcomes.filter((o) => o.state === 'REJECTED');
  const winner = emails[outcomes.findIndex((o) => o.state === 'CONFIRMED')];
  console.log(
    `    confirmed=${confirmed.length} rejected=${rejected.length}` +
      (winner ? ` winner=${winner}` : ''),
  );
  assert(confirmed.length === 1, `exactly 1 CONFIRMED, got ${confirmed.length}`);
  assert(
    rejected.length === RACE_USER_COUNT - 1,
    `exactly ${RACE_USER_COUNT - 1} REJECTED, got ${rejected.length}`,
  );
  await printEvent('event-race-seat');
}

async function runDuplicateScenario(): Promise<void> {
  console.log(
    `\n[duplicate] same user (jane) fires ${DUPLICATE_JOIN_ATTEMPTS} concurrent joins on event-duplicate-check`,
  );
  const token = await login('jane@example.com');

  // No Idempotency-Key on purpose — this is exactly the case the
  // pending-join:{eventId}:{userId} claim in BookingQueueService.enqueueJoin
  // is meant to cover (design doc §13).
  const accepted = await Promise.all(
    Array.from({ length: DUPLICATE_JOIN_ATTEMPTS }, () =>
      joinEvent(token, 'event-duplicate-check'),
    ),
  );
  const uniqueRequestIds = new Set(accepted.map((a) => a.requestId));
  console.log(
    `    ${DUPLICATE_JOIN_ATTEMPTS} concurrent join calls collapsed into ` +
      `${uniqueRequestIds.size} distinct requestId(s)`,
  );

  const outcomes = await Promise.all(
    [...uniqueRequestIds].map((requestId) => pollStatus(token, requestId)),
  );
  const confirmed = outcomes.filter((o) => o.state === 'CONFIRMED');
  console.log(`    outcomes=${outcomes.map((o) => o.state).join(', ')}`);
  assert(
    confirmed.length === 1,
    `exactly 1 CONFIRMED across the deduped requestId(s), got ${confirmed.length}`,
  );
  await printEvent('event-duplicate-check');
}

async function main(): Promise<void> {
  const which = process.argv[2];
  if (which && which !== 'race' && which !== 'duplicate') {
    console.error(`Unknown scenario "${which}" — expected "race" or "duplicate"`);
    process.exit(1);
  }

  if (!which || which === 'race') await runRaceScenario();
  if (!which || which === 'duplicate') await runDuplicateScenario();

  console.log('\n✅ done — refresh the events page to see the result\n');
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
});
