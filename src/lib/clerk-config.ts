/**
 * True only when real Clerk keys are present. Placeholder or absent keys mean
 * the app has no working identity provider.
 *
 * The keyless "run without auth" convenience exists ONLY for local development
 * (see {@link isKeylessDevMode}). In production an unconfigured Clerk means the
 * app is misconfigured and MUST fail closed.
 */
export function isClerkConfigured(): boolean {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!publishableKey || !secretKey) return false;
  if (publishableKey.includes("placeholder") || secretKey.includes("placeholder")) return false;
  const keyFormat = /^(pk|sk)_(test|live)_[A-Za-z0-9_-]{10,}$/;
  return keyFormat.test(publishableKey) && keyFormat.test(secretKey);
}

/** True on production builds and production servers. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Keyless development mode: only non-production, with no usable Clerk keys.
 *
 * This is the single place that authorizes running the app without an identity
 * provider. It is deliberately impossible to enable in production, so a missing
 * or placeholder Clerk key in production fails closed instead of exposing data
 * under a shared "anonymous" identity.
 */
export function isKeylessDevMode(): boolean {
  return !isClerkConfigured() && !isProduction();
}
