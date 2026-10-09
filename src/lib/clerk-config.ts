/**
 * True only when real Clerk keys are present. While `.env` still contains the
 * placeholder values (`..._placeholder`), auth is considered unconfigured and
 * both the proxy and the root layout run without Clerk so the app keeps
 * working until real keys are added.
 */
export function isClerkConfigured(): boolean {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!publishableKey || !secretKey) return false;
  if (publishableKey.includes("placeholder") || secretKey.includes("placeholder")) return false;
  const keyFormat = /^(pk|sk)_(test|live)_[A-Za-z0-9_-]{10,}$/;
  return keyFormat.test(publishableKey) && keyFormat.test(secretKey);
}