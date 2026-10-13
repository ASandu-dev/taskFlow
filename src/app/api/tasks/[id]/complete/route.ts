import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, isDateString, isRecord } from "@/lib/api-response";
import {
  authErrorResponse,
  requireAuthenticatedUserId,
  requireTaskCompletionAccess,
} from "@/lib/authorization";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Today's date as YYYY-MM-DD (UTC), used when the body omits `date`. */
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reads the optional `{ date }` body. A missing or empty body defaults to
 * today, which lets a DELETE with no payload still work.
 */
async function readCompletionDate(
  request: Request
): Promise<{ date: string } | { response: NextResponse }> {
  let body: Record<string, unknown> = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isRecord(parsed)) {
        return {
          response: NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 }),
        };
      }
      body = parsed;
    } catch {
      return {
        response: NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }),
      };
    }
  }

  const { date } = body;
  if (date !== undefined && date !== null && !isDateString(date)) {
    return {
      response: NextResponse.json(
        { error: "date must be a valid date in YYYY-MM-DD format." },
        { status: 400 }
      ),
    };
  }
  return { date: typeof date === "string" && date ? date : todayDateString() };
}

/**
 * Complete a task on a given day (default today).
 *
 * - Recurring (daily template) task: idempotently upsert the TaskCompletion for
 *   (taskId, date). The unique `(taskId, date)` constraint makes concurrent
 *   requests collapse into a single row instead of duplicating or failing.
 * - Non-recurring task: set `status` to `done` (naturally idempotent).
 *
 * Authorization is read access to the task plus: family `child` may complete
 * only tasks assigned to them; family `member+` may complete any; a personal
 * task only its owner.
 */
export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = await readCompletionDate(req);
  if ("response" in parsed) return parsed.response;
  const { date } = parsed;

  try {
    const userId = await requireAuthenticatedUserId();
    const { task } = await requireTaskCompletionAccess(userId, id);

    if (task.recurring) {
      await prisma.taskCompletion.upsert({
        where: { taskId_date: { taskId: id, date } },
        // Re-completing on the same day updates who/when rather than erroring.
        update: { completedById: userId, completedAt: new Date() },
        create: { taskId: id, date, completedById: userId },
      });
      return NextResponse.json({ ...task, completedOnDate: true });
    }

    const updated = await prisma.task.update({ where: { id }, data: { status: "done" } });
    return NextResponse.json({ ...updated, completedOnDate: true });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Completing task", "Unable to complete the task.");
  }
}

/**
 * Uncomplete a task on a given day (default today).
 *
 * - Recurring task: delete the TaskCompletion row; 404 when there was none.
 * - Non-recurring task: set `status` back to `todo` (idempotent).
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = await readCompletionDate(req);
  if ("response" in parsed) return parsed.response;
  const { date } = parsed;

  try {
    const userId = await requireAuthenticatedUserId();
    const { task } = await requireTaskCompletionAccess(userId, id);

    if (task.recurring) {
      // deleteMany is safe under concurrency: a second request simply deletes
      // zero rows and reports the completion was not present.
      const result = await prisma.taskCompletion.deleteMany({ where: { taskId: id, date } });
      if (result.count === 0) {
        return NextResponse.json(
          { error: "No completion recorded for that date." },
          { status: 404 }
        );
      }
      return NextResponse.json({ ...task, completedOnDate: false });
    }

    const updated = await prisma.task.update({ where: { id }, data: { status: "todo" } });
    return NextResponse.json({ ...updated, completedOnDate: false });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Uncompleting task", "Unable to update the task.");
  }
}
