import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, isDateString, readJsonBody } from "@/lib/api-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { title, date, time, color } = parsed.body;

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
  if (title === undefined && date === undefined && time === undefined && color === undefined) {
    return NextResponse.json({ error: "Provide an event field to update." }, { status: 400 });
  }

  try {
    const event = await prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(date !== undefined ? { date } : {}),
        ...(time !== undefined ? { time } : {}),
        ...(color !== undefined ? { color } : {}),
      },
    });
    return NextResponse.json(event);
  } catch (error) {
    return apiError(error, "Updating calendar event", "Unable to update event.");
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    await prisma.calendarEvent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Deleting calendar event", "Unable to delete event.");
  }
}
