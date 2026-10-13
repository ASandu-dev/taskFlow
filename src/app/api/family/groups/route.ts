import { connection, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { apiError, readJsonBody } from "@/lib/api-response";
import { authErrorResponse, requireAuthenticatedUserId } from "@/lib/authorization";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generates a 6-character invite code with a CSPRNG. The code is retained for
 * display/back-compat only — joining now goes through hashed invitations, so
 * this value is never accepted as a join credential.
 */
async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const bytes = randomBytes(6);
    let code = "";
    for (let i = 0; i < 6; i += 1) {
      code += INVITE_ALPHABET[bytes[i]! % INVITE_ALPHABET.length];
    }
    const existing = await prisma.familyGroup.findUnique({
      where: { inviteCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  // Astronomically unlikely; fall back to a longer random code that still fits
  // the unique column.
  return `FAM${randomBytes(8).toString("hex").toUpperCase()}`;
}

/** Groups the signed-in user belongs to, with their role and member count. */
export async function GET() {
  await connection();
  try {
    const userId = await requireAuthenticatedUserId();
    const memberships = await prisma.familyGroupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: { joinedAt: "desc" },
    });
    const groups = memberships.map((membership) => ({
      id: membership.group.id,
      name: membership.group.name,
      description: membership.group.description,
      inviteCode: membership.group.inviteCode,
      adminId: membership.group.adminId,
      role: membership.role,
      isAdmin: membership.role === "owner" || membership.role === "admin",
      createdAt: membership.group.createdAt,
      memberCount: membership.group._count.members,
      joinedAt: membership.joinedAt,
    }));
    return NextResponse.json(groups);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Listing family groups", "Unable to load family groups.");
  }
}

/** Create a family group. The creator becomes its owner and first member. */
export async function POST(req: Request) {
  await connection();
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { name, description } = parsed.body;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Group name is required." }, { status: 400 });
  }
  if (name.trim().length > 60) {
    return NextResponse.json({ error: "Group name must be 60 characters or fewer." }, { status: 400 });
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return NextResponse.json({ error: "description must be a string." }, { status: 400 });
  }
  if (typeof description === "string" && description.length > 200) {
    return NextResponse.json({ error: "description must be 200 characters or fewer." }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
    const inviteCode = await generateUniqueInviteCode();
    // Nested create keeps group creation and the owner membership atomic.
    const group = await prisma.familyGroup.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        inviteCode,
        adminId: userId,
        members: { create: { userId, role: "owner" } },
      },
    });
    return NextResponse.json(
      {
        id: group.id,
        name: group.name,
        description: group.description,
        inviteCode: group.inviteCode,
        adminId: group.adminId,
        role: "owner",
        isAdmin: true,
        createdAt: group.createdAt,
        memberCount: 1,
      },
      { status: 201 }
    );
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Creating family group", "Unable to create the family group.");
  }
}
