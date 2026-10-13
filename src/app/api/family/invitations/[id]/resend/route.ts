import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-response";
import {
  authErrorResponse,
  generateInvitationToken,
  hashInvitationToken,
  requireAuthenticatedUserId,
  requireRoleAtLeast,
} from "@/lib/authorization";
import { DEFAULT_INVITATION_EXPIRY_DAYS, invitationExpiryFromDays } from "@/lib/invitations";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Re-issue an invitation to the same email/role with a fresh token and expiry.
 * Owner/admin only. The old invitation is revoked and the replacement created
 * in one transaction, so a retry cannot leave the family with two live tokens
 * for the same person. Accepts only email-bound invitations (a token-only
 * invitation has no recipient to resend to).
 */
export async function POST(req: Request, context: RouteContext) {
  await connection();
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Invitation id is required." }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
    // Same budget as creating a brand-new invitation.
    const limited = enforceRateLimit(
      "family-invite-create",
      userId,
      req.headers,
      RATE_LIMITS.familyInvitationCreate
    );
    if (limited) return limited;

    const invitation = await prisma.familyInvitation.findUnique({ where: { id } });
    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
    }

    await requireRoleAtLeast(userId, invitation.familyGroupId, "admin");

    if (!invitation.email) {
      return NextResponse.json(
        { error: "Only invitations issued to an email address can be resent." },
        { status: 400 }
      );
    }
    if (invitation.usedAt) {
      return NextResponse.json({ error: "This invitation has already been accepted." }, { status: 400 });
    }

    const rawToken = generateInvitationToken();
    const expiresAt = invitationExpiryFromDays(DEFAULT_INVITATION_EXPIRY_DAYS);

    const created = await prisma.$transaction(async (tx) => {
      await tx.familyInvitation.updateMany({
        where: { id: invitation.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.familyInvitation.create({
        data: {
          familyGroupId: invitation.familyGroupId,
          tokenHash: hashInvitationToken(rawToken),
          email: invitation.email,
          role: invitation.role,
          createdById: userId,
          expiresAt,
        },
      });
    });

    // Same response shape as POST /api/family/invitations: the raw token is
    // returned exactly once and never stored in plaintext.
    return NextResponse.json(
      {
        id: created.id,
        familyGroupId: created.familyGroupId,
        email: created.email,
        role: created.role,
        createdById: created.createdById,
        expiresAt: created.expiresAt,
        usedAt: created.usedAt,
        createdAt: created.createdAt,
        token: rawToken,
      },
      { status: 201 }
    );
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Resending invitation", "Unable to resend the invitation.");
  }
}
