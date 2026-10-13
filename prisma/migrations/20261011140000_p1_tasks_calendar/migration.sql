-- P1: task assignment/recurrence, per-day completion tracking, and richer
-- calendar events.
--
-- Strictly additive and non-destructive. Every new column is nullable or has a
-- default, so all existing Task/CalendarEvent rows remain valid and no rows are
-- dropped or moved. The new `updatedAt` columns are added with a temporary
-- default to backfill existing rows, then the default is dropped (@updatedAt is
-- subsequently managed by Prisma on every write).

-- Task: assignment, recurrence, and audit metadata.
ALTER TABLE "Task" ADD COLUMN "assigneeId" TEXT;
ALTER TABLE "Task" ADD COLUMN "recurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Task" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Task" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CalendarEvent: end time, richer metadata, timezone, and audit.
ALTER TABLE "CalendarEvent" ADD COLUMN "endTime" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "description" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "location" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "timezone" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "createdById" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CalendarEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable: TaskCompletion — one completion per recurring task per day.
CREATE TABLE "TaskCompletion" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "completedById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskCompletion_taskId_date_key" ON "TaskCompletion"("taskId", "date");

-- CreateIndex
CREATE INDEX "TaskCompletion_date_idx" ON "TaskCompletion"("date");

-- CreateIndex
CREATE INDEX "TaskCompletion_completedById_idx" ON "TaskCompletion"("completedById");

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
