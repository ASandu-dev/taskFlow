import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import type { Role } from "@/types";

/**
 * Centralized tenant authorization.
 *
 * Scope model:
 * - Personal resource: `ownerId` set, `familyGroupId` null. Only the matching
 *   Clerk user id may read or write it.
 * - Family resource: `familyGroupId` set. Any active member may read; creating,
 *   updating, or deleting requires at least the `member` role, and deleting
 *   requires the `owner` or `admin` role. A `child` is read-only except for
 *   completing their own assigned tasks.
 * - Legacy rows with both columns null are intentionally invisible to everyone.
 *
 * Every route must resolve identity server-side and pass it to these helpers.
 * Client-supplied `ownerId`/`familyGroupId`/`role` is never trusted.
 */

export type AccessMode = "read" | "write" | "delete";

/**
 * Ordinal ranking of family roles; a higher number grants strictly more
 * privileges. `owner > admin > member > child`.
 */
export const ROLE_RANK: Record<Role, number> = {
  child: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

/** Thrown by the access helpers; converted to a JSON response at the route edge. */
export class AuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Converts a thrown {@link AuthError} into a JSON `{ error }` response. Returns
 * null for any other error so callers can fall back to `apiError`, which keeps
 * internal details out of the response body.
 */
export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

/** Resolves the signed-in user id or throws a 401 AuthError. */
export async function requireAuthenticatedUserId(): Promise<string> {
  const userId = await requireUserId();
  if (!userId) throw new AuthError(401, "Authentication required.");
  return userId;
}

/** Family group ids the user is an active member of. */
export async function getFamilyIdsForUser(userId: string): Promise<string[]> {
  const memberships = await prisma.familyGroupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  return memberships.map((membership) => membership.groupId);
}

/**
 * Loads the user's membership in a family group or throws 403. When
 * `allowedRoles` is provided the membership role must be one of them.
 */
export async function requireMembership(
  userId: string,
  familyGroupId: string,
  allowedRoles?: readonly Role[]
) {
  const membership = await prisma.familyGroupMember.findUnique({
    where: { groupId_userId: { groupId: familyGroupId, userId } },
  });
  if (!membership) {
    throw new AuthError(403, "You do not have access to this family group.");
  }
  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new AuthError(403, "You do not have permission to perform this action.");
  }
  return membership;
}

/**
 * Loads the caller's membership and requires at least `minRole` in the
 * hierarchy. Returns the membership so callers can inspect the exact role.
 *
 * Child policy: a `child` may read family data and complete the tasks assigned
 * to them, but every create/edit/delete path for a family-scoped resource must
 * require at least `member`. Enforce those paths with this helper (or with
 * `requireMembership(..., ["owner", "admin"])` where only owners/admins may
 * act).
 */
export async function requireRoleAtLeast(
  userId: string,
  familyGroupId: string,
  minRole: Role
) {
  const membership = await requireMembership(userId, familyGroupId);
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new AuthError(403, "You do not have permission to perform this action.");
  }
  return membership;
}

interface ScopedResource {
  readonly ownerId: string | null;
  readonly familyGroupId: string | null;
}

/**
 * Applies the tenant scope rules to an already-loaded resource. Legacy
 * unscoped rows are reported as 404 so their existence is never revealed.
 */
async function assertResourceAccess(
  userId: string,
  resource: ScopedResource,
  mode: AccessMode
): Promise<void> {
  if (!resource.ownerId && !resource.familyGroupId) {
    throw new AuthError(404, "The requested record was not found.");
  }

  if (resource.familyGroupId) {
    const membership = await requireMembership(userId, resource.familyGroupId);
    if (mode === "read") return;
    // Children are read-only for family-scoped resources: creating, editing, or
    // deleting any of them requires at least the `member` role. The only family
    // write a child may perform is completing an assigned task, which is
    // handled by a dedicated helper rather than this generic scope check.
    if (ROLE_RANK[membership.role] < ROLE_RANK.member) {
      throw new AuthError(403, "A child profile cannot modify family resources.");
    }
    if (mode === "delete" && membership.role !== "owner" && membership.role !== "admin") {
      throw new AuthError(403, "Only a family owner or admin can delete this.");
    }
    return;
  }

  if (resource.ownerId !== userId) {
    throw new AuthError(403, "You do not have access to this resource.");
  }
}

/** Loads a project and enforces read/write/delete access. */
export async function requireProjectAccess(userId: string, projectId: string, mode: AccessMode) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AuthError(404, "The requested record was not found.");
  await assertResourceAccess(userId, project, mode);
  return project;
}

/** Loads a goal and enforces read/write/delete access. */
export async function requireGoalAccess(userId: string, goalId: string, mode: AccessMode) {
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) throw new AuthError(404, "The requested record was not found.");
  await assertResourceAccess(userId, goal, mode);
  return goal;
}

/** Loads a calendar event and enforces read/write/delete access. */
export async function requireEventAccess(userId: string, eventId: string, mode: AccessMode) {
  const event = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new AuthError(404, "The requested record was not found.");
  await assertResourceAccess(userId, event, mode);
  return event;
}

/**
 * Loads a task and delegates to its project: a task has no scope of its own,
 * so access is entirely derived from the project it belongs to.
 */
export async function requireTaskAccess(userId: string, taskId: string, mode: AccessMode) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new AuthError(404, "The requested record was not found.");
  const project = await requireProjectAccess(userId, task.projectId, mode);
  return { task, project };
}

