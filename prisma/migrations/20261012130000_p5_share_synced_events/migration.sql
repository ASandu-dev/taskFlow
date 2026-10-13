-- P5: opt-in for sharing Google Calendar synced events with the family.
--
-- Strictly additive and non-destructive. The column is added with a default so
-- every existing row remains valid and the new behavior stays off by default;
-- no rows are dropped, moved, or backfilled.

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "shareSyncedEventsWithFamily" BOOLEAN NOT NULL DEFAULT false;
