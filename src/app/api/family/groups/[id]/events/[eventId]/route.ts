import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-response";
import { requireUserId } from "@/lib/auth";

interface RouteContext {
  params: Promise<{ id: string; eventId: string }>;
}

/** Delete a shared family event. Only the group admin may delete events. */
export async function DELETE(_req: Request, context: RouteContext) {
  await connection();
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const { id: groupId, eventId } = await context.params;

  try {
    const group = await prisma.familyGroup.findUnique({
      where: { id: groupId },
      select: { adminId: true },
    });
    if (!group) {
      return NextResponse.json({ error: "Family group not found." }, { status: 404 });
    }
    if (group.adminId !== userId) {
      return NextResponse.json({ error: "Only the group admin can delete family events." }, { status: 403 });
    }

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
    return apiError(error, "Deleting family event", "Unable to delete the family event.");
  }
}