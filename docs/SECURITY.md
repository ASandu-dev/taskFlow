# Security Model

This document describes the security architecture of TaskFlow.

## Tenant Model

Two tenant scopes exist, never mixed:

| Scope | Tables | Access Control |
|-------|--------|----------------|
| **Personal** | `Project` (`ownerId`), `Goal` (`ownerId`), `CalendarEvent` (`ownerId`), `Task` (via project) | Owned by a single Clerk `userId`. No sharing. |
| **Family** | `FamilyGroup`, `FamilyGroupMember`, `Project` (`familyGroupId`), `Goal` (`familyGroupId`), `CalendarEvent` (`familyGroupId`), `Task` (via project) | Membership via `FamilyGroupMember` with role hierarchy. |

A row belongs to **exactly one** scope. The schema enforces this with partial unique indexes and application-level validation.

## Authorization Rules

### Role Hierarchy (highest → lowest)

```
owner > admin > member > child
```

- **owner**: Group creator (`FamilyGroup.adminId`). Full control including deletion.
- **admin**: Can manage members, invitations, and all family resources.
- **member**: Can create/edit family resources, accept invitations.
- **child**: Restricted to the daily checklist (`/checklist`). Can only complete assigned recurring tasks. Cannot create/edit projects, goals, or events.

### Resource Access

| Resource | Personal Scope | Family Scope |
|----------|----------------|--------------|
| Projects/Goals/Events | `ownerId === userId` | `familyGroupId` + membership role ≥ `member` |
| Tasks | Via project ownership | Via project's `familyGroupId` + membership |
| Task Completion | N/A | Assignee (`task.assigneeId === userId`) or role ≥ `admin` |
| Invitations | N/A | Role ≥ `admin` to create; token holder to redeem |
| Google Integration | Per-user (`Integration.userId`) | N/A (personal only) |

### Server-Side Enforcement

All mutations go through route handlers (`/api/*`) that:
1. Verify Clerk session (`auth()`).
2. Resolve tenant scope via `resolveCreateScope(userId, familyGroupId?)`.
3. Check role permissions for the target resource.
4. **Fail closed** — any check failure returns 403/404, never 200 with filtered data.

## Invitation Token Scheme

- **Generation:** CSPRNG (32 bytes → URL-safe base64, ~43 chars).
- **Storage:** Only SHA-256 hash (`tokenHash`) stored in `FamilyInvitation`.
- **Binding:** Optional `email` field binds the invitation to a specific address.
- **Expiry:** `expiresAt` (default 7 days). Expired tokens cannot be redeemed.
- **Single-use:** `usedAt` is `null` at creation; set on redemption. A second redemption fails.
- **Redemption flow:** Invitee clicks link → `/api/family/invitations/[id]/accept` → verifies hash, expiry, `usedAt === null`, email match → creates `FamilyGroupMember` → sets `usedAt` and `usedById`.

## Calendar Visibility Policy

### Server-Side Enforcement

The calendar visibility policy is enforced **exclusively server-side** in `GET /api/events` via `src/lib/event-visibility.ts`. The function `sanitizeEventForViewer` is pure, framework-free, and unit-tested. Frontend filters never bypass it — the API returns only what the authenticated viewer may see.

### What Work Blocks Expose

When a family member views another member's `work` event and the owner has **Share work availability with family** enabled (default: on), the API returns a `WorkBlock` containing only:

| Field | Value |
|-------|-------|
| `id` | `null` (never the real event ID) |
| `key` | Stable SHA-256 hash of the real event ID (truncated to 16 hex chars) — allows client-side keying without ID leakage |
| `title` | `"Work"` (literal string, never the original title) |
| `date` | Event date (YYYY-MM-DD) |
| `time` | Start time (HH:MM) |
| `endTime` | End time (HH:MM) or `null` |
| `timezone` | IANA timezone or `null` |
| `visibility` | `"work"` |
| `source` | `"work-block"` |

### What Work Blocks Never Expose

The following are **never** included in a `WorkBlock` or leaked to family members:

- Original event `id`
- `title` (the actual event title)
- `description`
- `location`
- `category` (Work/Family/Errands)
- `color`
- `createdById`
- `ownerId` (beyond what is inferable from the block's presence)
- `familyGroupId` (always `null` for work events)
- Any custom fields or metadata

### Share Work Availability Opt-Out

Each user controls `shareWorkAvailability` in **Settings → Calendar & privacy** (persisted in `UserSettings.shareWorkAvailability`, default `true`).

- **On (default):** Family members see generic "Work" busy blocks for the user's `work` events.
- **Off:** The user's `work` events are **completely hidden** from family members — no busy blocks, no presence indication.

The opt-out is checked server-side at query time via `shareWorkAvailabilityByOwner` map passed to `sanitizeEventForViewer`.

## Invitation Security

### Token Handling

- **Hash-only storage:** Only `SHA-256(token)` is persisted. The raw token is returned **once** at creation and never logged.
- **No token in URLs/logs:** The `/join?token=` link is constructed client-side from the copied token. Server logs never contain the raw token.
- **Constant-time comparison:** Token verification uses the stored hash; no timing side-channel on the raw token.

### Lifecycle Guarantees

| Property | Enforcement |
|----------|-------------|
| **Single-use** | `usedAt` timestamp set atomically on redemption; `unique` constraint on `tokenHash` prevents reuse. |
| **Expiry** | `expiresAt` checked on preview and redemption; expired tokens return `expired` status. Configurable 1–30 days (default 7). |
| **Revocation** | Owners/admins can set `revokedAt` before acceptance; revoked tokens return `revoked` status. |
| **Email binding** | If `email` is set on the invitation, redemption requires the signed-in user's Clerk primary email to match (case-insensitive). |
| **Duplicate prevention** | Creation rejects if an active (pending, unexpired, unrevoked) invitation already exists for the same email in the same family. |

### Rate Limits

- **In-app:** Per-user fixed-window limiter on invitation creation (`family-invite-create` key).
- **Edge (Cloudflare):** 10 requests/minute per IP on `/api/family/invitations*` (see DEPLOYMENT.md).
- **Preview endpoint:** Unauthenticated but token-bound; no additional rate limit beyond edge.

### No Token Logging

- The raw token is **never** written to application logs, database audit fields, or error reports.
- Only the `tokenHash` appears in the database. The `CreatedFamilyInvitation` response (returned once to the inviter) is the sole exposure of the raw token.

## Fail-Closed Authentication

- **Development (`NODE_ENV !== 'production'`):** Clerk configuration is permissive for local testing.
- **Production (`NODE_ENV === 'production'`):** `clerkConfig.ts` throws at build/startup if `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` or `CLERK_SECRET_KEY` are missing. Middleware returns 401 for unauthenticated requests to protected routes. No silent fallbacks.

## Per-User Google Integration

- Each `Integration` row is scoped to `userId` (Clerk ID).
- `provider` is unique per user (`@@unique([provider, userId])`).
- OAuth tokens (`accessToken`, `refreshToken`) are **never shared** across users.
- Sync operations run in the context of the authenticated user only.

## Rate Limiting (Defense-in-Depth)

- **In-memory fixed-window limiter** (`src/lib/rate-limit.ts`).
- Key: `CF-Connecting-IP` (from Cloudflare) → falls back to `x-forwarded-for` → `unknown`.
- Applied to: invitation creation, group join, Google OAuth connect/sync.
- **Limitation:** Per-instance only. Not shared across replicas. Cloudflare edge rate limiting (see DEPLOYMENT.md) is the primary enforcement.

## CSRF / Origin Checks

- All state-changing routes (`POST`, `PUT`, `PATCH`, `DELETE`) verify:
  - `Origin` header matches the app's public origin (from `GOOGLE_REDIRECT_URI` origin or `NEXT_PUBLIC_APP_URL`).
  - `Content-Type` is `application/json` (rejects form submissions).
- Clerk's CSRF protection covers authentication flows.

## Cloudflare / Clerk Must Enforce

| Layer | Responsibility |
|-------|----------------|
| **Cloudflare** | TLS termination (Full Strict), WAF/Managed Challenge on auth routes, edge rate limiting, IP reputation, `CF-Connecting-IP` authenticity, HSTS (app also sends) |
| **Clerk** | Authentication (Google OAuth), session management, MFA, device tracking, bot detection, passwordless options |

## Known Residual Risks

| Risk | Mitigation | Status |
|------|------------|--------|
| In-memory rate limiter is per-instance | Cloudflare edge rate limiting is primary | Accepted |
| CSP is Report-Only | Promote to enforcing after zero violations observed | Planned |
| `/api/health` is public | No sensitive data exposed; only status + DB connectivity | Accepted |
| No distributed rate limiting / session store | Single-replica deployment; Cloudflare absorbs burst | Accepted for current scale |
| `GOOGLE_REDIRECT_URI` must be set manually | Documented in DEPLOYMENT.md; app fails closed without it | Documented |
| Database credentials in `.env` | Use Docker secrets / secret manager in production | Operational |

## Security Contacts

- Application issues: Create a private GitHub Security Advisory.
- Infrastructure (Cloudflare/Clerk/Google): Rotate credentials immediately if compromised.