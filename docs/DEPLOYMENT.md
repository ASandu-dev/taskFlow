# Deployment Runbook

This document covers the operational procedures for deploying and running TaskFlow in production.

## Prerequisites

- **Node.js 22** (matches the Docker runtime `node:22-alpine`)
- **npm** (bundled with Node)
- **Docker** and **Docker Compose** (v2+)
- **Clerk application** with Google social connection enabled
- **Google Cloud OAuth 2.0 Web Client** with Calendar API enabled
- **Cloudflare zone** fronting the origin (TLS termination, WAF, rate limiting)

## Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string. In Compose: `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key (safe for browser) |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key (server-only) |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth 2.0 Client Secret |
| `GOOGLE_REDIRECT_URI` | **Yes (production)** | Canonical HTTPS origin + `/api/integrations/google/callback` (e.g. `https://app.example.com/api/integrations/google/callback`). **The app fails closed for OAuth without this in production.** |
| `TASKFLOW_PORT` | No | Host port for the app (default: `3552`) |
| `POSTGRES_USER` | No | PostgreSQL user (default: `taskflow`) |
| `POSTGRES_PASSWORD` | No | PostgreSQL password (default: `taskflow-local-only` — **change in production**) |
| `POSTGRES_DB` | No | PostgreSQL database name (default: `taskflow`) |
| `TEST_DATABASE_URL` | No | Optional. PostgreSQL connection string for DB-backed integration tests. Must point to a dedicated test database (not production). When set, `npm test` runs the integration suite. |

> **Note on public URL:** The join link (`/join?token=`) uses the browser's `window.location.origin` at runtime. No separate `NEXT_PUBLIC_APP_URL` is required. However, the app **must be reachable at its public HTTPS URL** for invitation links to work when shared out-of-band.

## Local Development

```bash
# 1. Install dependencies
npm ci

# 2. Configure environment
cp .env.example .env
# Edit .env with your local values (DATABASE_URL, Clerk keys, Google OAuth)

# 3. Generate Prisma client
npm run db:generate

# 4. Apply migrations and seed
npm run db:setup

# 5. Start development server
npm run dev
```

Open http://localhost:3000 (or `TASKFLOW_PORT` if changed).

## Production Deployment (Docker Compose)

```bash
# 1. Ensure .env exists with production values (see Required Environment Variables)
#    GOOGLE_REDIRECT_URI MUST be set to the canonical HTTPS callback URL.

# 2. Build and start
docker compose up -d --build

# 3. Verify health
docker compose ps
# app should show "healthy" after ~20-30s start_period

# 4. Check logs
docker compose logs -f app
docker compose logs db-init   # migrations + seed output

# 5. Health endpoint
curl -s http://localhost:${TASKFLOW_PORT:-3552}/api/health
# Expected: {"status":"ok","database":"connected","timestamp":"..."}
```

### Migrations

- **Automatic (Compose):** The `db-init` service runs `prisma migrate deploy && prisma db seed` on every `docker compose up` before the app starts. It is idempotent.
- **Manual:** `npm run db:migrate` (runs `prisma migrate deploy` against `DATABASE_URL`).

### Tests in Production Context

```bash
# Host-safe unit tests (no DB)
npm test

# DB-backed integration tests (requires TEST_DATABASE_URL)
# See tests/README.md for setup — do not run against production DB.
```

## Cloudflare Configuration Checklist

> **Manual steps — outside the application code.** Configure in the Cloudflare dashboard.

### 1. Edge Rate Limiting Rules

Create rate limiting rules for these sensitive endpoints:

| Endpoint | Suggested Rule |
|----------|----------------|
| `/api/family/invitations*` | 10 requests / minute per IP |
| `/api/family/groups/join` | 5 requests / minute per IP |
| `/api/integrations/google/*` | 20 requests / minute per IP |

Use `CF-Connecting-IP` as the counting key (see Lock Origin below).

