import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, readJsonBody } from "@/lib/api-response";
import {
  AuthError,
  authErrorResponse,
  requireAuthenticatedUserId,
  requireRoleAtLeast,
} from "@/lib/authorization";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Transfer family ownership to another existing member.
 *
 * Body: `{ userId: string }`. The caller must currently be the owner. The
 * target may hold any role — including `child` — and is promoted to `owner`;
 * the previous owner stays in the group as an `admin` rather than being
 * demoted to `member`, so they retain member-management rights.
 *
 * The three writes are atomic. A conditional `adminId` claim makes concurrent
 * transfers safe: only one request can match the current owner, so the group
 * can never end up with two owners.
 */
export async function POST(req: Request, context: RouteContext) {
  await connection();
  const { id: groupId } = await context.params;

  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { userId: targetUserId } = parsed.body;
  if (typeof targetUserId !== "string" || !targetUserId.trim()) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  const target = targetUserId.trim();

  try {
    const callerId = await requireAuthenticatedUserId();

    // Only the owner (verified via membership role) may transfer ownership.
    await requireRoleAtLeast(callerId, groupId, "owner");

    // Transferring to self would demote the owner to admin in the same
    // transaction; refuse it as a no-op instead.
    if (target === callerId) {
      throw new AuthError(400, "You already own this family group.");
    }

    const targetMembership = await prisma.familyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: target } },
      select: { id: true },
    });
    if (!targetMembership) {
      throw new AuthError(404, "The target member was not found in this family group.");
    }

    const group = await prisma.$transaction(async (tx) => {
      // Atomic claim: only the current owner can hand the group over. A
      // concurrent transfer by the same owner makes one of the two fail here.
      const claimed = await tx.familyGroup.updateMany({
        where: { id: groupId, adminId: callerId },
        data: { adminId: target },
      });
      if (claimed.count !== 1) {
        throw new AuthError(403, "Ownership has changed. Reload the family group and try again.");
      }

      await tx.familyGroupMember.update({
        where: { groupId_userId: { groupId, userId: target } },
        data: { role: "owner" },
      });
      await tx.familyGroupMember.update({
        where: { groupId_userId: { groupId, userId: callerId } },
        data: { role: "admin" },
      });

      return tx.familyGroup.findUniqueOrThrow({
        where: { id: groupId },
        select: { id: true, name: true, adminId: true },
      });
    });

    return NextResponse.json({
      id: group.id,
      name: group.name,
      adminId: group.adminId,
      role: "admin",
    });
  } catch (error) {
    return (
      authErrorResponse(error) ?? apiError(error, "Transferring family ownership", "Unable to transfer ownership.")
    );
  }
}
