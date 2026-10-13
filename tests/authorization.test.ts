import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Security regression tests for tenant authorization.
 *
 * `@/lib/prisma` and `@clerk/nextjs/server` are mocked so these helpers can be
 * exercised in isolation. The helpers take `userId` explicitly and never read
 * identity from the request, which is exactly the property under test.
 */

const mocks = vi.hoisted(() => {
  const tx = {
    familyInvitation: { updateMany: vi.fn() },
    familyGroupMember: { upsert: vi.fn() },
  };
  const prisma = {
    project: { findUnique: vi.fn() },
    goal: { findUnique: vi.fn() },
    calendarEvent: { findUnique: vi.fn() },
    task: { findUnique: vi.fn() },
    familyGroupMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    familyInvitation: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma, tx };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(),
  // `@/lib/auth` imports `auth`; provide a safe default so the module graph loads.
  auth: vi.fn(async () => ({ userId: null })),
}));

import {
  AuthError,
  authErrorResponse,
  generateInvitationToken,
  hashInvitationToken,
  redeemFamilyInvitation,
  requireEventAccess,
  requireGoalAccess,
  requireProjectAccess,
  requireTaskAccess,
  resolveCreateScope,
} from "@/lib/authorization";

const USER_A = "user_a";
const USER_B = "user_b";

function resource(ownerId: string | null, familyGroupId: string | null) {
  return {
    id: "res_1",
    ownerId,
    familyGroupId,
    // Additional columns a real row would carry; harmless to the access check.
    name: "Resource",
    color: "#000000",
  };
}

async function captureAuthError(run: () => Promise<unknown>): Promise<AuthError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    return error as AuthError;
  }
  throw new Error("Expected the call to throw an AuthError, but it resolved.");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx)
  );
});

describe("resource scope rules", () => {
  it.each([
    ["project", requireProjectAccess, () => mocks.prisma.project.findUnique, (id: string) => id],
    ["goal", requireGoalAccess, () => mocks.prisma.goal.findUnique, (id: string) => id],
    ["event", requireEventAccess, () => mocks.prisma.calendarEvent.findUnique, (id: string) => id],
  ] as const)(
    "%s: family resource in another family is 403 for a non-member and returns no row",
    async (_label, access, finder, idOf) => {
      finder().mockResolvedValue(resource(null, "family_b"));
      mocks.prisma.familyGroupMember.findUnique.mockResolvedValue(null);

      const error = await captureAuthError(() => access(USER_A, idOf("res_1"), "read"));

      expect(error.status).toBe(403);
      expect(mocks.prisma.familyGroupMember.findUnique).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ["project", requireProjectAccess, () => mocks.prisma.project.findUnique],
    ["goal", requireGoalAccess, () => mocks.prisma.goal.findUnique],
    ["event", requireEventAccess, () => mocks.prisma.calendarEvent.findUnique],
  ] as const)("%s: personal resource owned by another user is 403", async (_label, access, finder) => {
    finder().mockResolvedValue(resource(USER_B, null));

    const error = await captureAuthError(() => access(USER_A, "res_1", "read"));

    expect(error.status).toBe(403);
    // A personal resource must not consult family membership at all.
    expect(mocks.prisma.familyGroupMember.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["project", requireProjectAccess, () => mocks.prisma.project.findUnique],
    ["goal", requireGoalAccess, () => mocks.prisma.goal.findUnique],
    ["event", requireEventAccess, () => mocks.prisma.calendarEvent.findUnique],
  ] as const)("%s: legacy unscoped row is 404 for everyone", async (_label, access, finder) => {
    finder().mockResolvedValue(resource(null, null));

    const error = await captureAuthError(() => access(USER_A, "res_1", "read"));

    expect(error.status).toBe(404);
    expect(mocks.prisma.familyGroupMember.findUnique).not.toHaveBeenCalled();
  });

  it("personal resource owned by the caller is allowed", async () => {
    const row = resource(USER_A, null);
    mocks.prisma.project.findUnique.mockResolvedValue(row);

    await expect(requireProjectAccess(USER_A, "res_1", "write")).resolves.toBe(row);
  });

  it("family resource: read and write are allowed for a member, delete requires owner/admin", async () => {
    const row = resource(null, "family_a");
    mocks.prisma.project.findUnique.mockResolvedValue(row);

    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "member" });
    await expect(requireProjectAccess(USER_A, "res_1", "read")).resolves.toBe(row);
    await expect(requireProjectAccess(USER_A, "res_1", "write")).resolves.toBe(row);

    const denied = await captureAuthError(() => requireProjectAccess(USER_A, "res_1", "delete"));
    expect(denied.status).toBe(403);

    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "admin" });
    await expect(requireProjectAccess(USER_A, "res_1", "delete")).resolves.toBe(row);

    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "owner" });
    await expect(requireProjectAccess(USER_A, "res_1", "delete")).resolves.toBe(row);
  });

  it("missing project row is 404", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(null);
    const error = await captureAuthError(() => requireProjectAccess(USER_A, "missing", "read"));
    expect(error.status).toBe(404);
  });
});

