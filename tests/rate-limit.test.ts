import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkRateLimit,
  enforceRateLimit,
  getClientIp,
  rateLimitKey,
  type RateLimitOptions,
} from "@/lib/rate-limit";

const WINDOW_MS = 60_000;
const options: RateLimitOptions = { limit: 3, windowMs: WINDOW_MS };

// Each test uses a unique key because the fixed-window store is module-level.
let keyCounter = 0;
const freshKey = () => `rate-limit-test-${keyCounter++}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows up to the limit, then rejects with a positive retryAfterSeconds", () => {
    const key = freshKey();

    for (let i = 0; i < options.limit; i += 1) {
      const result = checkRateLimit(key, options);
      expect(result.allowed).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
    }

    const rejected = checkRateLimit(key, options);
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks remaining requests across the window", () => {
    const key = freshKey();

    expect(checkRateLimit(key, options).remaining).toBe(2);
    expect(checkRateLimit(key, options).remaining).toBe(1);
    expect(checkRateLimit(key, options).remaining).toBe(0);
  });

  it("resets once the window elapses", () => {
    const key = freshKey();

    for (let i = 0; i < options.limit; i += 1) checkRateLimit(key, options);
    expect(checkRateLimit(key, options).allowed).toBe(false);

    vi.advanceTimersByTime(WINDOW_MS);

    const afterReset = checkRateLimit(key, options);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(options.limit - 1);
  });
});

describe("enforceRateLimit", () => {
  it("returns a 429 with Retry-After once the limit is exceeded", async () => {
    const key = freshKey();
    const scope = `${key}-scope`;
    const headers = new Headers();

    for (let i = 0; i < options.limit; i += 1) {
      expect(enforceRateLimit(scope, "user_1", headers, options)).toBeNull();
    }

    const response = enforceRateLimit(scope, "user_1", headers, options);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get("Retry-After"))).toBeGreaterThan(0);
    await expect(response?.json()).resolves.toEqual({
      error: "Too many requests. Please slow down and try again shortly.",
    });
  });
});

describe("getClientIp", () => {
  it("prefers CF-Connecting-IP", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.9, 10.0.0.1",
      "x-real-ip": "192.0.2.1",
    });

    expect(getClientIp(headers)).toBe("203.0.113.7");
  });

  it("falls back to the first x-forwarded-for hop", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.9, 10.0.0.1",
      "x-real-ip": "192.0.2.1",
    });

    expect(getClientIp(headers)).toBe("198.51.100.9");
  });

  it("falls back to x-real-ip", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "192.0.2.1" }))).toBe("192.0.2.1");
  });

  it("rejects malformed values and returns unknown", () => {
    const headers = new Headers({
      "cf-connecting-ip": "<script>alert(1)</script>",
      "x-forwarded-for": "not an ip!!",
      "x-real-ip": "  ",
    });

    expect(getClientIp(headers)).toBe("unknown");
  });

  it("ignores a malformed preferred header and uses the next valid source", () => {
    const headers = new Headers({
      "cf-connecting-ip": "bad value",
      "x-forwarded-for": "203.0.113.42, 10.0.0.1",
    });

    expect(getClientIp(headers)).toBe("203.0.113.42");
  });
});

describe("rateLimitKey", () => {
  it("prefers the authenticated user id over the IP", () => {
    const headers = new Headers({ "cf-connecting-ip": "203.0.113.7" });

    expect(rateLimitKey("google-sync", "user_1", headers)).toBe("google-sync:user:user_1");
  });

  it("falls back to the client IP when there is no user", () => {
    const headers = new Headers({ "cf-connecting-ip": "203.0.113.7" });

    expect(rateLimitKey("google-sync", null, headers)).toBe("google-sync:ip:203.0.113.7");
    expect(rateLimitKey("google-sync", undefined, headers)).toBe("google-sync:ip:203.0.113.7");
  });

  it("uses a shared unknown bucket when no IP is resolvable", () => {
    expect(rateLimitKey("google-sync", null, new Headers())).toBe("google-sync:ip:unknown");
  });
});
