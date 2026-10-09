import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, readJsonBody } from "@/lib/api-response";
import { requireUserId } from "@/lib/auth";

export async function POST(req: Request) {
  await connection();
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { code } = parsed.body;
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "Invite code is required." }, { status: 400 });
  }

  try {
    const normalize = code.trim().toUpperCase();
    const group = await prisma.familyGroup.findUnique({ where: { inviteCode: normalize } });
    if (!group) {
      return NextResponse.json({ error: "No family group found for that invite code." }, { status: 404 });
    }

    await prisma.familyGroupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId } },
      update: {},
      create: { groupId: group.id, userId },
    });

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      inviteCode: group.inviteCode,
      adminId: group.adminId,
      isAdmin: group.adminId === userId,
      joined: true,
      createdAt: group.createdAt,
    });
  } catch (error) {
    return apiError(error, "Joining family group", "Unable to join the family group.");
  }
}