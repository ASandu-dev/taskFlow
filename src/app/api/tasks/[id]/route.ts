import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, isDateString, readJsonBody } from "@/lib/api-response";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;

  const { title, projectId, priority, status, time, date } = body;
  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    return NextResponse.json({ error: "title must not be empty." }, { status: 400 });
  }
  if (projectId !== undefined && (typeof projectId !== "string" || !projectId.trim())) {
    return NextResponse.json({ error: "projectId must be a non-empty string." }, { status: 400 });
  }
  if (priority !== undefined && priority !== "low" && priority !== "medium" && priority !== "high") {
    return NextResponse.json({ error: "priority must be low, medium, or high." }, { status: 400 });
  }
  if (status !== undefined && status !== "todo" && status !== "done") {
    return NextResponse.json({ error: "status must be todo or done." }, { status: 400 });
  }
  if (time !== undefined && time !== null && typeof time !== "string") {
    return NextResponse.json({ error: "time must be a string or null." }, { status: 400 });
  }
  if (date !== undefined && date !== null && !isDateString(date)) {
    return NextResponse.json({ error: "date must be a valid date in YYYY-MM-DD format or null." }, { status: 400 });
  }
  if (typeof time === "string" && time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return NextResponse.json({ error: "time must use HH:MM format." }, { status: 400 });
  }

  try {
    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(projectId !== undefined ? { projectId: projectId.trim() } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(time !== undefined ? { time: time || null } : {}),
        ...(date !== undefined ? { date: date || null } : {}),
      },
    });
    return NextResponse.json(task);
  } catch (error) {
    return apiError(error, "Updating task", "Unable to update task.");
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Deleting task", "Unable to delete task.");
  }
}
