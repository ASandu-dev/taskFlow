import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await connection();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      service: "taskflow",
      database: "ok",
      uptime: Math.floor(process.uptime()),
    });
  } catch (error) {
    console.error("Health check database probe failed", error);
    return NextResponse.json({ status: "unavailable", database: "unavailable" }, { status: 503 });
  }
}
