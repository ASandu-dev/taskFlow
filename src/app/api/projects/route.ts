import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, readJsonBody } from "@/lib/api-response";

export async function GET() {
  await connection();
  try {
    const projects = await prisma.project.findMany({ orderBy: { id: "asc" } });
    return NextResponse.json(projects);
  } catch (error) {
    return apiError(error, "Listing projects", "Unable to load projects.");
  }
}

export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { name, color } = parsed.body;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }
  if (color !== undefined && typeof color !== "string") {
    return NextResponse.json({ error: "color must be a string." }, { status: 400 });
  }
  try {
    const project = await prisma.project.create({
      data: { name: name.trim(), color: color ?? "#7c5cfc" },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return apiError(error, "Creating project", "Unable to create project.");
  }
}
