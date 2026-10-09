import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/clerk-config";

/**
 * Returns the signed-in user's Clerk id, or null when the request is not
 * authenticated. Route handlers should short-circuit with 401 when this is
 * null — the proxy already redirects browsers to /sign-in.
 */
export async function requireUserId(): Promise<string | null> {
  // Without real Clerk keys the app runs without auth (see isClerkConfigured);
  // treat the single anonymous user as "anonymous" so personal data still loads.
  if (!isClerkConfigured()) return "anonymous";
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