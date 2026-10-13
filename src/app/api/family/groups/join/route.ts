import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, readJsonBody } from "@/lib/api-response";
import { authErrorResponse, redeemFamilyInvitation, requireAuthenticatedUserId } from "@/lib/authorization";
import { getClerkPrimaryEmail } from "@/lib/clerk-profile";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Redeem a family invitation.
 *
 * Body: `{ token: string }`. The legacy `code` field is accepted as a
 * deprecated alias for the same token value; the raw 6-character `inviteCode`
 * is NOT a valid join credential and will not match any invitation.
 */
export async function POST(req: Request) {
  await connection();
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { token, code } = parsed.body;
  const rawToken = typeof token === "string" ? token : typeof code === "string" ? code : undefined;
  if (!rawToken || !rawToken.trim()) {
    return NextResponse.json({ error: "Invitation token is required." }, { status: 400 });
  }
  if (rawToken.length > 512) {
    return NextResponse.json({ error: "Invitation token is not valid." }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
    // Defense-in-depth; edge rate limiting should also be configured in Cloudflare.
    const limited = enforceRateLimit("family-join", userId, req.headers, RATE_LIMITS.invitationRedemption);
    if (limited) return limited;
    // Resolve the caller's primary email so an email-bound invitation can be
    // matched. Null (keyless development / no primary address) skips the check.
    const userEmail = await getClerkPrimaryEmail(userId);
    const redeemed = await redeemFamilyInvitation(userId, rawToken.trim(), userEmail);
    const group = await prisma.familyGroup.findUnique({
      where: { id: redeemed.groupId },
      include: { _count: { select: { members: true } } },
    });
    if (!group) {
      return NextResponse.json({ error: "Family group not found." }, { status: 404 });
    }
    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      inviteCode: group.inviteCode,
      adminId: group.adminId,
      role: redeemed.role,
      isAdmin: redeemed.role === "owner" || redeemed.role === "admin",
      joined: true,
      createdAt: group.createdAt,
      memberCount: group._count.members,
    });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Joining family group", "Unable to join the family group.");
  }
}
