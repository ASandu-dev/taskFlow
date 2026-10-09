-- Add calendar categories and Google Calendar sync metadata to events.
ALTER TABLE "CalendarEvent"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN "externalId" TEXT;

-- Store the single Google Calendar connection and its OAuth tokens.
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenType" TEXT,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3),
    "accountEmail" TEXT,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarEvent_externalId_key" ON "CalendarEvent"("externalId");
CREATE INDEX "CalendarEvent_source_idx" ON "CalendarEvent"("source");
CREATE UNIQUE INDEX "Integration_provider_key" ON "Integration"("provider");
