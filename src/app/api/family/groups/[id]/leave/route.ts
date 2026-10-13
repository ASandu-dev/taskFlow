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
  params: Promise<{ id: string }>;
}

/**
 * Leave a family group by deleting the caller's own membership.
 *
 * Access is membership-driven, so deleting the row revokes access to every
 * family-scoped resource immediately. The user's personal (ownerId-scoped)
 * data is untouched and family data stays with the group.
 *
 * An owner is refused: removing the owner membership would orphan `adminId`.
 * Ownership must be transferred first.
 */
export async function POST(_req: Request, context: RouteContext) {
  await connection();
  const { id: groupId } = await context.params;

  try {
    const userId = await requireAuthenticatedUserId();

    // Non-members get 403 (not 404) so group existence is never leaked.
    const membership = await requireMembership(userId, groupId);
    if (membership.role === "owner") {
      throw new AuthError(400, "Transfer ownership to another member before leaving.");
    }

    // The `role: { not: "owner" }` guard means a concurrent transfer cannot
    // turn a legitimate delete into an orphaned group. A zero count means the
    // row was already removed (concurrent leave) or is now the owner.
    const deleted = await prisma.familyGroupMember.deleteMany({
      where: { groupId, userId, role: { not: "owner" } },
    });
    if (deleted.count === 0) {
      throw new AuthError(403, "You do not have access to this family group.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return (
      authErrorResponse(error) ?? apiError(error, "Leaving family group", "Unable to leave the family group.")
    );
  }
}
