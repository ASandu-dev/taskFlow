-- P0 tenant scoping, membership roles, and hashed family invitations.
--
-- This migration is strictly additive. Existing Project/Goal/CalendarEvent rows
-- were created before tenancy existed and are intentionally retained with
-- familyGroupId = NULL and ownerId = NULL. Those legacy unscoped rows are not
-- visible under strict tenant scoping; they are NOT deleted so no data is lost.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'member', 'child');

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "FamilyGroupMember" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'member';

-- Backfill: the member record matching the group's adminId becomes the owner.
-- Everyone else keeps the 'member' default. This preserves existing memberships.
UPDATE "FamilyGroupMember" AS m
SET "role" = 'owner'
FROM "FamilyGroup" AS g
WHERE m."groupId" = g."id"
  AND m."userId" = g."adminId";

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "familyGroupId" TEXT,
ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "familyGroupId" TEXT,
ADD COLUMN     "ownerId" TEXT;

-- CreateTable
CREATE TABLE "FamilyInvitation" (
    "id" TEXT NOT NULL,
    "familyGroupId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "role" "Role" NOT NULL DEFAULT 'member',
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FamilyInvitation_tokenHash_key" ON "FamilyInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "FamilyInvitation_familyGroupId_idx" ON "FamilyInvitation"("familyGroupId");

-- CreateIndex
CREATE INDEX "FamilyInvitation_email_idx" ON "FamilyInvitation"("email");

-- CreateIndex
CREATE INDEX "CalendarEvent_ownerId_idx" ON "CalendarEvent"("ownerId");

-- CreateIndex
CREATE INDEX "Goal_familyGroupId_idx" ON "Goal"("familyGroupId");

-- CreateIndex
CREATE INDEX "Goal_ownerId_idx" ON "Goal"("ownerId");

-- CreateIndex
CREATE INDEX "Project_familyGroupId_idx" ON "Project"("familyGroupId");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_familyGroupId_fkey" FOREIGN KEY ("familyGroupId") REFERENCES "FamilyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_familyGroupId_fkey" FOREIGN KEY ("familyGroupId") REFERENCES "FamilyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyInvitation" ADD CONSTRAINT "FamilyInvitation_familyGroupId_fkey" FOREIGN KEY ("familyGroupId") REFERENCES "FamilyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
