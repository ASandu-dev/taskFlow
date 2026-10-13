import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, readJsonBody } from "@/lib/api-response";
import { authErrorResponse, requireAuthenticatedUserId, requireProjectAccess } from "@/lib/authorization";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;

  const { name, color } = parsed.body;
  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return NextResponse.json({ error: "name must not be empty." }, { status: 400 });
  }
  if (color !== undefined && typeof color !== "string") {
    return NextResponse.json({ error: "color must be a string." }, { status: 400 });
  }
  if (name === undefined && color === undefined) {
    return NextResponse.json({ error: "Provide a project name or color to update." }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
    await requireProjectAccess(userId, id, "write");
    // Scope columns are immutable here: a project cannot be moved between
    // tenants through an update.
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(color !== undefined ? { color } : {}),
      },
    });
    return NextResponse.json(project);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Updating project", "Unable to update project.");
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const userId = await requireAuthenticatedUserId();
    // Deleting a family project requires the owner or admin role.
    await requireProjectAccess(userId, id, "delete");
    const taskCount = await prisma.task.count({ where: { projectId: id } });
    if (taskCount > 0) {
      return NextResponse.json(
        { error: "Move or delete this project's tasks before deleting the project." },
        { status: 409 }
      );
    }
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Deleting project", "Unable to delete project.");
  }
}
