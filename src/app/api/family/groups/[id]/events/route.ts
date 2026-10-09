import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, isDateString, readJsonBody } from "@/lib/api-response";
import { requireUserId } from "@/lib/auth";
import { getCategoryColor, isEventCategory } from "@/lib/categories";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Add a shared family event to the group. Any member may add events. */
export async function POST(req: Request, context: RouteContext) {
  await connection();
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const { id: groupId } = await context.params;

  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { title, date, time, category } = parsed.body;
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }
  if (!isDateString(date)) {
    return NextResponse.json({ error: "date must be a valid date in YYYY-MM-DD format." }, { status: 400 });
  }
  if (time !== undefined && (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    return NextResponse.json({ error: "time must use HH:MM format." }, { status: 400 });
  }
  if (category !== undefined && category !== null && !isEventCategory(category)) {
    return NextResponse.json({ error: "category must be one of: work, family, errands." }, { status: 400 });
  }

  try {
    const membership = await prisma.familyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "You are not a member of this family group." }, { status: 403 });
    }

    const resolvedCategory = isEventCategory(category) ? category : null;
    const resolvedColor = getCategoryColor(resolvedCategory ?? "family") ?? "#ec4899";
    const event = await prisma.calendarEvent.create({
      data: {
        title: title.trim(),
        date,
        time: time || "00:00",
        color: resolvedColor,
        category: resolvedCategory,
        source: "local",
        familyGroupId: groupId,
      },
    });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return apiError(error, "Adding family event", "Unable to add the family event.");
  }
}