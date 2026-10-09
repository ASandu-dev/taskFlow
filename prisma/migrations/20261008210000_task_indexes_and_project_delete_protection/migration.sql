-- Add query indexes and prevent project deletion from cascading into task loss.
ALTER TABLE "Task" DROP CONSTRAINT "Task_projectId_fkey";
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_date_idx" ON "Task"("date");
CREATE INDEX "Task_status_idx" ON "Task"("status");
