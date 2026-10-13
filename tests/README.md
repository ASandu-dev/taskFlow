# Tests

Vitest. TypeScript. `@/*` resolves to `./src/*` (see `vitest.config.mts`).

## Default run (no database required)

```bash
npm test          # vitest run
npm run test:watch
```

Runs the host-safe suites:

- `authorization.test.ts` — tenant scope rules, `resolveCreateScope`, invitation
  redemption (single-use, expiry, email binding), token generation/hashing,
  `authErrorResponse`.
- `rate-limit.test.ts` — fixed-window limiter, key derivation, client IP parsing.
- `clerk-config.test.ts` — fail-closed Clerk config and `getAppOrigin`.

The DB-backed suite (`integration/family-isolation.test.ts`) is **skipped**
unless `TEST_DATABASE_URL` is set, so `npm test` never touches a database.

## DB-backed cross-family isolation suite

`integration/family-isolation.test.ts` runs real read/write/delete scope checks
against PostgreSQL: family resources from another family, another user's personal
resources, legacy unscoped rows, and task scope derived from its project. It is
gated on `TEST_DATABASE_URL` and uses a dedicated database so the dev database is
never mutated.

### Why it does not run by default in this environment

The Compose `db` service does **not** publish its port to the host, so a host-side
Prisma connection to `db:5432` fails with `P1001`. Do **not** edit
`docker-compose.yml` to publish it. Instead, run the suite through one of the
paths below.

### Option A — run against a database reachable from the host

Works when the DB is reachable (CI service container, a published test port, or a
temporary forwarder). Use a dedicated `taskflow_test` database:

```bash
# 1. Create the test DB (running container, no host port needed):
docker compose exec -T db psql -U taskflow -d taskflow -c "CREATE DATABASE taskflow_test;"

# 2a. Apply migrations from inside the Compose network (recommended):
docker compose run --rm \
  -e DATABASE_URL="postgresql://taskflow:taskflow-local-only@db:5432/taskflow_test?schema=public" \
  db-init sh -c "npx prisma migrate deploy"

# 2b. ...or, if the DB IS reachable from the host, from the host:
DATABASE_URL="postgresql://taskflow:taskflow-local-only@127.0.0.1:55432/taskflow_test?schema=public" \
  npx prisma migrate deploy

# 3. Run the suite:
TEST_DATABASE_URL="postgresql://taskflow:taskflow-local-only@<host>:<port>/taskflow_test?schema=public" \
  npm test
```

### Option B — temporary TCP forwarder (host-runnable, no compose change)

Bridges a loopback host port to the private Compose `db` service without editing
`docker-compose.yml`:

```bash
docker run --rm -d --name taskflow-db-tunnel \
  --network taskflow_default \
  -p 127.0.0.1:55432:5432 \
  alpine/socat tcp-listen:5432,fork,reuseaddr tcp-connect:db:5432

# Create + migrate the test DB through the tunnel:
docker compose exec -T db psql -U taskflow -d taskflow -c "CREATE DATABASE taskflow_test;"
DATABASE_URL="postgresql://taskflow:taskflow-local-only@127.0.0.1:55432/taskflow_test?schema=public" \
  npx prisma migrate deploy

# Run the integration suite:
TEST_DATABASE_URL="postgresql://taskflow:taskflow-local-only@127.0.0.1:55432/taskflow_test?schema=public" \
  npm test

# Clean up:
docker rm -f taskflow-db-tunnel
```

Replace credentials/database names with your `.env` values if they differ.
