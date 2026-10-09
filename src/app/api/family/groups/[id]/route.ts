import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-response";
import { requireUserId } from "@/lib/auth";
import { clerkClient } from "@clerk/nextjs/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Group detail (members + shared events) for signed-in members only. */
export async function GET(_req: Request, context: RouteContext) {
  await connection();
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Group id is required." }, { status: 400 });
  }

  try {
    const group = await prisma.familyGroup.findUnique({
      where: { id },
      include: {
        members: { orderBy: { joinedAt: "asc" } },
        events: { orderBy: [{ date: "asc" }, { time: "asc" }] },
      },
    });
    if (!group) {
      return NextResponse.json({ error: "Family group not found." }, { status: 404 });
    }

    const isMember = group.members.some((member) => member.userId === userId);
    if (!isMember) {
      return NextResponse.json({ error: "You are not a member of this family group." }, { status: 403 });
    }

    // Resolve member display names via Clerk when real keys are configured;
    // fall back to "You"/"Family member" labels otherwise (or on API errors).
    let members: Array<{ userId: string; joinedAt: Date; name: string; isYou: boolean }>;
    try {
      const client = await clerkClient();
      const memberIds = group.members.map((member) => member.userId);
      const { data: clerkUsers } = await client.users.getUserList({ userId: memberIds, limit: 100 });
      const byId = new Map(clerkUsers.map((clerkUser) => [clerkUser.id, clerkUser]));
      members = group.members.map((member) => {
        const clerkUser = byId.get(member.userId);
        const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
        return {
          userId: member.userId,
          joinedAt: member.joinedAt,
          name: clerkUser?.fullName || email || "Family member",
          isYou: member.userId === userId,
        };
      });
    } catch {
      members = group.members.map((member) => ({
        userId: member.userId,
        joinedAt: member.joinedAt,
        name: member.userId === userId ? "You" : "Family member",
        isYou: member.userId === userId,
      }));
    }

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      inviteCode: group.inviteCode,
      adminId: group.adminId,
      isAdmin: group.adminId === userId,
      createdAt: group.createdAt,
      members,
      events: group.events,
    });
  } catch (error) {
    return apiError(error, "Loading family group", "Unable to load the family group.");
  }
}