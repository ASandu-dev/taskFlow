import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, readJsonBody } from "@/lib/api-response";
import {
  authErrorResponse,
  getFamilyIdsForUser,
  requireAuthenticatedUserId,
  requireGoalAccess,
  resolveCreateScope,
} from "@/lib/authorization";

export async function GET() {
  await connection();
  try {
    const userId = await requireAuthenticatedUserId();
    const familyIds = await getFamilyIdsForUser(userId);
    const goals = await prisma.goal.findMany({
      where: { OR: [{ ownerId: userId }, { familyGroupId: { in: familyIds } }] },
      orderBy: { id: "asc" },
    });
    return NextResponse.json(goals);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Listing goals", "Unable to load goals.");
  }
}

export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { title, target, color, familyGroupId } = parsed.body;
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }
  if (typeof target !== "number" || !Number.isSafeInteger(target) || target < 1) {
    return NextResponse.json({ error: "target must be a positive whole number." }, { status: 400 });
  }
  if (color !== undefined && typeof color !== "string") {
    return NextResponse.json({ error: "color must be a string." }, { status: 400 });
  }
  try {
    const userId = await requireAuthenticatedUserId();
    const scope = await resolveCreateScope(userId, familyGroupId);
    const goal = await prisma.goal.create({
      data: { title: title.trim(), target, progress: 0, color: color ?? "#7c5cfc", ...scope },
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Creating goal", "Unable to create goal.");
  }
}

export async function PATCH(req: Request) {
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { id, progress } = parsed.body;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  if (typeof progress !== "number" || !Number.isSafeInteger(progress) || progress < 0) {
    return NextResponse.json({ error: "progress must be a non-negative whole number." }, { status: 400 });
  }
  try {
    const userId = await requireAuthenticatedUserId();
    const existingGoal = await requireGoalAccess(userId, id, "write");
    if (progress > existingGoal.target) {
      return NextResponse.json({ error: "progress cannot exceed the goal target." }, { status: 400 });
    }
    const goal = await prisma.goal.update({ where: { id }, data: { progress } });
    return NextResponse.json(goal);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Updating goal", "Unable to update goal.");
  }
}
