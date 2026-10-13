import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the P1 role hierarchy, task assignment, and task-completion
 * authorization, plus the pure calendar-event field validation. Prisma is
 * mocked so the suites run without a database.
 */

const mocks = vi.hoisted(() => {
  const prisma = {
    task: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    familyGroupMember: { findUnique: vi.fn() },
  };
  return { prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(),
  auth: vi.fn(async () => ({ userId: null })),
}));

import {
  AuthError,
  ROLE_RANK,
  requireRoleAtLeast,
  requireTaskCompletionAccess,
  requireValidAssignee,
} from "@/lib/authorization";
import {
  EVENT_DESCRIPTION_MAX_LENGTH,
  isValidClockTime,
  isValidTimeZone,
  validateEventOptionalFields,
} from "@/lib/event-validation";

const USER = "user_1";
const OTHER = "user_2";
const FAMILY = "family_1";

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
});

describe("ROLE_RANK", () => {
  it("orders owner > admin > member > child", () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.member);
    expect(ROLE_RANK.member).toBeGreaterThan(ROLE_RANK.child);
  });
});

describe("requireRoleAtLeast", () => {
  it("throws 403 for a non-member", async () => {
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue(null);

    const error = await captureAuthError(() => requireRoleAtLeast(USER, FAMILY, "member"));

    expect(error.status).toBe(403);
  });

  it("denies a child when member is required", async () => {
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "child" });

    const error = await captureAuthError(() => requireRoleAtLeast(USER, FAMILY, "member"));

    expect(error.status).toBe(403);
  });

  it("allows member and above for member, and returns the membership", async () => {
    for (const role of ["member", "admin", "owner"] as const) {
      mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role });
      await expect(requireRoleAtLeast(USER, FAMILY, "member")).resolves.toEqual({ role });
    }
  });

  it("denies a member when admin is required", async () => {
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "member" });

    const error = await captureAuthError(() => requireRoleAtLeast(USER, FAMILY, "admin"));

    expect(error.status).toBe(403);
  });
});

describe("requireValidAssignee", () => {
  it("allows an unassigned (null) task in any scope", async () => {
    await expect(requireValidAssignee({ ownerId: null, familyGroupId: FAMILY }, null)).resolves.toBeUndefined();
    expect(mocks.prisma.familyGroupMember.findUnique).not.toHaveBeenCalled();
  });

  it("accepts a family member and rejects a non-member with 400", async () => {
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ id: "m1" });
    await expect(requireValidAssignee({ ownerId: null, familyGroupId: FAMILY }, OTHER)).resolves.toBeUndefined();

    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue(null);
    const error = await captureAuthError(() =>
      requireValidAssignee({ ownerId: null, familyGroupId: FAMILY }, OTHER)
    );
    expect(error.status).toBe(400);
  });

  it("allows a personal task to be assigned only to its owner", async () => {
    await expect(requireValidAssignee({ ownerId: USER, familyGroupId: null }, USER)).resolves.toBeUndefined();

    const error = await captureAuthError(() =>
      requireValidAssignee({ ownerId: USER, familyGroupId: null }, OTHER)
    );
    expect(error.status).toBe(400);
  });
});

describe("requireTaskCompletionAccess", () => {
  function familyTask(assigneeId: string | null) {
    return { id: "task_1", projectId: "project_1", assigneeId };
  }
  function personalTask() {
    return { id: "task_1", projectId: "project_1", assigneeId: null };
  }

  it("lets a child complete a task assigned to them", async () => {
    mocks.prisma.task.findUnique.mockResolvedValue(familyTask(USER));
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "project_1", ownerId: null, familyGroupId: FAMILY });
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "child" });

    await expect(requireTaskCompletionAccess(USER, "task_1")).resolves.toMatchObject({
      task: { id: "task_1" },
    });
  });

  it("blocks a child from completing a family task not assigned to them", async () => {
    mocks.prisma.task.findUnique.mockResolvedValue(familyTask(OTHER));
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "project_1", ownerId: null, familyGroupId: FAMILY });
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "child" });

    const error = await captureAuthError(() => requireTaskCompletionAccess(USER, "task_1"));

    expect(error.status).toBe(403);
  });

  it("lets a member complete any family task", async () => {
    mocks.prisma.task.findUnique.mockResolvedValue(familyTask(OTHER));
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "project_1", ownerId: null, familyGroupId: FAMILY });
    mocks.prisma.familyGroupMember.findUnique.mockResolvedValue({ role: "member" });

    await expect(requireTaskCompletionAccess(USER, "task_1")).resolves.toMatchObject({
      task: { id: "task_1" },
    });
  });

  it("lets the owner complete a personal task", async () => {
    mocks.prisma.task.findUnique.mockResolvedValue(personalTask());
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "project_1", ownerId: USER, familyGroupId: null });

    await expect(requireTaskCompletionAccess(USER, "task_1")).resolves.toMatchObject({
      task: { id: "task_1" },
    });
  });

  it("rejects a non-owner on a personal task", async () => {
    mocks.prisma.task.findUnique.mockResolvedValue(personalTask());
    mocks.prisma.project.findUnique.mockResolvedValue({ id: "project_1", ownerId: OTHER, familyGroupId: null });

    const error = await captureAuthError(() => requireTaskCompletionAccess(USER, "task_1"));

    expect(error.status).toBe(403);
  });
});

describe("event field validation", () => {
  it("accepts valid HH:MM times and rejects others", () => {
    for (const value of ["00:00", "09:30", "23:59"]) expect(isValidClockTime(value)).toBe(true);
    for (const value of ["24:00", "9:30", "23:60", "23:5", "abc"]) expect(isValidClockTime(value)).toBe(false);
  });

  it("accepts known IANA zones and rejects garbage", () => {
    expect(isValidTimeZone("Europe/Bucharest")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });

  it("requires endTime to be strictly after time", () => {
    expect(
      validateEventOptionalFields({
        endTime: "10:00",
        description: undefined,
        location: undefined,
        timezone: undefined,
        startTime: "09:00",
      })
    ).toBeNull();
    expect(
      validateEventOptionalFields({
        endTime: "09:00",
        description: undefined,
        location: undefined,
        timezone: undefined,
        startTime: "09:00",
      })
    ).toBe("endTime must be later than time.");
  });

  it("enforces description and location length caps and timezone validity", () => {
    expect(
      validateEventOptionalFields({
        endTime: undefined,
        description: "x".repeat(EVENT_DESCRIPTION_MAX_LENGTH + 1),
        location: undefined,
        timezone: undefined,
        startTime: null,
      })
    ).toContain("description");
    expect(
      validateEventOptionalFields({
        endTime: undefined,
        description: undefined,
        location: "x".repeat(201),
        timezone: undefined,
        startTime: null,
      })
    ).toContain("location");
    expect(
      validateEventOptionalFields({
        endTime: undefined,
        description: undefined,
        location: undefined,
        timezone: "Not/AZone",
        startTime: null,
      })
    ).toContain("timezone");
  });
});
