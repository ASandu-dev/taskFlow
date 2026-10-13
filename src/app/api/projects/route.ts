import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, readJsonBody } from "@/lib/api-response";
import {
  authErrorResponse,
  getFamilyIdsForUser,
  requireAuthenticatedUserId,
  resolveCreateScope,
} from "@/lib/authorization";

export async function GET() {
  await connection();
  try {
    const userId = await requireAuthenticatedUserId();
    const familyIds = await getFamilyIdsForUser(userId);
    const projects = await prisma.project.findMany({
      where: { OR: [{ ownerId: userId }, { familyGroupId: { in: familyIds } }] },
      orderBy: { id: "asc" },
    });
    return NextResponse.json(projects);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Listing projects", "Unable to load projects.");
  }
}

export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { name, color, familyGroupId } = parsed.body;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }
  if (color !== undefined && typeof color !== "string") {
    return NextResponse.json({ error: "color must be a string." }, { status: 400 });
  }
  try {
    const userId = await requireAuthenticatedUserId();
    // Scope comes from verified membership; a client-supplied ownerId is ignored.
    const scope = await resolveCreateScope(userId, familyGroupId);
    const project = await prisma.project.create({
      data: { name: name.trim(), color: color ?? "#7c5cfc", ...scope },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Creating project", "Unable to create project.");
  }
}
