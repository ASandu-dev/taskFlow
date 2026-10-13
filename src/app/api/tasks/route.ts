import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, isDateString, readJsonBody } from "@/lib/api-response";
import {
  authErrorResponse,
  getFamilyIdsForUser,
  requireAuthenticatedUserId,
  requireProjectAccess,
  requireValidAssignee,
} from "@/lib/authorization";

// GET /api/tasks
//   ?date=YYYY-MM-DD          filter to a single day
//   ?status=todo|done         filter by status
//   ?assignee=me|<userId>     filter by assignee
//
// When `date` is supplied each task gains `completedOnDate`: for recurring
// tasks this reports whether a TaskCompletion exists for that day; for
// non-recurring tasks it reports whether the task is done on that day. Without
// `date` the field is omitted (it has no meaning without a day).
export async function GET(req: Request) {
  await connection();
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const status = searchParams.get("status");
  const assignee = searchParams.get("assignee");
  const taskStatus = status === "todo" || status === "done" ? status : undefined;

  if (status && !taskStatus) {
    return NextResponse.json({ error: "status must be todo or done." }, { status: 400 });
  }
  if (date && !isDateString(date)) {
    return NextResponse.json({ error: "date must be a valid date in YYYY-MM-DD format." }, { status: 400 });
  }
  if (assignee !== null && !assignee.trim()) {
    return NextResponse.json({ error: "assignee must be me or a user id." }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
    const familyIds = await getFamilyIdsForUser(userId);

    // Default visibility: the caller's personal projects plus every family
    // project they belong to. Legacy unscoped projects never match.
    let projectScope:
      | { OR: [{ ownerId: string }, { familyGroupId: { in: string[] } }] }
      | { familyGroupId: { in: string[] } } = {
      OR: [{ ownerId: userId }, { familyGroupId: { in: familyIds } }],
    };
    let assigneeFilter: string | undefined;

    if (assignee !== null) {
      if (assignee === "me") {
        assigneeFilter = userId;
      } else {
        // Viewing another person's tasks is limited to a family where the caller
        // is member+ and the target is also a member. A `child` therefore cannot
        // inspect anyone else's task list.
        const callerGroups = await prisma.familyGroupMember.findMany({
          where: { userId, role: { in: ["owner", "admin", "member"] } },
          select: { groupId: true },
        });
        const candidateGroupIds = callerGroups.map((membership) => membership.groupId);
        const shared = candidateGroupIds.length
          ? await prisma.familyGroupMember.findMany({
              where: { userId: assignee, groupId: { in: candidateGroupIds } },
              select: { groupId: true },
            })
          : [];
        const sharedGroupIds = shared.map((membership) => membership.groupId);
        if (sharedGroupIds.length === 0) {
          return NextResponse.json(
            { error: "You can only view another member's tasks in a shared family." },
            { status: 403 }
          );
        }
        projectScope = { familyGroupId: { in: sharedGroupIds } };
        assigneeFilter = assignee;
      }
    }

    const tasks = await prisma.task.findMany({
      where: {
        project: projectScope,
        ...(date ? { date } : {}),
        ...(taskStatus ? { status: taskStatus } : {}),
        ...(assigneeFilter ? { assigneeId: assigneeFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    if (!date) {
      return NextResponse.json(tasks);
    }

    // One query resolves completion for all recurring tasks on the requested
    // day, avoiding an N+1 lookup per task.
    const recurringIds = tasks.filter((task) => task.recurring).map((task) => task.id);
    const completions = recurringIds.length
      ? await prisma.taskCompletion.findMany({
          where: { date, taskId: { in: recurringIds } },
          select: { taskId: true },
        })
      : [];
    const completedIds = new Set(completions.map((completion) => completion.taskId));

    const withCompletion = tasks.map((task) => ({
      ...task,
      completedOnDate: task.recurring
        ? completedIds.has(task.id)
        : task.status === "done" && (task.date === null || task.date === date),
    }));
    return NextResponse.json(withCompletion);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Listing tasks", "Unable to load tasks.");
  }
}

// POST /api/tasks
export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;
  const { title, projectId, priority, status, time, date, assigneeId, recurring } = body;

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
  if (assigneeId !== undefined && assigneeId !== null && typeof assigneeId !== "string") {
    return NextResponse.json({ error: "assigneeId must be a string or null." }, { status: 400 });
  }
  if (recurring !== undefined && typeof recurring !== "boolean") {
    return NextResponse.json({ error: "recurring must be a boolean." }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
    // The task inherits its scope from the project; verify write access first.
    // For a family project this already requires the `member` role or higher.
    const project = await requireProjectAccess(userId, projectId.trim(), "write");
    const resolvedAssignee =
      typeof assigneeId === "string" && assigneeId.trim() ? assigneeId.trim() : null;
    await requireValidAssignee(project, resolvedAssignee);

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        projectId: projectId.trim(),
        priority: priority ?? "medium",
        status: status ?? "todo",
        time: typeof time === "string" && time ? time : null,
        date: typeof date === "string" && date ? date : null,
        assigneeId: resolvedAssignee,
        // `recurring` is only meaningful for family daily templates, but it is
        // accepted on personal tasks too (harmless; completion still works).
        recurring: recurring ?? false,
        createdById: userId,
      },
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Creating task", "Unable to create task.");
  }
}
