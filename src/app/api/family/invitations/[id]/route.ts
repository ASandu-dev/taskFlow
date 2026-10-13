import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-response";
import {
  authErrorResponse,
  requireAuthenticatedUserId,
  requireRoleAtLeast,
} from "@/lib/authorization";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Revoke an invitation. Owner/admin of the owning family only. Revocation is a
 * soft delete (setting `revokedAt`) so the audit trail is preserved and the
 * token can never be redeemed again; repeating the call is idempotent.
 */
export async function DELETE(_req: Request, context: RouteContext) {
  await connection();
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Invitation id is required." }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
    const invitation = await prisma.familyInvitation.findUnique({
      where: { id },
      select: { id: true, familyGroupId: true },
    });
    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
    }

    await requireRoleAtLeast(userId, invitation.familyGroupId, "admin");

    // Only the first revocation writes; later calls match nothing and remain a
    // successful no-op.
    await prisma.familyInvitation.updateMany({
      where: { id: invitation.id, familyGroupId: invitation.familyGroupId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Revoking invitation", "Unable to revoke the invitation.");
  }
}