describe("task access derives scope from its project", () => {
  it("rejects a task whose project belongs to another family", async () => {
    mocks.prisma.task.findUnique.mockResolvedValue({ id: "task_1", projectId: "project_b" });
    mocks.prisma.project.findUnique.mockResolvedValue(resource(null, "family_b"));
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue(null);

    const error = await captureAuthError(() => requireTaskAccess(USER_A, "task_1", "write"));

    expect(error.status).toBe(403);
  });

  it("allows a task in the caller's own personal project", async () => {
    const project = resource(USER_A, null);
    const task = { id: "task_1", projectId: "project_a", title: "T", priority: "low", status: "todo" };
    mocks.prisma.task.findUnique.mockResolvedValue(task);
    mocks.prisma.project.findUnique.mockResolvedValue(project);

    await expect(requireTaskAccess(USER_A, "task_1", "read")).resolves.toEqual({ task, project });
  });
});

describe("resolveCreateScope", () => {
  it("omitting familyGroupId creates a personal scope owned by the caller", async () => {
    for (const omitted of [undefined, null, ""]) {
      await expect(resolveCreateScope(USER_A, omitted)).resolves.toEqual({
        ownerId: USER_A,
        familyGroupId: null,
      });
    }
    expect(mocks.prisma.familyGroupMember.findUnique).not.toHaveBeenCalled();
  });

  it("supplying a family the caller is not in is 403 and creates no scope", async () => {
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue(null);

    const error = await captureAuthError(() => resolveCreateScope(USER_A, "family_b"));

    expect(error.status).toBe(403);
  });

  it("supplying a family the caller is in yields a family scope with no owner", async () => {
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "member" });

    await expect(resolveCreateScope(USER_A, "family_a")).resolves.toEqual({
      ownerId: null,
      familyGroupId: "family_a",
    });
  });

  it("ignores any client-supplied ownerId", async () => {
    // The helper's signature has no ownerId parameter; even if a caller smuggles
    // an extra argument, the returned scope stays bound to the resolved user.
    const smuggled = resolveCreateScope as unknown as (
      userId: string,
      familyGroupId: unknown,
      ownerId?: unknown
    ) => Promise<{ ownerId: string | null; familyGroupId: string | null }>;

    await expect(smuggled(USER_A, undefined, USER_B)).resolves.toEqual({
      ownerId: USER_A,
      familyGroupId: null,
    });
  });
});

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv_1",
    familyGroupId: "family_a",
    tokenHash: "unused-in-mock",
    email: null,
    role: "member",
    createdById: "admin_1",
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    usedById: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("redeemFamilyInvitation", () => {
  it("unknown token is 404", async () => {
    mocks.prisma.familyInvitation.findUnique.mockResolvedValue(null);

    const error = await captureAuthError(() => redeemFamilyInvitation(USER_A, "raw", null));

    expect(error.status).toBe(404);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("already-used invitation is 410", async () => {
    mocks.prisma.familyInvitation.findUnique.mockResolvedValue(
      invitation({ usedAt: new Date() })
    );

    const error = await captureAuthError(() => redeemFamilyInvitation(USER_A, "raw", null));

    expect(error.status).toBe(410);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("revoked invitation is 410", async () => {
    mocks.prisma.familyInvitation.findUnique.mockResolvedValue(
      invitation({ revokedAt: new Date() })
    );

    const error = await captureAuthError(() => redeemFamilyInvitation(USER_A, "raw", null));

    expect(error.status).toBe(410);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("expired invitation is 410", async () => {
    mocks.prisma.familyInvitation.findUnique.mockResolvedValue(
      invitation({ expiresAt: new Date(Date.now() - 1_000) })
    );

    const error = await captureAuthError(() => redeemFamilyInvitation(USER_A, "raw", null));

    expect(error.status).toBe(410);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("is single-use: the second concurrent redemption is 410 and creates no membership", async () => {
    mocks.prisma.familyInvitation.findUnique.mockResolvedValue(invitation());
    mocks.tx.familyInvitation.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    mocks.tx.familyGroupMember.upsert.mockResolvedValue({});

    const first = await redeemFamilyInvitation(USER_A, "raw", null);
    expect(first).toEqual({ groupId: "family_a", role: "member" });
    expect(mocks.tx.familyGroupMember.upsert).toHaveBeenCalledTimes(1);

    const error = await captureAuthError(() => redeemFamilyInvitation(USER_A, "raw", null));

    expect(error.status).toBe(410);
    // The losing redemption must not upsert a membership.
    expect(mocks.tx.familyGroupMember.upsert).toHaveBeenCalledTimes(1);
  });

  it("email-bound invitation with a mismatching email is 403", async () => {
    mocks.prisma.familyInvitation.findUnique.mockResolvedValue(
      invitation({ email: "alice@example.com" })
    );

    const error = await captureAuthError(() =>
      redeemFamilyInvitation(USER_A, "raw", "bob@example.com")
    );

    expect(error.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("email-bound invitation with a matching email (case-insensitive) redeems", async () => {
    mocks.prisma.familyInvitation.findUnique.mockResolvedValue(
      invitation({ email: "alice@example.com" })
    );
    mocks.tx.familyInvitation.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.familyGroupMember.upsert.mockResolvedValue({});

    await expect(redeemFamilyInvitation(USER_A, "raw", "Alice@Example.com")).resolves.toEqual({
      groupId: "family_a",
      role: "member",
    });
  });

  it("email-bound invitation with no resolved email is allowed (keyless/no primary address)", async () => {
    mocks.prisma.familyInvitation.findUnique.mockResolvedValue(
      invitation({ email: "alice@example.com" })
    );
    mocks.tx.familyInvitation.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.familyGroupMember.upsert.mockResolvedValue({});

    await expect(redeemFamilyInvitation(USER_A, "raw", null)).resolves.toEqual({
      groupId: "family_a",
      role: "member",
    });
  });
});

describe("invitation tokens", () => {
  it("generates distinct high-entropy tokens", () => {
    const tokens = new Set(Array.from({ length: 64 }, () => generateInvitationToken()));

    expect(tokens.size).toBe(64);
    for (const token of tokens) {
      // 256 bits base64url-encoded is 43 characters.
      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("hashes deterministically and never equals the raw token", () => {
    const token = generateInvitationToken();
    const hash = hashInvitationToken(token);

    expect(hashInvitationToken(token)).toBe(hash);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
  });
});

describe("authErrorResponse", () => {
  it("maps an AuthError to its status and message", async () => {
    const response = authErrorResponse(new AuthError(403, "No access."));

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ error: "No access." });
  });

  it("returns null for non-AuthErrors", () => {
    expect(authErrorResponse(new Error("boom"))).toBeNull();
    expect(authErrorResponse("nope")).toBeNull();
    expect(authErrorResponse(null)).toBeNull();
  });
});
