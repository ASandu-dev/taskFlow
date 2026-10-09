import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, isDateString, readJsonBody } from "@/lib/api-response";

export async function GET() {
  await connection();
  try {
    const events = await prisma.calendarEvent.findMany({ orderBy: [{ date: "asc" }, { time: "asc" }] });
    return NextResponse.json(events);
  } catch (error) {
    return apiError(error, "Listing calendar events", "Unable to load events.");
  }
}

export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { title, date, time, color } = parsed.body;
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
  try {
    const event = await prisma.calendarEvent.create({
      data: { title: title.trim(), date, time: time || "00:00", color: color ?? "#7c5cfc" },
    });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return apiError(error, "Creating calendar event", "Unable to create event.");
  }
}
