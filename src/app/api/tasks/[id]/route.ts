import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, isDateString, readJsonBody } from "@/lib/api-response";
import {
  authErrorResponse,
  requireAuthenticatedUserId,
  requireProjectAccess,
  requireTaskAccess,
  requireValidAssignee,
} from "@/lib/authorization";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;

  const { title, projectId, priority, status, time, date, assigneeId, recurring } = body;
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
  if (assigneeId !== undefined && assigneeId !== null && typeof assigneeId !== "string") {
    return NextResponse.json({ error: "assigneeId must be a string or null." }, { status: 400 });
  }
  if (recurring !== undefined && typeof recurring !== "boolean") {
    return NextResponse.json({ error: "recurring must be a boolean." }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
    const { task: existing, project: currentProject } = await requireTaskAccess(userId, id, "write");
    // Moving a task to another project requires write access to that project.
    const targetProject =
      projectId !== undefined
        ? await requireProjectAccess(userId, projectId.trim(), "write")
        : currentProject;

    // Re-validate the resulting assignee whenever the assignment or the owning
    // project changes, so a task can never end up pointing at a non-member of
    // its (possibly new) family.
    if (assigneeId !== undefined || projectId !== undefined) {
      const resolvedAssignee =
        assigneeId === undefined
          ? existing.assigneeId
          : typeof assigneeId === "string" && assigneeId.trim()
          ? assigneeId.trim()
          : null;
      await requireValidAssignee(targetProject, resolvedAssignee);
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(projectId !== undefined ? { projectId: projectId.trim() } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(time !== undefined ? { time: time || null } : {}),
        ...(date !== undefined ? { date: date || null } : {}),
        ...(assigneeId !== undefined
          ? { assigneeId: typeof assigneeId === "string" && assigneeId.trim() ? assigneeId.trim() : null }
          : {}),
        ...(recurring !== undefined ? { recurring } : {}),
      },
    });
    return NextResponse.json(task);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Updating task", "Unable to update task.");
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const userId = await requireAuthenticatedUserId();
    // Tasks are not a family-level resource, so any member with write access to
    // the owning project may delete one (delete restrictions apply to the
    // project/goal/event themselves). With the child policy this means a
    // `child` cannot delete a family task.
    await requireTaskAccess(userId, id, "write");
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Deleting task", "Unable to delete task.");
  }
}
