import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-response";
import { authErrorResponse, requireAuthenticatedUserId, requireMembership } from "@/lib/authorization";

interface RouteContext {
  params: Promise<{ id: string; eventId: string }>;
}

/** Delete a shared family event. Only an owner or admin may delete events. */
export async function DELETE(_req: Request, context: RouteContext) {
  await connection();
  const { id: groupId, eventId } = await context.params;

  try {
    const userId = await requireAuthenticatedUserId();
    await requireMembership(userId, groupId, ["owner", "admin"]);

    const event = await prisma.calendarEvent.findFirst({
      where: { id: eventId, familyGroupId: groupId },
      select: { id: true },
    });
    if (!event) {
      return NextResponse.json({ error: "Event not found in this family group." }, { status: 404 });
    }

    await prisma.calendarEvent.delete({ where: { id: eventId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Deleting family event", "Unable to delete the family event.");
  }
}
