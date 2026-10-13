import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * DB-backed cross-family isolation checks.
 *
 * This suite is SKIPPED unless `TEST_DATABASE_URL` is set, so the default
 * `npm test` never needs a database. See `tests/README.md` for how to run it.
 *
 * The app modules are imported dynamically (inside `beforeAll`) so that a
 * skipped run never even constructs the Prisma client — important because the
 * host cannot reach the Dockerised database (P1001).
 *
 * The membership-lifecycle checks below call the real route handlers against
 * the real database; only identity (`@/lib/auth`) and `connection()` are
 * stubbed, so no HTTP server is needed.
 */

const authState = vi.hoisted(() => ({ userId: "" as string }));

vi.mock("@/lib/auth", () => ({ requireUserId: vi.fn(async () => authState.userId) }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn(async () => undefined) };
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDb = describe.skipIf(!testDatabaseUrl);

type PrismaLike = typeof import("@/lib/prisma").prisma;
type AuthModule = typeof import("@/lib/authorization");
type LeaveRoute = typeof import("@/app/api/family/groups/[id]/leave/route").POST;
type RemoveMemberRoute =
  typeof import("@/app/api/family/groups/[id]/members/[userId]/route").DELETE;
type TransferRoute = typeof import("@/app/api/family/groups/[id]/transfer/route").POST;

describeWithDb("cross-family isolation (real database)", () => {
  const USER_A = "itest_user_a";
  const USER_B = "itest_user_b";
  const USER_C = "itest_user_c";
  const USER_D = "itest_user_d";
  const USER_X = "itest_user_x";

  let prisma: PrismaLike;
  let authorization: AuthModule;
  let leaveGroup: LeaveRoute;
  let removeMember: RemoveMemberRoute;
  let transferOwnership: TransferRoute;

  let groupAId: string;
  let groupBId: string;
  let groupMId: string;
  let familyBProjectId: string;
  let personalAProjectId: string;
  let personalBProjectId: string;
  let legacyProjectId: string;
  let familyBTaskId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = (await import("@/lib/prisma")).prisma;
    authorization = await import("@/lib/authorization");
    leaveGroup = (await import("@/app/api/family/groups/[id]/leave/route")).POST;
    removeMember = (await import("@/app/api/family/groups/[id]/members/[userId]/route")).DELETE;
    transferOwnership = (await import("@/app/api/family/groups/[id]/transfer/route")).POST;

    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const groupA = await prisma.familyGroup.create({
      data: { name: `ITest A ${suffix}`, adminId: USER_A, inviteCode: `itest-a-${suffix}` },
    });
    const groupB = await prisma.familyGroup.create({
      data: { name: `ITest B ${suffix}`, adminId: USER_B, inviteCode: `itest-b-${suffix}` },
    });
    const groupM = await prisma.familyGroup.create({
      data: { name: `ITest M ${suffix}`, adminId: USER_A, inviteCode: `itest-m-${suffix}` },
    });
    groupAId = groupA.id;
    groupBId = groupB.id;
    groupMId = groupM.id;

    await prisma.familyGroupMember.createMany({
      data: [
        { groupId: groupAId, userId: USER_A, role: "owner" },
        { groupId: groupBId, userId: USER_B, role: "owner" },
        // Dedicated group for the membership-lifecycle checks: every role is
        // represented so leave/remove/transfer can be exercised end to end.
        { groupId: groupMId, userId: USER_A, role: "owner" },
        { groupId: groupMId, userId: USER_B, role: "admin" },
        { groupId: groupMId, userId: USER_C, role: "member" },
        { groupId: groupMId, userId: USER_D, role: "child" },
      ],
    });

    const [familyBProject, personalAProject, personalBProject, legacyProject] = await Promise.all([
      prisma.project.create({
        data: { name: "Family B project", color: "#111111", familyGroupId: groupBId },
      }),
      prisma.project.create({
        data: { name: "A personal project", color: "#222222", ownerId: USER_A },
      }),
      prisma.project.create({
        data: { name: "B personal project", color: "#333333", ownerId: USER_B },
      }),
      prisma.project.create({ data: { name: "Legacy project", color: "#444444" } }),
    ]);
    familyBProjectId = familyBProject.id;
    personalAProjectId = personalAProject.id;
    personalBProjectId = personalBProject.id;
    legacyProjectId = legacyProject.id;

    const task = await prisma.task.create({
      data: { title: "Task in B", projectId: familyBProjectId, priority: "low", status: "todo" },
    });
    familyBTaskId = task.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    // Delete in dependency order; Task -> Project is Restrict, so tasks first.
    await prisma.task.deleteMany({ where: { projectId: familyBProjectId } });
    await prisma.project.deleteMany({
      where: {
        id: { in: [familyBProjectId, personalAProjectId, personalBProjectId, legacyProjectId] },
      },
    });
    await prisma.familyGroupMember.deleteMany({
      where: { groupId: { in: [groupAId, groupBId, groupMId] } },
    });
    await prisma.familyGroup.deleteMany({
      where: { id: { in: [groupAId, groupBId, groupMId] } },
    });
    await prisma.$disconnect();
  });

  it("denies user A access to family B's project", async () => {
    await expect(
      authorization.requireProjectAccess(USER_A, familyBProjectId, "read")
    ).rejects.toMatchObject({ status: 403 });
  });

  it("denies user A access to user B's personal project", async () => {
    await expect(
      authorization.requireProjectAccess(USER_A, personalBProjectId, "write")
    ).rejects.toMatchObject({ status: 403 });
  });

  it("hides legacy unscoped projects as 404", async () => {
    await expect(
      authorization.requireProjectAccess(USER_A, legacyProjectId, "read")
    ).rejects.toMatchObject({ status: 404 });
  });

  it("allows user A to access their own personal project", async () => {
    const project = await authorization.requireProjectAccess(USER_A, personalAProjectId, "write");
    expect(project.id).toBe(personalAProjectId);
  });

  it("denies a member-family delete unless the role is owner/admin", async () => {
    await expect(
      authorization.requireProjectAccess(USER_A, personalAProjectId, "delete")
    ).resolves.toMatchObject({ id: personalAProjectId });

    // USER_A is the owner of group A, so family delete is allowed there.
    const familyAProject = await prisma.project.create({
      data: { name: "Family A project", color: "#555555", familyGroupId: groupAId },
    });
    try {
      await expect(
        authorization.requireProjectAccess(USER_A, familyAProject.id, "delete")
      ).resolves.toMatchObject({ id: familyAProject.id });
    } finally {
      await prisma.project.delete({ where: { id: familyAProject.id } });
    }
  });

  it("rejects a task whose project belongs to another family", async () => {
    await expect(
      authorization.requireTaskAccess(USER_A, familyBTaskId, "write")
    ).rejects.toMatchObject({ status: 403 });
  });

  describe("membership lifecycle (real database)", () => {
    const groupCtx = (id: string) => ({ params: Promise.resolve({ id }) });
    const memberCtx = (id: string, userId: string) => ({
      params: Promise.resolve({ id, userId }),
    });
    const postReq = (body?: unknown) =>
      new Request("http://localhost/api/family/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const membershipOf = (userId: string) =>
      prisma.familyGroupMember.findUnique({
        where: { groupId_userId: { groupId: groupMId, userId } },
      });

    it("refuses an owner who tries to leave and keeps the membership", async () => {
      authState.userId = USER_A;

      const response = await leaveGroup(postReq(), groupCtx(groupMId));

      expect(response.status).toBe(400);
      await expect(membershipOf(USER_A)).resolves.not.toBeNull();
    });

    it("lets a member leave and revokes their family access immediately", async () => {
      authState.userId = USER_C;

      const response = await leaveGroup(postReq(), groupCtx(groupMId));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      await expect(membershipOf(USER_C)).resolves.toBeNull();
      await expect(authorization.requireMembership(USER_C, groupMId)).rejects.toMatchObject({
        status: 403,
      });
    });

    it("returns 403 when a non-member tries to leave", async () => {
      authState.userId = USER_X;

      const response = await leaveGroup(postReq(), groupCtx(groupMId));

      expect(response.status).toBe(403);
    });

    it("denies a child (non-admin) caller trying to remove a member", async () => {
      await prisma.familyGroupMember.create({
        data: { groupId: groupMId, userId: USER_C, role: "member" },
      });
      authState.userId = USER_D;

      const response = await removeMember(postReq(), memberCtx(groupMId, USER_C));

      expect(response.status).toBe(403);
      await expect(membershipOf(USER_C)).resolves.not.toBeNull();
    });

    it("lets an admin remove a member and revokes access", async () => {
      authState.userId = USER_B;

      const response = await removeMember(postReq(), memberCtx(groupMId, USER_C));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      await expect(membershipOf(USER_C)).resolves.toBeNull();
    });

    it("refuses to remove the group owner", async () => {
      authState.userId = USER_B;

      const response = await removeMember(postReq(), memberCtx(groupMId, USER_A));

      expect(response.status).toBe(400);
      await expect(membershipOf(USER_A)).resolves.not.toBeNull();
    });

    it("refuses self-removal through the admin endpoint", async () => {
      authState.userId = USER_B;

      const response = await removeMember(postReq(), memberCtx(groupMId, USER_B));

      expect(response.status).toBe(400);
      await expect(membershipOf(USER_B)).resolves.not.toBeNull();
    });

    it("returns 404 for removing a non-member", async () => {
      authState.userId = USER_B;

      const response = await removeMember(postReq(), memberCtx(groupMId, USER_X));

      expect(response.status).toBe(404);
    });

    it("denies a non-owner trying to transfer ownership", async () => {
      authState.userId = USER_B;

      const response = await transferOwnership(postReq({ userId: USER_D }), groupCtx(groupMId));

      expect(response.status).toBe(403);
      const group = await prisma.familyGroup.findUnique({ where: { id: groupMId } });
      expect(group?.adminId).toBe(USER_A);
    });

    it("rejects a transfer to a non-member", async () => {
      authState.userId = USER_A;

      const response = await transferOwnership(postReq({ userId: USER_X }), groupCtx(groupMId));

      expect(response.status).toBe(404);
      const group = await prisma.familyGroup.findUnique({ where: { id: groupMId } });
      expect(group?.adminId).toBe(USER_A);
    });

    it("transfers ownership atomically, promoting the target and demoting the owner to admin", async () => {
      authState.userId = USER_A;

      // USER_D holds `child`; transferring to a child is permitted and promotes
      // them to `owner`, while the previous owner stays on as `admin`.
      const response = await transferOwnership(postReq({ userId: USER_D }), groupCtx(groupMId));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ adminId: USER_D, role: "admin" });

      const group = await prisma.familyGroup.findUnique({ where: { id: groupMId } });
      expect(group?.adminId).toBe(USER_D);
      await expect(membershipOf(USER_D)).resolves.toMatchObject({ role: "owner" });
      await expect(membershipOf(USER_A)).resolves.toMatchObject({ role: "admin" });
    });
  });
});
