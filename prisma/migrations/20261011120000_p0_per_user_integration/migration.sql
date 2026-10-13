-- P0: scope integration credentials (e.g. Google Calendar OAuth tokens) per user.
--
-- This migration is strictly additive and non-destructive: no columns or rows are
-- dropped. The pre-existing single global Integration row was created before
-- tenancy existed and cannot be attributed to any real user, so its userId is
-- backfilled with the clearly invalid sentinel '__orphaned__'. No real Clerk user
-- can match that id, so the legacy row is treated as not-connected and the owner
-- must re-connect. Existing tokens are preserved in place but never served to a
-- real user.

-- Step 1: add the NOT NULL userId column with a temporary default. The default
-- backfills every existing row (including the legacy global row) with the
-- sentinel atomically; the default is then dropped so future rows must supply a
-- real user id (the Prisma schema declares no default).
ALTER TABLE "Integration" ADD COLUMN "userId" TEXT NOT NULL DEFAULT '__orphaned__';
ALTER TABLE "Integration" ALTER COLUMN "userId" DROP DEFAULT;

-- Step 2: provider is no longer globally unique; uniqueness becomes per-user.
DROP INDEX "Integration_provider_key";

-- Step 3: enforce one integration per (provider, user) pair and index the owner.
CREATE UNIQUE INDEX "Integration_provider_userId_key" ON "Integration"("provider", "userId");
CREATE INDEX "Integration_userId_idx" ON "Integration"("userId");
