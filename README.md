# TaskFlow

TaskFlow is a Next.js 16 application with a PostgreSQL database accessed through Prisma. Tasks, projects, goals, calendar events, and the displayed user profile are stored in PostgreSQL. The demo records are inserted by an idempotent Prisma seed; the UI reads and mutates those records through Next.js route handlers.

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

## Google Calendar Integration

TaskFlow can import events from Google Calendar. Events are pulled into the TaskFlow
calendar on demand from **Settings → Integrations**. Imported events are tagged with a
calendar category (Work, Family, or Errands), and disconnecting removes them again.

1. In the [Google Cloud Console](https://console.cloud.google.com/), enable the
   **Google Calendar API** and create an OAuth 2.0 Client ID of type **Web application**.
2. Add an authorized redirect URI that matches where you run the app, for example
   `http://localhost:3000/api/integrations/google/callback`.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. Optionally set
   `GOOGLE_REDIRECT_URI` when the redirect URI differs from the request origin.
4. Restart the app, open **Settings → Integrations**, and click **Connect**. Use
   **Sync now** to import events (the last 30 days through the next 12 months).

The connection and its OAuth tokens are stored in the `Integration` table.

## Authentication & Family Groups

Sign-in uses [Clerk](https://clerk.com) with **Google OAuth**. Once authenticated you
can create **family groups**, join them with a 6-character **invite code**, and share
events that appear on every member's calendar.

1. Create an application in the [Clerk dashboard](https://dashboard.clerk.com).
2. Under **User & Authentication → Social Connections**, enable **Google**.
3. Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` into `.env`
   (replacing the placeholder values in `.env.example`).
4. Rebuild the app container: `docker compose up -d --build app`.

All pages and `/api/*` routes (except `/sign-in`, `/sign-up`, `/api/health`, and the
Google callback) require a signed-in user. Family groups and membership are stored in
the `FamilyGroup` and `FamilyGroupMember` tables; shared events carry a
`familyGroupId` and are merged into the event list of their members.

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
TASKFLOW_PORT=3100
```

Then recreate the app container:

```sh
docker compose up -d
```

Open [http://localhost:3100](http://localhost:3100). The equivalent Compose mapping is `${TASKFLOW_PORT:-3000}:3000` in `docker-compose.yml`.

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

There is currently no automated test suite or `npm test` script. The health endpoint at `/api/health` checks both the application process and its database connection and is used by Compose's app health check.
