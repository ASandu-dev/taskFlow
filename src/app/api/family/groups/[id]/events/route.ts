import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, isDateString, readJsonBody } from "@/lib/api-response";
import { authErrorResponse, requireAuthenticatedUserId, requireRoleAtLeast } from "@/lib/authorization";
import { getCategoryColor, isEventCategory } from "@/lib/categories";
import { validateEventOptionalFields } from "@/lib/event-validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Add a shared family event to the group. `member` or higher may add events. */
export async function POST(req: Request, context: RouteContext) {
  await connection();
  const { id: groupId } = await context.params;

  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { title, date, time, category, endTime, description, location, timezone } = parsed.body;
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
  const fieldError = validateEventOptionalFields({
    endTime,
    description,
    location,
    timezone,
    startTime: typeof time === "string" && time ? time : null,
  });
  if (fieldError) {
    return NextResponse.json({ error: fieldError }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
    // `member` or higher may add a shared event; a `child` is read-only.
    await requireRoleAtLeast(userId, groupId, "member");

    const resolvedCategory = isEventCategory(category) ? category : null;
    const resolvedColor = getCategoryColor(resolvedCategory ?? "family") ?? "#ec4899";
    const event = await prisma.calendarEvent.create({
      data: {
        title: title.trim(),
        date,
        time: time || "00:00",
        color: resolvedColor,
        category: resolvedCategory,
        endTime: typeof endTime === "string" && endTime ? endTime : null,
        description: typeof description === "string" && description.trim() ? description.trim() : null,
        location: typeof location === "string" && location.trim() ? location.trim() : null,
        timezone: typeof timezone === "string" && timezone ? timezone : null,
        source: "local",
        familyGroupId: groupId,
        createdById: userId,
        // Family events are always shared with the whole family.
        visibility: "family",
      },
    });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Adding family event", "Unable to add the family event.");
  }
}
