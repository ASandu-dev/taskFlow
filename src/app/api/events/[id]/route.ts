import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, isDateString, readJsonBody } from "@/lib/api-response";
import { getCategoryColor, isEventCategory } from "@/lib/categories";
import { isEventVisibility, validateEventOptionalFields } from "@/lib/event-validation";
import { authErrorResponse, requireAuthenticatedUserId, requireEventAccess } from "@/lib/authorization";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { title, date, time, color, category, endTime, description, location, timezone, visibility } =
    parsed.body;

  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    return NextResponse.json({ error: "title must not be empty." }, { status: 400 });
  }
  if (date !== undefined && !isDateString(date)) {
    return NextResponse.json({ error: "date must be a valid date in YYYY-MM-DD format." }, { status: 400 });
  }
  if (time !== undefined && (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    return NextResponse.json({ error: "time must use HH:MM format." }, { status: 400 });
  }
  if (color !== undefined && typeof color !== "string") {
    return NextResponse.json({ error: "color must be a string." }, { status: 400 });
  }
  if (category !== undefined && category !== null && !isEventCategory(category)) {
    return NextResponse.json({ error: "category must be one of: work, family, errands." }, { status: 400 });
  }
  if (visibility !== undefined && !isEventVisibility(visibility)) {
    return NextResponse.json({ error: "visibility must be one of: family, work, private." }, { status: 400 });
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
  if (
    title === undefined &&
    date === undefined &&
    time === undefined &&
    color === undefined &&
    category === undefined &&
    endTime === undefined &&
    description === undefined &&
    location === undefined &&
    timezone === undefined &&
    visibility === undefined
  ) {
    return NextResponse.json({ error: "Provide an event field to update." }, { status: 400 });
  }

  // A category always drives the stored color so the calendar stays consistent.
  const categoryColor = isEventCategory(category) ? getCategoryColor(category) : undefined;

  try {
    const userId = await requireAuthenticatedUserId();
    const existing = await requireEventAccess(userId, id, "write");

    // Scope and classification are coupled: a family event must live in a
    // family, and a personal (work/private) event must not.
    if (visibility !== undefined) {
      if (visibility === "family" && existing.familyGroupId === null) {
        return NextResponse.json({ error: "A family event must be created in a family." }, { status: 400 });
      }
      if (visibility !== "family" && existing.familyGroupId !== null) {
        return NextResponse.json({ error: "Family events are shared with the family." }, { status: 400 });
      }
    }

    // Keep `endTime` after the effective start time, even when only the stored
    // event carries the start time (i.e. the request omits `time`).
    if (typeof endTime === "string") {
      const effectiveTime = typeof time === "string" ? time : existing.time;
      if (effectiveTime && endTime <= effectiveTime) {
        return NextResponse.json({ error: "endTime must be later than time." }, { status: 400 });
      }
    }

    const event = await prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(date !== undefined ? { date } : {}),
        ...(time !== undefined ? { time } : {}),
        ...(endTime !== undefined
          ? { endTime: typeof endTime === "string" && endTime ? endTime : null }
          : {}),
        ...(description !== undefined
          ? { description: typeof description === "string" && description.trim() ? description.trim() : null }
          : {}),
        ...(location !== undefined
          ? { location: typeof location === "string" && location.trim() ? location.trim() : null }
          : {}),
        ...(timezone !== undefined ? { timezone: typeof timezone === "string" && timezone ? timezone : null } : {}),
        ...(category !== undefined
          ? { category: isEventCategory(category) ? category : null }
          : {}),
        ...(visibility !== undefined ? { visibility } : {}),
        ...(categoryColor
          ? { color: categoryColor }
          : color !== undefined
          ? { color }
          : {}),
      },
    });
    return NextResponse.json(event);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Updating calendar event", "Unable to update event.");
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const userId = await requireAuthenticatedUserId();
    // Deleting a family event requires the owner or admin role.
    await requireEventAccess(userId, id, "delete");
    await prisma.calendarEvent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Deleting calendar event", "Unable to delete event.");
  }
}
