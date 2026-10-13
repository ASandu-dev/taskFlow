-- P4: calendar event visibility, invitation revocation, and per-user settings.
--
-- Strictly additive and non-destructive. `visibility` and `revokedAt` are added
-- with a default / as nullable so every existing row remains valid; no rows are
-- dropped, moved, or backfilled.

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('family', 'work', 'private');

-- CreateEnum
CREATE TYPE "CalendarView" AS ENUM ('month', 'week', 'day', 'agenda');

-- AlterTable: CalendarEvent visibility classification.
ALTER TABLE "CalendarEvent" ADD COLUMN "visibility" "EventVisibility" NOT NULL DEFAULT 'family';

-- AlterTable: FamilyInvitation revocation timestamp.
ALTER TABLE "FamilyInvitation" ADD COLUMN "revokedAt" TIMESTAMP(3);

-- CreateIndex: event visibility filtering.
CREATE INDEX "CalendarEvent_visibility_idx" ON "CalendarEvent"("visibility");

-- CreateIndex: duplicate-active-invitation lookups by group + email.
CREATE INDEX "FamilyInvitation_familyGroupId_email_idx" ON "FamilyInvitation"("familyGroupId", "email");

-- CreateTable: per-user persisted preferences.
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultCalendarView" "CalendarView" NOT NULL DEFAULT 'month',
    "shareWorkAvailability" BOOLEAN NOT NULL DEFAULT true,
    "defaultEventClassification" "EventVisibility" NOT NULL DEFAULT 'family',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "UserSettings_userId_idx" ON "UserSettings"("userId");