### 2. Lock Origin to Cloudflare IP Ranges

- **SSL/TLS → Overview → Automatic HTTPS Rewrites:** On
- **Network → Origin:** Ensure the origin only accepts traffic from Cloudflare IP ranges.
- **Result:** `CF-Connecting-IP` header is authoritative for the real client IP. The app trusts this header for rate limiting and audit logs.

### 3. WAF / Managed Challenge on Auth Routes

- Enable **Managed Challenge** or **JS Challenge** for:
  - `/sign-in*`
  - `/sign-up*`
  - `/api/family/groups/join`
  - `/api/family/invitations*`
  - `/api/integrations/google/*`

### 4. TLS Settings

- **SSL/TLS → Overview:** **Full (Strict)** — Cloudflare validates the origin certificate.
- **Edge Certificates → Always Use HTTPS:** On
- **Edge Certificates → Automatic HTTPS Rewrites:** On

### 5. HSTS

The application already sends `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` via Next.js middleware. Cloudflare should **not** override this with a weaker policy.

## Clerk Configuration Checklist

1. **Application created** at https://dashboard.clerk.com
2. **Google social connection enabled:** User & Authentication → Social Connections → Google → Enable
3. **Keys copied to `.env`:**
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
4. **Fail-closed behavior:** In production (`NODE_ENV=production`), the app **fails closed** if Clerk keys are missing or invalid — requests return 500/401 rather than allowing unauthenticated access. Verify keys are set before deploying.

## Google Cloud Checklist

1. **OAuth 2.0 Client ID** of type **Web application** created.
2. **Authorized redirect URI** registered **exactly** matching `GOOGLE_REDIRECT_URI` (e.g. `https://your-domain.example/api/integrations/google/callback`). No trailing slash differences, no `http` vs `https` mismatch.
3. **Google Calendar API enabled** in the same project.
4. **OAuth consent screen** configured (internal or external as appropriate).
5. **Test users** added if in testing mode.

## CSP Promotion Note

The application currently serves `Content-Security-Policy-Report-Only` headers. This allows monitoring violations without blocking resources.

**To promote to enforcing:**
1. Deploy with report-only.
2. Monitor `/api/health` logs or Cloudflare Workers Logs for `csp-report` violations in real browsers.
3. Once **zero violations** are observed over a representative period, change the header to `Content-Security-Policy` (remove `-Report-Only`) in `next.config.ts`.

## Backup / Restore

The PostgreSQL data lives in the Docker named volume `taskflow-db`.

### Backup

```bash
# Stop app to ensure consistent snapshot (optional but recommended)
docker compose stop app

# Dump
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backup-$(date +%F).sql

# Restart app
docker compose start app
```

### Restore

```bash
# Stop app
docker compose stop app

# Drop and recreate database (inside container)
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restore
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < backup-2026-01-15.sql

# Restart app (migrations will apply if needed)
docker compose start app
```

> **Note:** The `db-init` service runs migrations on startup. If the restored schema is behind, it will catch up automatically.

## Invitations & Join Links

### Flow

1. An owner/admin creates an invitation via **Family → Invite** (or `POST /api/family/invitations`).
2. The server generates a CSPRNG token (32 bytes, URL-safe base64), stores only its SHA-256 hash, and returns the **raw token exactly once** in the response.
3. The UI shows a **Copy invite link** button that builds `<public app URL>/join?token=<raw token>`.
4. The inviter shares this link out-of-band (chat, email, etc.). **The application does not send emails.**
5. The invitee opens the link. The `/join` page calls the non-consuming preview endpoint (`GET /api/family/invitations/preview?token=`) which validates:
   - Token hash exists and is not revoked/expired/used.
   - If the invitation is email-bound, the signed-in user's primary email (from Clerk) must match.
   - The user is not already a member.
