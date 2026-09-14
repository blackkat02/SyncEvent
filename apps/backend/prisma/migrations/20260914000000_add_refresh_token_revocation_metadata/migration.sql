-- Revocation metadata for RefreshToken cleanup
-- (docs/architecture/scheduled-tasks-worker.md §5.1, §5.2).
--
-- `revoked: true` rows currently give no way to tell *why* or *when* a row
-- was revoked, which cleanup needs: ROTATED/LOGOUT rows are safe to delete
-- almost immediately (grace period is already 10s), while REUSE_DETECTED
-- rows are the only trace of a compromised token and deserve a much longer
-- forensics window before deletion. `createdAt` cannot substitute for
-- `revokedAt` here -- it is the issue time, not the revocation time, so a
-- long-lived session revoked today would already look "old" by createdAt
-- and get deleted on the very next cleanup pass regardless of the intended
-- retention window.
--
-- The two indexes below back the cleanup query's WHERE clause directly;
-- without them `deleteMany` is a full table scan regardless of batch size.

-- CreateEnum
CREATE TYPE "RevokedReason" AS ENUM ('ROTATED', 'LOGOUT', 'REUSE_DETECTED');

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "RefreshToken" ADD COLUMN "revokedReason" "RevokedReason";

-- Backfill existing revoked rows, which predate revokedAt/revokedReason and
-- would otherwise never match any branch of the cleanup query's WHERE
-- clause and stay in the table forever. supersededAt IS NOT NULL means the
-- row was replaced by a rotation; anything else revoked (logout,
-- logout-all) has no supersession record. This is a one-time,
-- best-effort approximation for historical rows -- the exact revocation
-- reason for rows predating this migration was never recorded, and these
-- rows are already old enough that a conservative (short) retention window
-- does no harm either way.
UPDATE "RefreshToken"
SET
  "revokedReason" = CASE
    WHEN "supersededAt" IS NOT NULL THEN 'ROTATED'::"RevokedReason"
    ELSE 'LOGOUT'::"RevokedReason"
  END,
  "revokedAt" = COALESCE("supersededAt", "createdAt")
WHERE "revoked" = true;

-- CreateIndex
CREATE INDEX "RefreshToken_revoked_expiresAt_idx" ON "RefreshToken"("revoked", "expiresAt");

-- CreateIndex
CREATE INDEX "RefreshToken_revokedReason_revokedAt_idx" ON "RefreshToken"("revokedReason", "revokedAt");
