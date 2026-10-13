import { NextResponse } from "next/server";

/**
 * Dependency-free, per-instance fixed-window rate limiter.
 *
 * Scope and limitations (do not overstate):
 * - State lives in a module-level Map, so limits apply per running server
 *   instance. Multiple instances / serverless replicas each keep their own
 *   counters; the effective global limit is `limit x instanceCount`.
 * - This is defense-in-depth against abuse and bursts, NOT a substitute for
 *   edge rate limiting. Configure Cloudflare Rate Limiting rules (and/or WAF
 *   rules) for the same endpoints; that is the layer that can actually enforce
 *   a global, pre-origin limit.
 * - Client IPs are only trustworthy when the app is reached through the
 *   configured proxy. `CF-Connecting-IP` (set by Cloudflare) is preferred;
 *   `x-forwarded-for` is accepted as a fallback but is spoofable unless the
 *   origin only accepts traffic from Cloudflare.
 */

export interface RateLimitOptions {
  /** Maximum number of requests allowed inside the window. */
  readonly limit: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  /** Requests left in the current window (never negative). */
  readonly remaining: number;
  /** Seconds until the window resets; 0 while allowed. */
  readonly retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Conservative, risk-based presets. Thresholds are intentionally generous so
 * legitimate family members are never locked out. */
export const RATE_LIMITS = {
  familyInvitationCreate: { limit: 30, windowMs: 10 * 60_000 },
  invitationRedemption: { limit: 20, windowMs: 10 * 60_000 },
  googleConnect: { limit: 20, windowMs: 10 * 60_000 },
  googleCallback: { limit: 30, windowMs: 10 * 60_000 },
  googleSync: { limit: 20, windowMs: 10 * 60_000 },
} as const satisfies Record<string, RateLimitOptions>;

const buckets = new Map<string, Bucket>();
const PRUNE_INTERVAL_MS = 60_000;
let lastPruneAt = 0;

/** Drops expired buckets so an attacker cannot grow the map without bound. */
function pruneExpired(now: number): void {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Records a hit for `key` and reports whether it is allowed. Pure aside from
 * the module-level store; safe to call from any route handler.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  pruneExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= options.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  existing.count += 1;
  return { allowed: true, remaining: options.limit - existing.count, retryAfterSeconds: 0 };
}

const IP_PATTERN = /^[0-9a-fA-F:.]{3,64}$/;

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.trim();
  return IP_PATTERN.test(candidate) ? candidate : null;
}

/**
 * Best-effort client IP. Prefers Cloudflare's `CF-Connecting-IP`, then the
 * first hop of `x-forwarded-for`, then `x-real-ip`. Returns "unknown" when no
 * plausible IP is present; callers should treat that as a shared bucket.
 */
export function getClientIp(headers: Headers): string {
  const cf = normalizeIp(headers.get("cf-connecting-ip"));
  if (cf) return cf;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const firstHop = normalizeIp(forwarded.split(",")[0]);
    if (firstHop) return firstHop;
  }

  return normalizeIp(headers.get("x-real-ip")) ?? "unknown";
}

/** Builds a limiter key from a route scope plus the authenticated user id when
 * available, otherwise the client IP. */
export function rateLimitKey(
  scope: string,
  userId: string | null | undefined,
  headers: Headers
): string {
  const identity = userId ? `user:${userId}` : `ip:${getClientIp(headers)}`;
  return `${scope}:${identity}`;
}

function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

/**
 * Convenience wrapper for route handlers: returns a ready-to-return 429
 * response when the limit is exceeded, or null when the request may proceed.
 *
 * Usage:
 *   const limited = enforceRateLimit("google-sync", userId, req.headers, RATE_LIMITS.googleSync);
 *   if (limited) return limited;
 */
export function enforceRateLimit(
  scope: string,
  userId: string | null | undefined,
  headers: Headers,
  options: RateLimitOptions
): NextResponse | null {
  const result = checkRateLimit(rateLimitKey(scope, userId, headers), options);
  return result.allowed ? null : tooManyRequests(result.retryAfterSeconds);
}