6. If valid, the invitee clicks **Accept invitation**, which calls `POST /api/family/groups/join` with the token. This consumes the invitation (sets `usedAt`, `usedById`) and creates the `FamilyGroupMember` row.

### Token Properties

| Property | Value |
|----------|-------|
| Generation | CSPRNG (32 bytes → URL-safe base64, ~43 chars) |
| Storage | SHA-256 hash only (`tokenHash` in `FamilyInvitation`) |
| Binding | Optional `email` field (case-insensitive match against Clerk primary email) |
| Expiry | Configurable 1–30 days (default 7) via `expiresInDays` on creation |
| Single-use | `usedAt` set on redemption; second attempt fails |
| Revocation | Owners/admins can revoke (`revokedAt` set) before acceptance |

### Email Delivery — Not Implemented

> **The app does not send invitation emails.** The inviter must copy the link and share it manually.

**What a production email integration would need:**
- A transactional email provider (e.g., **Resend**, **AWS SES**, **SendGrid**, **Postmark**).
- A server action or background worker that, after creating the invitation, sends the `/join?token=` link to the invited email address.
- Environment variables for the provider (e.g., `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`).
- Rate limiting and bounce/complaint handling.
- A template that includes the family name, inviter name, and the full join link.

### Rate Limiting

- Invitation creation is rate-limited in-app (per-user, in-memory fixed window) and should be reinforced at the Cloudflare edge (see [Cloudflare Configuration Checklist](#2-cloudflare-configuration-checklist): 10 req/min per IP on `/api/family/invitations*`).

## Calendar Privacy

### Visibility Model

Every calendar event carries a `visibility` classification:

| Classification | Scope | Who sees what |
|----------------|-------|---------------|
| `family` | Family-scoped (`familyGroupId` set) | All family members see the full event (title, description, location, time, category). |
| `work` | Personal (`familyGroupId` null) | **Owner:** full event. **Family members:** only a generic "Work" busy block (date, start/end time, timezone) **if** the owner has enabled *Share work availability with family*. Never the title, description, location, category, or original event ID. |
| `private` | Personal (`familyGroupId` null) | **Owner only.** Never shared with family. |

### Enforcement

- Policy is enforced **server-side** in `GET /api/events` via `src/lib/event-visibility.ts`.
- Frontend filters **never bypass** the server policy; the API returns only what the viewer may see.
- The `WorkBlock` returned for shared work events has `id: null` and a stable `key` (SHA-256 of the real event ID, truncated) so the client can render it without learning the original event identity.

### User Controls (Settings → Calendar & privacy)

| Setting | Effect |
|---------|--------|
| **Default classification for new events** | `family` / `work` / `private`. Applied when creating an event without an explicit choice. Persisted per-user in `UserSettings.defaultEventClassification`. |
| **Share work availability with family** | Toggle (default: on). When off, the owner's `work` events are **completely hidden** from family members (no busy blocks). Persisted in `UserSettings.shareWorkAvailability`. |

## User Settings

The **Settings** page (`/settings`) is organized into sections. All preferences persist per-user in the `UserSettings` table.

| Section | Capabilities |
|---------|--------------|
| **Account** | View Clerk profile (avatar, name, email, verification status). Edit display name (saved to Clerk via `PATCH /api/settings/profile`). Link to Clerk's `UserProfile` component for password, MFA, sessions, etc. |
| **Family** | List families with role badges. Rename families (owners/admins). Link to `/family` for member management. Shows pending invitation count for the first family the user administers. |
| **Calendar & privacy** | Default calendar view (`month`/`week`/`day`/`agenda`). Default event classification (`family`/`work`/`private`). Toggle *Share work availability with family*. |
| **Integrations** | Google Calendar: connect (OAuth), sync now (imports last 30 days → next 12 months), disconnect (removes imported events). Status shows connected account, last sync time, errors. |
| **Calendar categories** | Read-only reference of the three categories (Work, Family, Errands) with their colors. |