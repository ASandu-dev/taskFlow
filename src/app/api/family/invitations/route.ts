import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, readJsonBody } from "@/lib/api-response";
import {
  authErrorResponse,
  generateInvitationToken,
  hashInvitationToken,
  requireAuthenticatedUserId,
  requireMembership,
  requireRoleAtLeast,
} from "@/lib/authorization";
import { findClerkUserIdsByEmail } from "@/lib/clerk-profile";
import {
  DEFAULT_INVITATION_EXPIRY_DAYS,
  MAX_INVITATION_EXPIRY_DAYS,
  deriveInvitationStatus,
  invitationExpiryFromDays,
} from "@/lib/invitations";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { Role } from "@/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * List a family's invitations, including used, expired, and revoked rows. Each
 * row carries a derived `status` so the UI can render the full lifecycle. The
 * token hash is never selected — the raw token exists solely in the link handed
 * to the invitee.
 *
 * Query: `?familyGroupId=<id>`.
 */
export async function GET(req: Request) {
  await connection();
  const { searchParams } = new URL(req.url);
  const familyGroupId = searchParams.get("familyGroupId");
  if (!familyGroupId || !familyGroupId.trim()) {
    return NextResponse.json({ error: "familyGroupId is required." }, { status: 400 });
  }

  try {
    const userId = await requireAuthenticatedUserId();
    await requireRoleAtLeast(userId, familyGroupId.trim(), "admin");
    const invitations = await prisma.familyInvitation.findMany({
      where: { familyGroupId: familyGroupId.trim() },
      // `usedAt`/`revokedAt` are read only to derive `status`; `tokenHash` is
      // deliberately never selected.
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        createdById: true,
        usedAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const now = Date.now();
    const mapped = invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      createdById: invitation.createdById,
      status: deriveInvitationStatus(invitation, now),
    }));

    // Pending first, then the query's createdAt-desc order. Array#sort is
    // stable, so recency is preserved within each status group.
    mapped.sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1));

    return NextResponse.json(mapped);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Listing invitations", "Unable to load invitations.");
  }
}

/**
 * Create a family invitation. Only owners/admins may invite. The raw token is
 * returned exactly once; only its SHA-256 hash is persisted.
 *
 * Body: `{ familyGroupId, email?, role?, expiresInDays? }`.
 */
export async function POST(req: Request) {
  await connection();
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { familyGroupId, email, role, expiresInDays } = parsed.body;

  if (typeof familyGroupId !== "string" || !familyGroupId.trim()) {
    return NextResponse.json({ error: "familyGroupId is required." }, { status: 400 });
  }

  let normalizedEmail: string | null = null;
  if (email !== undefined && email !== null && email !== "") {
    if (typeof email !== "string" || email.length > 254 || !EMAIL_PATTERN.test(email.trim())) {
      return NextResponse.json({ error: "email must be a valid email address." }, { status: 400 });
    }
    normalizedEmail = email.trim().toLowerCase();
  }

  let expiryDays = DEFAULT_INVITATION_EXPIRY_DAYS;
  if (expiresInDays !== undefined) {
    if (
      typeof expiresInDays !== "number" ||
      !Number.isSafeInteger(expiresInDays) ||
      expiresInDays < 1 ||
      expiresInDays > MAX_INVITATION_EXPIRY_DAYS
    ) {
      return NextResponse.json(
        { error: `expiresInDays must be a whole number between 1 and ${MAX_INVITATION_EXPIRY_DAYS}.` },
        { status: 400 }
      );
    }
    expiryDays = expiresInDays;
  }

  try {
    const userId = await requireAuthenticatedUserId();
    // Defense-in-depth; edge rate limiting should also be configured in Cloudflare.
    const limited = enforceRateLimit("family-invite-create", userId, req.headers, RATE_LIMITS.familyInvitationCreate);
    if (limited) return limited;
    const membership = await requireMembership(userId, familyGroupId.trim(), ["owner", "admin"]);

    // Owners may invite admins; admins may only invite members/children. The
    // `owner` role can never be granted through an invitation.
    const allowedRoles: readonly Role[] =
      membership.role === "owner" ? ["admin", "member", "child"] : ["member", "child"];
    const requestedRole: Role = role === undefined ? "member" : (role as Role);
    if (!allowedRoles.includes(requestedRole)) {
      return NextResponse.json(
        { error: `role must be one of: ${allowedRoles.join(", ")}.` },
        { status: 400 }
      );
    }

    // Email-bound duplicate prevention. Both checks run before any token is
    // generated, so a rejected request has no side effects.
    if (normalizedEmail) {
      const activeInvitation = await prisma.familyInvitation.findFirst({
        where: {
          familyGroupId: familyGroupId.trim(),
          email: normalizedEmail,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (activeInvitation) {
        return NextResponse.json(
          { error: "An active invitation already exists for this email." },
          { status: 409 }
        );
      }

      // Memberships store Clerk ids, so resolve the email to candidate users
      // first. An empty list (Clerk unavailable) simply skips the check.
      const memberUserIds = await findClerkUserIdsByEmail(normalizedEmail);
      if (memberUserIds.length > 0) {
        const existingMember = await prisma.familyGroupMember.findFirst({
          where: { groupId: familyGroupId.trim(), userId: { in: memberUserIds } },
          select: { id: true },
        });
        if (existingMember) {
          return NextResponse.json(
            { error: "This person is already a member of the family." },
            { status: 409 }
          );
        }
      }
    }

    const rawToken = generateInvitationToken();
    const expiresAt = invitationExpiryFromDays(expiryDays);
    const invitation = await prisma.familyInvitation.create({
      data: {
        familyGroupId: familyGroupId.trim(),
        tokenHash: hashInvitationToken(rawToken),
        email: normalizedEmail,
        role: requestedRole,
        createdById: userId,
        expiresAt,
      },
    });

    return NextResponse.json(
      {
        id: invitation.id,
        familyGroupId: invitation.familyGroupId,
        email: invitation.email,
        role: invitation.role,
        createdById: invitation.createdById,
        expiresAt: invitation.expiresAt,
        usedAt: invitation.usedAt,
        createdAt: invitation.createdAt,
        // Raw token: returned once and never retrievable again.
        token: rawToken,
      },
      { status: 201 }
    );
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Creating invitation", "Unable to create the invitation.");
  }
}