/**
 * Authorizes completing (or uncompleting) a task.
 *
 * Completing a task is the one family write a `child` is allowed, and only for
 * tasks assigned to them. Everyone else with read access may complete a task
 * they can see: family `member+` may complete any family task, and a personal
 * task may only be completed by its owner (read access already guarantees
 * that). The assignee is never trusted from the client — it is read from the
 * stored task.
 */
export async function requireTaskCompletionAccess(userId: string, taskId: string) {
  const { task, project } = await requireTaskAccess(userId, taskId, "read");
  if (!project.familyGroupId) return { task, project };

  const membership = await requireMembership(userId, project.familyGroupId);
  if (ROLE_RANK[membership.role] < ROLE_RANK.member && task.assigneeId !== userId) {
    throw new AuthError(403, "A child may only complete tasks assigned to them.");
  }
  return { task, project };
}

/**
 * Validates a task assignee against the task's project scope. `null` clears the
 * assignment and is always allowed. For a family project the assignee must be a
 * current member; for a personal project a task may only be assigned to its
 * owner. Throws a 400 so the caller can correct the request.
 */
export async function requireValidAssignee(
  project: { readonly ownerId: string | null; readonly familyGroupId: string | null },
  assigneeId: string | null
): Promise<void> {
  if (!assigneeId) return;

  if (project.familyGroupId) {
    const member = await prisma.familyGroupMember.findUnique({
      where: { groupId_userId: { groupId: project.familyGroupId, userId: assigneeId } },
      select: { id: true },
    });
    if (!member) {
      throw new AuthError(400, "assigneeId must be a member of the family group.");
    }
    return;
  }

  if (project.ownerId !== assigneeId) {
    throw new AuthError(400, "A personal task can only be assigned to its owner.");
  }
}

export interface CreateScope {
  readonly ownerId: string | null;
  readonly familyGroupId: string | null;
}

/**
 * Resolves the tenant scope for a newly created resource. Omitting
 * `familyGroupId` creates a personal resource owned by the caller; supplying it
 * requires verified membership. Any client-supplied `ownerId` is ignored.
 */
export async function resolveCreateScope(
  userId: string,
  familyGroupId: unknown
): Promise<CreateScope> {
  if (familyGroupId === undefined || familyGroupId === null || familyGroupId === "") {
    return { ownerId: userId, familyGroupId: null };
  }
  if (typeof familyGroupId !== "string") {
    throw new AuthError(400, "familyGroupId must be a string.");
  }
  // Creating a family resource requires at least `member`; a `child` is
  // read-only. `requireRoleAtLeast` also verifies membership, so an outsider
  // still gets a 403.
  await requireRoleAtLeast(userId, familyGroupId, "member");
  return { ownerId: null, familyGroupId };
}

// ---------------------------------------------------------------------------
// Family invitations
//
// Only a SHA-256 hash of the token is stored. The raw token is returned exactly
// once at creation. Redemption is single-use: the invitation is claimed with a
// conditional update (`usedAt IS NULL`) inside a transaction, so concurrent
// redemptions cannot both succeed.
// ---------------------------------------------------------------------------

/** Generates a 256-bit URL-safe invitation token using a CSPRNG. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hashes an invitation token for storage/lookup. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface RedeemedInvitation {
  readonly groupId: string;
  readonly role: Role;
}

/**
 * Redeems a raw invitation token for the given user. Validates existence,
 * revocation, expiry, single-use, and (when the invitation is email-bound) that
 * the caller's resolved email matches. The membership is created and the
 * invitation marked used in one transaction with an atomic claim.
 *
 * `userEmail` is resolved by the caller (so this helper stays free of Clerk
 * dependencies); a null value means the email could not be determined — keyless
 * development or an account without a primary address — and the email binding
 * is then skipped rather than failing a legitimate redemption.
 */
export async function redeemFamilyInvitation(
  userId: string,
  rawToken: string,
  userEmail: string | null
): Promise<RedeemedInvitation> {
  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await prisma.familyInvitation.findUnique({ where: { tokenHash } });

  if (!invitation) throw new AuthError(404, "This invitation is not valid.");
  if (invitation.usedAt) throw new AuthError(410, "This invitation has already been used.");
  if (invitation.revokedAt) throw new AuthError(410, "This invitation has been revoked.");
  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw new AuthError(410, "This invitation has expired.");
  }
  if (
    invitation.email &&
    userEmail !== null &&
    invitation.email.toLowerCase() !== userEmail.toLowerCase()
  ) {
    throw new AuthError(403, "This invitation was issued to a different email address.");
  }

  const redeemed = await prisma.$transaction(async (tx) => {
    // Atomic single-use claim: only one concurrent redemption can match an
    // unused, unrevoked row, so the loser sees count === 0 and creates no
    // membership.
    const claimed = await tx.familyInvitation.updateMany({
      where: { id: invitation.id, usedAt: null, revokedAt: null },
      data: { usedAt: new Date(), usedById: userId },
    });
    if (claimed.count !== 1) return null;

    await tx.familyGroupMember.upsert({
      where: { groupId_userId: { groupId: invitation.familyGroupId, userId } },
      update: {},
      create: { groupId: invitation.familyGroupId, userId, role: invitation.role },
    });

    return { groupId: invitation.familyGroupId, role: invitation.role };
  });

  if (!redeemed) throw new AuthError(410, "This invitation has already been used.");
  return redeemed;
}
