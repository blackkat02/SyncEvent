-- Explicit join model for event participation, replacing the implicit
-- "_JoinedEvents" M:N table. Needed to (a) close the residual same-user
-- join race: membership dedup now happens on a real composite PRIMARY KEY
-- constraint instead of a read-then-check subquery inside a conditional
-- UPDATE (docs/architecture/booking-concurrency.md §13), and (b) carry a
-- `status` column, the storage Phase 3 (waitlist) needs for WAITLISTED rows
-- without another structural migration.

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('CONFIRMED', 'WAITLISTED');

-- CreateTable
CREATE TABLE "EventParticipant" (
    "eventId"  TEXT NOT NULL,
    "userId"   TEXT NOT NULL,
    "status"   "ParticipantStatus" NOT NULL DEFAULT 'CONFIRMED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE INDEX "EventParticipant_userId_idx" ON "EventParticipant"("userId");

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from the implicit relation table before dropping it. Prisma
-- named it "_JoinedEvents" with "A" = Event.id and "B" = User.id (see
-- 20260310150113_init_full_schema). No original per-row timestamp exists
-- there, so joinedAt best-effort defaults to now() for pre-existing rows
-- (acceptable: nothing currently reads it).
INSERT INTO "EventParticipant" ("eventId", "userId", "status", "joinedAt")
SELECT "A", "B", 'CONFIRMED', CURRENT_TIMESTAMP FROM "_JoinedEvents";

-- DropForeignKey
ALTER TABLE "_JoinedEvents" DROP CONSTRAINT "_JoinedEvents_A_fkey";
ALTER TABLE "_JoinedEvents" DROP CONSTRAINT "_JoinedEvents_B_fkey";

-- DropTable
DROP TABLE "_JoinedEvents";
