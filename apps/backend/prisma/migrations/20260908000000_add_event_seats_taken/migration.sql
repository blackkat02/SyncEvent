-- AlterTable: denormalised participant counter used for the conditional
-- "don't overbook" UPDATE in EventsService.joinEvent / leaveEvent.
ALTER TABLE "Event" ADD COLUMN "seatsTaken" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows from the implicit M:N join table.
-- Prisma names the implicit relation table "_JoinedEvents" with
-- "A" = Event.id and "B" = User.id (see 20260310150113_init_full_schema).
UPDATE "Event" e
SET "seatsTaken" = sub.cnt
FROM (
  SELECT "A" AS event_id, COUNT(*)::int AS cnt
  FROM "_JoinedEvents"
  GROUP BY "A"
) sub
WHERE e.id = sub.event_id;
