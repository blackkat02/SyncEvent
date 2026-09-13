-- Multi-session refresh tokens (docs/architecture/refresh-token-rotation.md).
-- Replaces the single `User.refreshToken` hash -- which supports only one
-- active session per user -- with a dedicated table: one row per
-- session/device, chained by `familyId` so rotation and reuse-detection can
-- revoke a whole compromised chain instead of a single row.
--
-- `supersededAt`/`supersededById` back the anti-race grace period (§5.2):
-- a row rotated away points at the row that replaced it, so a
-- network-delay retry of that same rotation can still be served instead of
-- wrongly triggering reuse-detection.
--
-- `accessJti` tracks the jti of the access token issued alongside each
-- row's current refresh token, so "log out everywhere right now" can
-- blocklist every live device's access token too, not just revoke the
-- refresh chain (which access tokens don't check on their own).

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "tokenHash"      TEXT NOT NULL,
    "familyId"       TEXT NOT NULL,
    "revoked"        BOOLEAN NOT NULL DEFAULT false,
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent"      TEXT,
    "supersededAt"   TIMESTAMP(3),
    "supersededById" TEXT,
    "accessJti"      TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "refreshToken";
