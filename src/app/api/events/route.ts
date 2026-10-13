import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, isDateString, readJsonBody } from "@/lib/api-response";
import { getCategoryColor, isEventCategory } from "@/lib/categories";
import { isEventVisibility, validateEventOptionalFields } from "@/lib/event-validation";
import { otherWorkEventOwnerIds, sanitizeEventForViewer } from "@/lib/event-visibility";
import { getOrCreateUserSettings } from "@/lib/user-settings";
import {
  authErrorResponse,
  getFamilyIdsForUser,
  requireAuthenticatedUserId,
  resolveCreateScope,
} from "@/lib/authorization";
import type { EventVisibility, WorkBlock } from "@/types";

type CalendarEventRow = Awaited<ReturnType<typeof prisma.calendarEvent.findMany>>[number];

export async function GET() {
  await connection();
  try {
    const userId = await requireAuthenticatedUserId();
    const familyIds = await getFamilyIdsForUser(userId);
    // Personal events plus the shared events of families the user belongs to.
    // Legacy unscoped rows (both columns null) never match and stay hidden.
    const events = await prisma.calendarEvent.findMany({
      where: { OR: [{ ownerId: userId }, { familyGroupId: { in: familyIds } }] },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });

    // Owners of other members' work events need a single batched lookup of the
    // per-user sharing flag. A missing settings row means sharing is on (the
    // schema default), so absence is resolved to true by the sanitizer.
    const workOwnerIds = otherWorkEventOwnerIds(events, userId);
    const shareByOwner = new Map<string, boolean>();
    if (workOwnerIds.length > 0) {
      const settings = await prisma.userSettings.findMany({
        where: { userId: { in: workOwnerIds } },
        select: { userId: true, shareWorkAvailability: true },
      });
      for (const setting of settings) {
        shareByOwner.set(setting.userId, setting.shareWorkAvailability);
      }
    }

    const sanitized = events.flatMap((event): Array<CalendarEventRow | WorkBlock> => {
      const visible = sanitizeEventForViewer(event, userId, shareByOwner);
      return visible === null ? [] : [visible];
    });

    return NextResponse.json(sanitized);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Listing calendar events", "Unable to load events.");
  }
}

export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const {
    title,
    date,
    time,
    color,
    category,
    familyGroupId,
    endTime,
    description,
    location,
    timezone,
    visibility,
  } = parsed.body;
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }
  if (!isDateString(date)) {
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
  const resolvedCategory = isEventCategory(category) ? category : null;
  const resolvedColor = resolvedCategory
    ? getCategoryColor(resolvedCategory) ?? "#7c5cfc"
    : typeof color === "string"
    ? color
    : "#7c5cfc";
  try {
    const userId = await requireAuthenticatedUserId();
    // Scope resolution also enforces the child policy: creating a family event
    // requires the `member` role or higher.
    const scope = await resolveCreateScope(userId, familyGroupId);

    // An explicit visibility wins; otherwise fall back to the user's saved
    // default classification (creating the settings row on first use).
    const classification: EventVisibility =
      visibility !== undefined ? visibility : (await getOrCreateUserSettings(userId)).defaultEventClassification;

    if (scope.familyGroupId === null && classification === "family") {
      return NextResponse.json(
        { error: "A family event must be created in a family." },
        { status: 400 }
      );
    }
    if (scope.familyGroupId !== null && classification !== "family") {
      return NextResponse.json(
        { error: "A work or private event cannot be shared with a family." },
        { status: 400 }
      );
    }

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
        visibility: classification,
        source: "local",
        createdById: userId,
        ...scope,
      },
    });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Creating calendar event", "Unable to create event.");
  }
}
