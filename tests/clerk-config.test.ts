import { describe, expect, it, vi } from "vitest";

import { isClerkConfigured, isKeylessDevMode, isProduction } from "@/lib/clerk-config";
import { getAppOrigin } from "@/lib/google-calendar";

/**
 * Fail-closed authentication configuration.
 *
 * These tests pin the single most important deployment guarantee: in production
 * a missing or placeholder Clerk key must never fall back to a shared identity.
 */

const VALID_PK = "pk_test_00000000000000000000";
const VALID_SK = "sk_test_00000000000000000000";

function useClerkKeys(publishable: string, secret: string) {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", publishable);
  vi.stubEnv("CLERK_SECRET_KEY", secret);
}

describe("isClerkConfigured", () => {
  it("is true when keys are validly formatted", () => {
    useClerkKeys(VALID_PK, VALID_SK);
    expect(isClerkConfigured()).toBe(true);
  });

  it.each([
    ["missing publishable key", "", VALID_SK],
    ["missing secret key", VALID_PK, ""],
    ["both missing", "", ""],
    ["placeholder keys", `pk_test_placeholder_${"x".repeat(12)}`, `sk_test_placeholder_${"x".repeat(12)}`],
  ])("is false for %s", (_label, publishable, secret) => {
    useClerkKeys(publishable, secret);
    expect(isClerkConfigured()).toBe(false);
  });

  it("rejects malformed keys", () => {
    useClerkKeys("pk_live_short", "sk_live_also-short");
    expect(isClerkConfigured()).toBe(false);
  });
});

describe("isKeylessDevMode", () => {
  it("is FALSE in production when Clerk is missing or placeholder", () => {
    vi.stubEnv("NODE_ENV", "production");

    useClerkKeys("", "");
    expect(isProduction()).toBe(true);
    expect(isKeylessDevMode()).toBe(false);

    useClerkKeys(`pk_test_placeholder_${"x".repeat(12)}`, `sk_test_placeholder_${"x".repeat(12)}`);
    expect(isKeylessDevMode()).toBe(false);
  });

  it("is TRUE in development when Clerk is missing", () => {
    vi.stubEnv("NODE_ENV", "development");
    useClerkKeys("", "");

    expect(isKeylessDevMode()).toBe(true);
    expect(isClerkConfigured()).toBe(false);
  });

  it("is FALSE in development when Clerk is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    useClerkKeys(VALID_PK, VALID_SK);

    expect(isKeylessDevMode()).toBe(false);
  });
});

describe("getAppOrigin", () => {
  const requestUrl = new URL("https://evil.example.com/some/path");

  it("returns null in production when GOOGLE_REDIRECT_URI is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "");

    expect(getAppOrigin(requestUrl)).toBeNull();
  });

  it("returns null in production when GOOGLE_REDIRECT_URI is malformed", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "not a url");

    expect(getAppOrigin(requestUrl)).toBeNull();
  });

  it("trusts the configured GOOGLE_REDIRECT_URI origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.example.com/api/integrations/google/callback");

    expect(getAppOrigin(requestUrl)).toBe("https://app.example.com");
  });

  it("uses the request origin in development when no redirect URI is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "");

    expect(getAppOrigin(requestUrl)).toBe("https://evil.example.com");
  });
});
