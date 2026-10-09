import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, isDateString, readJsonBody } from "@/lib/api-response";
import { getCategoryColor, isEventCategory } from "@/lib/categories";
import { requireUserId } from "@/lib/auth";

export async function GET() {
  await connection();
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    // Personal events plus the shared events of family groups the user belongs to.
    const memberships = await prisma.familyGroupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    const groupIds = memberships.map((membership) => membership.groupId);
    const events = await prisma.calendarEvent.findMany({
      where: {
        OR: [{ familyGroupId: null }, { familyGroupId: { in: groupIds } }],
      },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });
    return NextResponse.json(events);
  } catch (error) {
    return apiError(error, "Listing calendar events", "Unable to load events.");
  }
}

export async function POST(req: Request) {
  await connection();
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { title, date, time, color, category } = parsed.body;
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
  const resolvedCategory = isEventCategory(category) ? category : null;
  const resolvedColor = resolvedCategory
    ? getCategoryColor(resolvedCategory) ?? "#7c5cfc"
    : typeof color === "string"
    ? color
    : "#7c5cfc";
  try {
    const event = await prisma.calendarEvent.create({
      data: {
        title: title.trim(),
        date,
        time: time || "00:00",
        color: resolvedColor,
        category: resolvedCategory,
        source: "local",
      },
    });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return apiError(error, "Creating calendar event", "Unable to create event.");
  }
}
