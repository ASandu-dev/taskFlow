import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for the family membership lifecycle:
 *   POST   /api/family/groups/[id]/leave
 *   DELETE /api/family/groups/[id]/members/[userId]
 *   POST   /api/family/groups/[id]/transfer
 *
 * `@/lib/prisma` is mocked; identity comes from a mocked `@/lib/auth` so the
 * handlers can be invoked directly as functions. `connection()` is stubbed so
 * the route modules load outside a Next request scope.
 */

const mocks = vi.hoisted(() => {
  const tx = {
    familyGroup: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    familyGroupMember: { update: vi.fn() },
  };
  const prisma = {
    familyGroupMember: { findUnique: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma, tx };
});

const authState = vi.hoisted(() => ({ userId: "user_a" as string | null }));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth", () => ({ requireUserId: vi.fn(async () => authState.userId) }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn(async () => undefined) };
});

import { POST as leaveGroup } from "@/app/api/family/groups/[id]/leave/route";
import { DELETE as removeMember } from "@/app/api/family/groups/[id]/members/[userId]/route";
import { POST as transferOwnership } from "@/app/api/family/groups/[id]/transfer/route";

const USER_A = "user_a";
const USER_B = "user_b";
const USER_X = "user_x";

const GROUP = "group_1";
const BASE_URL = "http://localhost/api/family/groups";

function groupContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function memberContext(id: string, userId: string) {
  return { params: Promise.resolve({ id, userId }) };
}

