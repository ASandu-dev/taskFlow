import { connection, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { authErrorResponse, redeemFamilyInvitation, requireAuthenticatedUserId } from "@/lib/authorization";
import { getClerkPrimaryEmail } from "@/lib/clerk-profile";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// The dynamic segment is named `id` because it is shared with the sibling
// revoke route. Here the value is the raw invitation token from the invite
// link; Next.js does not allow two differently named dynamic segments at the
// same level.
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Redeem an invitation token. Validates existence, expiry, single-use, and
 * email binding, then creates the membership atomically.
 */
export async function POST(req: Request, context: RouteContext) {
  await connection();
  const { id: token } = await context.params;
  if (!token || token.length > 512) {
    return NextResponse.json({ error: "Invitation token is not valid." }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
    // Defense-in-depth; edge rate limiting should also be configured in Cloudflare.
    const limited = enforceRateLimit("invitation-accept", userId, req.headers, RATE_LIMITS.invitationRedemption);
    if (limited) return limited;
    // Resolve the caller's primary email so an email-bound invitation can be
    // matched; null (keyless development / no primary address) skips the check.
    const userEmail = await getClerkPrimaryEmail(userId);
    const redeemed = await redeemFamilyInvitation(userId, token, userEmail);
    return NextResponse.json({ ok: true, groupId: redeemed.groupId, role: redeemed.role });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Accepting invitation", "Unable to accept the invitation.");
  }
}
