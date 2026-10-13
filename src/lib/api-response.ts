import { NextResponse } from "next/server";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJsonBody(
  request: Request
): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return { response: NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }) };
  }

  if (!isRecord(value)) {
    return { response: NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 }) };
  }

  return { body: value };
}

export function apiError(error: unknown, operation: string, message: string): NextResponse {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : undefined;

  if (code === "P2025") {
    return NextResponse.json({ error: "The requested record was not found." }, { status: 404 });
  }
  if (code === "P2003") {
    return NextResponse.json({ error: "A referenced record does not exist." }, { status: 400 });
  }

  // Log only safe metadata: Prisma error objects can echo field values and
  // messages may embed user input. Never log request bodies or tokens.
  const name = error instanceof Error ? error.name : "UnknownError";
  console.error(`${operation} failed: ${name}${code ? ` code=${code}` : ""}`);
  return NextResponse.json({ error: message }, { status: 500 });
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
