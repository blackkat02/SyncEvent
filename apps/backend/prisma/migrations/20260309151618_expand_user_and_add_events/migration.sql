/*
  Warnings:

  - You are about to drop the column `organizerId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the `_Participants` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `authorId` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_organizerId_fkey";

-- DropForeignKey
ALTER TABLE "_Participants" DROP CONSTRAINT "_Participants_A_fkey";

-- DropForeignKey
ALTER TABLE "_Participants" DROP CONSTRAINT "_Participants_B_fkey";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "organizerId",
DROP COLUMN "updatedAt",
ADD COLUMN     "authorId" TEXT NOT NULL,
ALTER COLUMN "location" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "refreshToken" TEXT;

-- DropTable
DROP TABLE "_Participants";

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
