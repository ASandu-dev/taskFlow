import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-response";
import { authErrorResponse, requireAuthenticatedUserId, requireGoalAccess } from "@/lib/authorization";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const userId = await requireAuthenticatedUserId();
    // Deleting a family goal requires the owner or admin role.
    await requireGoalAccess(userId, id, "delete");
    await prisma.goal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Deleting goal", "Unable to delete goal.");
  }
}
