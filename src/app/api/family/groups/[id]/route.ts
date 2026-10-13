import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, readJsonBody } from "@/lib/api-response";
import {
  authErrorResponse,
  requireAuthenticatedUserId,
  requireMembership,
  requireRoleAtLeast,
} from "@/lib/authorization";
import { clerkClient } from "@clerk/nextjs/server";
import type { Role } from "@/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Group detail (members + shared events) for signed-in members only. */
export async function GET(_req: Request, context: RouteContext) {
  await connection();
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Group id is required." }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
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

    // Membership is verified server-side; non-members get a 403 with no data.
    const membership = await requireMembership(userId, id);

    // Resolve member display names via Clerk when real keys are configured;
    // fall back to "You"/"Family member" labels otherwise (or on API errors).
    let members: Array<{
      userId: string;
      joinedAt: Date;
      role: Role;
      name: string;
      isYou: boolean;
    }>;
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
          role: member.role,
          name: clerkUser?.fullName || email || "Family member",
          isYou: member.userId === userId,
        };
      });
    } catch {
      members = group.members.map((member) => ({
        userId: member.userId,
        joinedAt: member.joinedAt,
        role: member.role,
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
      role: membership.role,
      isAdmin: membership.role === "owner" || membership.role === "admin",
      createdAt: group.createdAt,
      members,
      events: group.events,
    });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Loading family group", "Unable to load the family group.");
  }
}

/**
 * Rename or re-describe a family group. Owner/admin only. Name stays a required
 * non-empty value when supplied; description may be cleared with an explicit
 * null (or an empty string, which is normalized to null).
 */
export async function PATCH(req: Request, context: RouteContext) {
  await connection();
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Group id is required." }, { status: 400 });
  }

  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { name, description } = parsed.body;

  if (name === undefined && description === undefined) {
    return NextResponse.json({ error: "Provide a name or description to update." }, { status: 400 });
  }
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name must not be empty." }, { status: 400 });
    }
    if (name.trim().length > 60) {
      return NextResponse.json({ error: "name must be 60 characters or fewer." }, { status: 400 });
    }
  }
  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      return NextResponse.json({ error: "description must be a string or null." }, { status: 400 });
    }
    if (description.length > 200) {
      return NextResponse.json({ error: "description must be 200 characters or fewer." }, { status: 400 });
    }
  }

  try {
    const userId = await requireAuthenticatedUserId();
    await requireRoleAtLeast(userId, id, "admin");

    const group = await prisma.familyGroup.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined
          ? { description: typeof description === "string" ? description.trim() || null : null }
          : {}),
      },
      select: { id: true, name: true, description: true },
    });

    return NextResponse.json(group);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Updating family group", "Unable to update the family group.");
  }
}
