# TaskFlow

TaskFlow is a Next.js 16 application with a PostgreSQL database accessed through Prisma. It provides family workspaces with role-based access and invitations, a shared family calendar with work-privacy controls (generic work blocks), a child daily checklist, task assignment with recurring daily tasks and per-day completion history, calendar events with end time, description, location, and timezone support, and per-user settings.

## Product Overview

- **Family workspaces** with roles: `owner` > `admin` > `member` > `child`. The `child` role is used by the daily checklist and carries the most restricted permissions.
- **Family management with roles and invitations** — CSPRNG token, SHA-256 hashed, single-use, configurable expiry (1–30 days, default 7), email-bound, revocable. Join links use the format `<app URL>/join?token=`. **Email delivery is not implemented**; the inviter shares the link out-of-band.
- **Shared family calendar** with three visibility classifications: `family` (fully shared), `work` (personal; family sees only generic "Work" busy blocks when the owner enables sharing), `private` (personal; never shared). Policy enforced server-side.
- **Work-privacy controls** — Users can disable work-availability sharing in Settings; when off, family members see no work blocks at all.
- **Child daily checklist** at `/checklist` — recurring daily tasks with per-day completion history stored in `TaskCompletion`.
- **Task assignment** + recurring daily tasks with per-day completion history.
- **Calendar events** with end time, description, location, and IANA timezone.
- **Per-user Google Calendar integration** — OAuth tokens scoped to each Clerk user.
- **User settings** — Account (Clerk profile + display name), Family (rename, manage, pending invitations), Calendar & privacy (default view, default classification, work-availability toggle), Integrations (Google Calendar), Calendar categories.
- **Security model**: tenant scoping (personal vs family), server-side authorization, fail-closed auth in production, rate limiting (defense-in-depth), CSP in report-only mode.

## Local Development

Requirements: Node.js 22+, npm, and a PostgreSQL instance.

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Copy `.env.example` to `.env` and set `DATABASE_URL` to the PostgreSQL URL reachable from your host. The sample expects a local PostgreSQL server on port 5432.

   ```sh
   cp .env.example .env
   npm run db:generate
   ```

3. Apply migrations and insert any missing demo records:

   ```sh
   npm run db:setup
   ```

   `db:setup` applies migrations without dropping data, then runs the idempotent seed. To start with an empty database, omit the seed command.

4. Start the application:

   ```sh
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Testing

```sh
npm test          # vitest run (host-safe suites only)
npm run test:watch
```

The default run executes host-safe suites (authorization, rate limiting, Clerk config) and **does not require a database**.

The DB-backed integration suite (`tests/integration/family-isolation.test.ts`) is **skipped** unless `TEST_DATABASE_URL` is set. See `tests/README.md` for setup instructions (requires a dedicated test database reachable from the host).

## Google Calendar Integration

TaskFlow can import events from Google Calendar. Events are pulled into the TaskFlow calendar on demand from **Settings → Integrations**. Imported events are tagged with a calendar category (Work, Family, or Errands), and disconnecting removes them again.

1. In the [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Calendar API** and create an OAuth 2.0 Client ID of type **Web application**.
2. Add an authorized redirect URI that matches where you run the app, for example `http://localhost:3000/api/integrations/google/callback`.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. Optionally set `GOOGLE_REDIRECT_URI` when the redirect URI differs from the request origin.
4. Restart the app, open **Settings → Integrations**, and click **Connect**. Use **Sync now** to import events (the last 30 days through the next 12 months).

The connection and its OAuth tokens are stored in the `Integration` table, scoped per user.

## Authentication & Family Groups

Sign-in uses [Clerk](https://clerk.com) with **Google OAuth**. Once authenticated you can create **family groups**, invite members via **invitation tokens** (the app generates a join link `<app URL>/join?token=` that the inviter shares out-of-band — **email delivery is not implemented**), and share events that appear on every member's calendar.

1. Create an application in the [Clerk dashboard](https://dashboard.clerk.com).
2. Under **User & Authentication → Social Connections**, enable **Google**.
3. Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` into `.env` (replacing the placeholder values in `.env.example`).
4. Rebuild the app container: `docker compose up -d --build app`.

All pages and `/api/*` routes (except `/sign-in`, `/sign-up`, `/api/health`, and the Google callback) require a signed-in user. Family groups and membership are stored in the `FamilyGroup` and `FamilyGroupMember` tables; shared events carry a `familyGroupId` and are merged into the event list of their members.

## Docker

Docker Compose runs the production Next.js server, PostgreSQL, and a one-shot migration/seed container:

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

The app becomes available after PostgreSQL is healthy and the initializer has completed. It listens on `0.0.0.0:3000` inside the container. PostgreSQL is only reachable on the private Compose network and is not published to the host.

The Compose password default is for local development only. Before using the stack on a network accessible to others, set a strong `POSTGRES_PASSWORD` in an untracked `.env` file and configure suitable access controls. PostgreSQL is not published outside the Compose network.

## Port Configuration

Set `TASKFLOW_PORT` in `.env` to change the host port while the container continues to listen on port 3000. For example:

```dotenv
TASKFLOW_PORT=3552
```

Then recreate the app container:

```sh
docker compose up -d
```

Open [http://localhost:3552](http://localhost:3552). The equivalent Compose mapping is `${TASKFLOW_PORT:-3552}:3000` in `docker-compose.yml`.

## Database

- **Technology:** PostgreSQL 16, accessed using Prisma ORM.
- **Schema and migrations:** `prisma/schema.prisma` is the schema source. `prisma/migrations` contains versioned migrations. Compose waits for PostgreSQL's health check, then runs `prisma migrate deploy` before starting the app.
- **Seeding:** the initializer runs `prisma db seed` after migrations. Seed records use stable IDs and upserts that do not overwrite existing user data.
- **Persistence:** Compose stores data in the named `taskflow-db` volume. Restarting or recreating containers does not delete this volume.
- **Resetting local development data:** `docker compose down -v` removes the database volume and permanently deletes its contents. Use it only when you intentionally want a clean database, then run `docker compose up -d --build`. For host-managed PostgreSQL, back up and reset the database using your PostgreSQL tools.

For local development, Next.js reads `DATABASE_URL` from `.env` and normally connects to `localhost`. In Compose, the app and initializer receive a URL built from the PostgreSQL settings and use `db`—the Compose service name—as the hostname.

## Useful Commands

```sh
# Local app
npm run dev
npm run lint
npx tsc --noEmit
npm run build
npm test
npm run test:watch

# Database from local development
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:setup

# Docker lifecycle and diagnostics
docker compose up -d --build
docker compose ps
docker compose logs -f app
docker compose logs db-init
docker compose restart
docker compose down
```

The health endpoint at `/api/health` checks both the application process and its database connection and is used by Compose's app health check.

## Documentation

- [Deployment Runbook](docs/DEPLOYMENT.md) — prerequisites, environment variables, local/production commands, Cloudflare/Clerk/Google checklists, backup/restore.
- [Security Model](docs/SECURITY.md) — tenant model, authorization rules, invitation scheme, fail-closed auth, rate limiting, residual risks.