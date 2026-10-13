import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-response";
import {
  authErrorResponse,
  hashInvitationToken,
  requireAuthenticatedUserId,
} from "@/lib/authorization";
import { getClerkPrimaryEmail } from "@/lib/clerk-profile";

type PreviewReason =
  | "not-found"
  | "revoked"
  | "expired"
  | "already-accepted"
  | "email-mismatch"
  | "already-member";

interface PreviewBody {
  readonly valid: boolean;
  readonly reason?: PreviewReason;
  readonly familyName?: string;
  readonly emailMatch?: boolean;
  readonly alreadyMember?: boolean;
}

/**
 * Non-consuming invitation preview. Lets the invitee see whether a token can be
 * used and, if not, why, without redeeming it. The raw token/tokenHash are
 * never echoed; only derived booleans and the family name are returned.
 *
 * Query: `?token=<raw token>`.
 */
export async function GET(req: Request) {
  await connection();
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token || !token.trim()) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
    const invitation = await prisma.familyInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(token.trim()) },
      select: {
        email: true,
        familyGroupId: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        familyGroup: { select: { name: true } },
      },
    });

    if (!invitation) {
      const body: PreviewBody = { valid: false, reason: "not-found" };
      return NextResponse.json(body);
    }

    const familyName = invitation.familyGroup.name;
    const userEmail = await getClerkPrimaryEmail(userId);
    const emailMatch =
      invitation.email === null ||
      (userEmail !== null && invitation.email.toLowerCase() === userEmail.toLowerCase());
    const membership = await prisma.familyGroupMember.findUnique({
      where: { groupId_userId: { groupId: invitation.familyGroupId, userId } },
      select: { id: true },
    });
    const alreadyMember = membership !== null;

    const invalid = (reason: PreviewReason): NextResponse => {
      const body: PreviewBody = { valid: false, reason, familyName, emailMatch, alreadyMember };
      return NextResponse.json(body);
    };

    if (invitation.usedAt) return invalid("already-accepted");
    if (invitation.revokedAt) return invalid("revoked");
    if (invitation.expiresAt.getTime() <= Date.now()) return invalid("expired");
    if (!emailMatch) return invalid("email-mismatch");
    if (alreadyMember) return invalid("already-member");

    const body: PreviewBody = { valid: true, familyName, emailMatch, alreadyMember };
    return NextResponse.json(body);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Previewing invitation", "Unable to preview the invitation.");
  }
}