function postRequest(body?: unknown): Request {
  return new Request(`${BASE_URL}/${GROUP}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.userId = USER_A;
  mocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx)
  );
});

describe("POST /family/groups/[id]/leave", () => {
  it("refuses the owner with 400 and deletes nothing", async () => {
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "owner" });

    const response = await leaveGroup(postRequest(), groupContext(GROUP));

    expect(response.status).toBe(400);
    await expect(bodyOf(response)).resolves.toEqual({
      error: "Transfer ownership to another member before leaving.",
    });
    expect(mocks.prisma.familyGroupMember.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes a non-owner membership and returns ok", async () => {
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "member" });
    mocks.prisma.familyGroupMember.deleteMany.mockResolvedValue({ count: 1 });

    const response = await leaveGroup(postRequest(), groupContext(GROUP));

    expect(response.status).toBe(200);
    await expect(bodyOf(response)).resolves.toEqual({ ok: true });
    expect(mocks.prisma.familyGroupMember.deleteMany).toHaveBeenCalledWith({
      where: { groupId: GROUP, userId: USER_A, role: { not: "owner" } },
    });
  });

  it("returns 403 (not 404) for a non-member and deletes nothing", async () => {
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue(null);

    const response = await leaveGroup(postRequest(), groupContext(GROUP));

    expect(response.status).toBe(403);
    expect(mocks.prisma.familyGroupMember.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    authState.userId = null;

    const response = await leaveGroup(postRequest(), groupContext(GROUP));

    expect(response.status).toBe(401);
    expect(mocks.prisma.familyGroupMember.findUnique).not.toHaveBeenCalled();
  });
});

describe("DELETE /family/groups/[id]/members/[userId]", () => {
  it("denies a member-level caller with 403", async () => {
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "member" });

    const response = await removeMember(postRequest(), memberContext(GROUP, USER_B));

    expect(response.status).toBe(403);
    expect(mocks.prisma.familyGroupMember.deleteMany).not.toHaveBeenCalled();
  });

  it("lets an admin remove another member", async () => {
    mocks.prisma.familyGroupMember.findUnique
      .mockResolvedValueOnce({ role: "admin" })
      .mockResolvedValueOnce({ role: "member" });
    mocks.prisma.familyGroupMember.deleteMany.mockResolvedValue({ count: 1 });

    const response = await removeMember(postRequest(), memberContext(GROUP, USER_B));

    expect(response.status).toBe(200);
    await expect(bodyOf(response)).resolves.toEqual({ ok: true });
    expect(mocks.prisma.familyGroupMember.deleteMany).toHaveBeenCalledWith({
      where: { groupId: GROUP, userId: USER_B, role: { not: "owner" } },
    });
  });

  it("refuses to remove the owner with 400", async () => {
    mocks.prisma.familyGroupMember.findUnique
      .mockResolvedValueOnce({ role: "admin" })
      .mockResolvedValueOnce({ role: "owner" });

    const response = await removeMember(postRequest(), memberContext(GROUP, USER_B));

    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toBe("The owner cannot be removed. Transfer ownership first.");
    expect(mocks.prisma.familyGroupMember.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses self-removal with 400 and never looks up the target", async () => {
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValueOnce({ role: "admin" });

    const response = await removeMember(postRequest(), memberContext(GROUP, USER_A));

    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toBe(
      "Use the leave endpoint to remove yourself from the family."
    );
    expect(mocks.prisma.familyGroupMember.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.familyGroupMember.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown target", async () => {
    mocks.prisma.familyGroupMember.findUnique
      .mockResolvedValueOnce({ role: "admin" })
      .mockResolvedValueOnce(null);

    const response = await removeMember(postRequest(), memberContext(GROUP, USER_X));

    expect(response.status).toBe(404);
    expect(mocks.prisma.familyGroupMember.deleteMany).not.toHaveBeenCalled();
  });
});

describe("POST /family/groups/[id]/transfer", () => {
  it("denies a non-owner caller with 403 and starts no transaction", async () => {
    // An admin is not sufficient to transfer ownership.
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "admin" });

    const response = await transferOwnership(postRequest({ userId: USER_B }), groupContext(GROUP));

    expect(response.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a missing/non-string userId with 400", async () => {
    const response = await transferOwnership(postRequest({ userId: 42 }), groupContext(GROUP));

    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toBe("userId is required.");
    expect(mocks.prisma.familyGroupMember.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the target is not a member", async () => {
    mocks.prisma.familyGroupMember.findUnique
      .mockResolvedValueOnce({ role: "owner" })
      .mockResolvedValueOnce(null);

    const response = await transferOwnership(postRequest({ userId: USER_B }), groupContext(GROUP));

    expect(response.status).toBe(404);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a transfer to self with 400", async () => {
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "owner" });

    const response = await transferOwnership(postRequest({ userId: USER_A }), groupContext(GROUP));

    expect(response.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("updates adminId and both roles atomically and returns the new owner", async () => {
    mocks.prisma.familyGroupMember.findUnique
      .mockResolvedValueOnce({ role: "owner" })
      .mockResolvedValueOnce({ id: "member_b" });
    mocks.tx.familyGroup.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.familyGroupMember.update.mockResolvedValue({});
    mocks.tx.familyGroup.findUniqueOrThrow.mockResolvedValue({
      id: GROUP,
      name: "Fam",
      adminId: USER_B,
    });

    const response = await transferOwnership(postRequest({ userId: USER_B }), groupContext(GROUP));

    expect(response.status).toBe(200);
    await expect(bodyOf(response)).resolves.toEqual({
      id: GROUP,
      name: "Fam",
      adminId: USER_B,
      role: "admin",
    });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.familyGroup.updateMany).toHaveBeenCalledWith({
      where: { id: GROUP, adminId: USER_A },
      data: { adminId: USER_B },
    });
    expect(mocks.tx.familyGroupMember.update).toHaveBeenNthCalledWith(1, {
      where: { groupId_userId: { groupId: GROUP, userId: USER_B } },
      data: { role: "owner" },
    });
    expect(mocks.tx.familyGroupMember.update).toHaveBeenNthCalledWith(2, {
      where: { groupId_userId: { groupId: GROUP, userId: USER_A } },
      data: { role: "admin" },
    });
  });

  it("fails closed when a concurrent transfer already changed the owner", async () => {
    mocks.prisma.familyGroupMember.findUnique
      .mockResolvedValueOnce({ role: "owner" })
      .mockResolvedValueOnce({ id: "member_b" });
    // Another transfer claimed the group first: the conditional update matches 0.
    mocks.tx.familyGroup.updateMany.mockResolvedValue({ count: 0 });

    const response = await transferOwnership(postRequest({ userId: USER_B }), groupContext(GROUP));

    expect(response.status).toBe(403);
    expect(mocks.tx.familyGroupMember.update).not.toHaveBeenCalled();
  });
});
