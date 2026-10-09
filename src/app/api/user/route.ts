import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-response";

export async function GET() {
  await connection();
  try {
    const user = await prisma.user.findFirst();
    return NextResponse.json(user);
  } catch (error) {
    return apiError(error, "Loading user profile", "Unable to load the user profile.");
  }
}
