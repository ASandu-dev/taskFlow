import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, isDateString, readJsonBody } from "@/lib/api-response";

// GET /api/tasks — optional ?date=YYYY-MM-DD and ?status=todo|done
export async function GET(req: Request) {
  await connection();
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const status = searchParams.get("status");
  const taskStatus = status === "todo" || status === "done" ? status : undefined;

  if (status && !taskStatus) {
    return NextResponse.json({ error: "status must be todo or done." }, { status: 400 });
  }
  if (date && !isDateString(date)) {
    return NextResponse.json({ error: "date must be a valid date in YYYY-MM-DD format." }, { status: 400 });
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        ...(date ? { date } : {}),
        ...(taskStatus ? { status: taskStatus } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(tasks);
  } catch (error) {
    return apiError(error, "Listing tasks", "Unable to load tasks.");
  }
}

// POST /api/tasks
export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;
  const { title, projectId, priority, status, time, date } = body;

  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }
  if (typeof projectId !== "string" || !projectId.trim()) {
    return NextResponse.json({ error: "projectId is required." }, { status: 400 });
  }
  if (priority !== undefined && priority !== "low" && priority !== "medium" && priority !== "high") {
    return NextResponse.json({ error: "priority must be low, medium, or high." }, { status: 400 });
  }
  if (status !== undefined && status !== "todo" && status !== "done") {
    return NextResponse.json({ error: "status must be todo or done." }, { status: 400 });
  }
  if (time !== undefined && time !== null && typeof time !== "string") {
    return NextResponse.json({ error: "time must be a string." }, { status: 400 });
  }
  if (date !== undefined && date !== null && !isDateString(date)) {
    return NextResponse.json({ error: "date must be a valid date in YYYY-MM-DD format." }, { status: 400 });
  }
  if (typeof time === "string" && time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return NextResponse.json({ error: "time must use HH:MM format." }, { status: 400 });
  }

  try {
    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        projectId: projectId.trim(),
        priority: priority ?? "medium",
        status: status ?? "todo",
        time: typeof time === "string" && time ? time : null,
        date: typeof date === "string" && date ? date : null,
      },
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return apiError(error, "Creating task", "Unable to create task.");
  }
}
