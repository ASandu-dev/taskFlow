import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-response";
import {
  AuthError,
  authErrorResponse,
  requireAuthenticatedUserId,
  requireMembership,
} from "@/lib/authorization";

interface RouteContext {
  params: Promise<{ id: string; userId: string }>;
}

/**
 * Remove another member from the family group. Only an owner or admin may do
 * so, and the group owner can never be removed. Self-removal is refused here
 * (use the leave endpoint) so the two flows keep distinct semantics.
 *
 * Deleting the membership row revokes the target's access to every
 * family-scoped resource immediately; their personal data is unaffected.
 */
export async function DELETE(_req: Request, context: RouteContext) {
  await connection();
  const { id: groupId, userId: targetUserId } = await context.params;

  try {
    const callerId = await requireAuthenticatedUserId();

    // Only owner/admin may manage membership; a member/child gets 403.
    await requireMembership(callerId, groupId, ["owner", "admin"]);

    // Removing yourself must go through /leave so ownership/orphan rules apply.
    if (targetUserId === callerId) {
      throw new AuthError(400, "Use the leave endpoint to remove yourself from the family.");
    }

    const target = await prisma.familyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (!target) {
      throw new AuthError(404, "The member was not found in this family group.");
    }
    if (target.role === "owner") {
      throw new AuthError(400, "The owner cannot be removed. Transfer ownership first.");
    }

    // The role guard is defense-in-depth against a concurrent ownership
    // transfer racing between the check above and the write.
    const deleted = await prisma.familyGroupMember.deleteMany({
      where: { groupId, userId: targetUserId, role: { not: "owner" } },
    });
    if (deleted.count === 0) {
      throw new AuthError(404, "The member was not found in this family group.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return (
      authErrorResponse(error) ?? apiError(error, "Removing family member", "Unable to remove the family member.")
    );
  }
}
