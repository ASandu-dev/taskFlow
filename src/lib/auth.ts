import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured, isKeylessDevMode } from "@/lib/clerk-config";

/**
 * Returns the signed-in user's Clerk id, or null when the request is not
 * authenticated.
 *
 * Fail-closed contract:
 * - Clerk configured: the id from the verified session (or null).
 * - Clerk NOT configured in production: always null. A misconfigured deployment
 *   must never fabricate an identity or expose data.
 * - Clerk NOT configured in development: the shared "anonymous" principal, so
 *   local development keeps working without keys.
 *
 * Route handlers should short-circuit with 401 when this is null; `proxy.ts`
 * already gates browsers and API routes.
 */
export async function requireUserId(): Promise<string | null> {
  if (!isClerkConfigured()) {
    return isKeylessDevMode() ? "anonymous" : null;
  }
  const { userId } = await auth();
  return userId;
}

/** Resolves a signed-in user's Clerk id or throws a 401 response. */
export async function mustBeSignedIn(): Promise<string> {
  const userId = await requireUserId();
  if (!userId) {
    const error = new Error("Authentication required.");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  return userId;
}
