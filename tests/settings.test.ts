import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for settings endpoints:
 *   GET    /api/settings
 *   PATCH  /api/settings
 *   PATCH  /api/settings/profile
 */

const mocks = vi.hoisted(() => {
  const prisma = {
    userSettings: {
      upsert: vi.fn(),
    },
    familyGroupMember: {
      findMany: vi.fn(),
    },
  };
  return { prisma };
});

const authState = vi.hoisted(() => ({ userId: "user_a" as string | null }));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth", () => ({ requireUserId: vi.fn(async () => authState.userId) }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn(async () => undefined) };
});

const clerkProfileMocks = vi.hoisted(() => ({
  getClerkProfile: vi.fn(),
  updateClerkUserProfile: vi.fn(),
}));

const clerkConfigMocks = vi.hoisted(() => ({
  isKeylessDevMode: vi.fn(),
}));

vi.mock("@/lib/clerk-profile", () => clerkProfileMocks);
vi.mock("@/lib/clerk-config", () => clerkConfigMocks);

import { GET as getSettings, PATCH as patchSettings } from "@/app/api/settings/route";
import { PATCH as patchProfile } from "@/app/api/settings/profile/route";

const USER_A = "user_a";
const BASE_URL = "http://localhost/api/settings";

function jsonRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "PATCH",
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
  clerkConfigMocks.isKeylessDevMode.mockReturnValue(false);
});

describe("GET /api/settings", () => {
  it("returns settings + profile + families and upserts default UserSettings when none exists", async () => {
    const settings = {
      defaultCalendarView: "month",
      shareWorkAvailability: true,
      defaultEventClassification: "family",
      shareSyncedEventsWithFamily: false,
    };
    mocks.prisma.userSettings.upsert.mockResolvedValue(settings);
    mocks.prisma.familyGroupMember.findMany.mockResolvedValue([
      {
        groupId: "group_1",
        role: "owner",
        group: { name: "Smith Family" },
      },
      {
        groupId: "group_2",
        role: "member",
        group: { name: "Neighbors" },
      },
    ]);
    clerkProfileMocks.getClerkProfile.mockResolvedValue({
      id: USER_A,
      name: "Alice Smith",
      email: "alice@example.com",
      avatarPreset: "fox",
    });

    const response = await getSettings();

    expect(response.status).toBe(200);
    await expect(bodyOf(response)).resolves.toEqual({
      settings,
      profile: {
        id: USER_A,
        name: "Alice Smith",
        email: "alice@example.com",
        avatarPreset: "fox",
      },
      families: [
        { id: "group_1", name: "Smith Family", role: "owner" },
        { id: "group_2", name: "Neighbors", role: "member" },
      ],
    });

    // upserts default settings for authenticated user
    expect(mocks.prisma.userSettings.upsert).toHaveBeenCalledWith({
      where: { userId: USER_A },
      update: {},
      create: { userId: USER_A },
      select: {
        defaultCalendarView: true,
        shareWorkAvailability: true,
        defaultEventClassification: true,
        shareSyncedEventsWithFamily: true,
      },
    });
    expect(mocks.prisma.familyGroupMember.findMany).toHaveBeenCalledWith({
      where: { userId: USER_A },
      select: { groupId: true, role: true, group: { select: { name: true } } },
      orderBy: { joinedAt: "asc" },
    });
    expect(clerkProfileMocks.getClerkProfile).toHaveBeenCalledWith(USER_A);
  });

  it("scopes to authenticated user (never uses body-supplied id)", async () => {
    authState.userId = "user_b";
    mocks.prisma.userSettings.upsert.mockResolvedValue({
      defaultCalendarView: "week",
      shareWorkAvailability: false,
      defaultEventClassification: "work",
    });
    mocks.prisma.familyGroupMember.findMany.mockResolvedValue([]);
    clerkProfileMocks.getClerkProfile.mockResolvedValue({
      id: "user_b",
      name: "Bob",
      email: "bob@example.com",
      avatarPreset: null,
    });

    const response = await getSettings();

    expect(response.status).toBe(200);
    expect(mocks.prisma.userSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_b" }, create: { userId: "user_b" } })
    );
    expect(mocks.prisma.familyGroupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_b" } })
    );
    expect(clerkProfileMocks.getClerkProfile).toHaveBeenCalledWith("user_b");
  });
});

describe("PATCH /api/settings", () => {
  it("persists each supported field and returns the saved settings", async () => {
    mocks.prisma.userSettings.upsert.mockResolvedValue({
      defaultCalendarView: "week",
      shareWorkAvailability: false,
      defaultEventClassification: "work",
    });

    const response = await patchSettings(jsonRequest(BASE_URL, { defaultCalendarView: "week" }));

    expect(response.status).toBe(200);
    await expect(bodyOf(response)).resolves.toEqual({
      defaultCalendarView: "week",
      shareWorkAvailability: false,
      defaultEventClassification: "work",
    });
    expect(mocks.prisma.userSettings.upsert).toHaveBeenCalledWith({
      where: { userId: USER_A },
      update: { defaultCalendarView: "week" },
      create: { userId: USER_A, defaultCalendarView: "week" },
      select: {
        defaultCalendarView: true,
        shareWorkAvailability: true,
        defaultEventClassification: true,
        shareSyncedEventsWithFamily: true,
      },
    });
  });

  it("persists multiple fields together", async () => {
    mocks.prisma.userSettings.upsert.mockResolvedValue({
      defaultCalendarView: "day",
      shareWorkAvailability: true,
      defaultEventClassification: "private",
    });

    const response = await patchSettings(
      jsonRequest(BASE_URL, {
        defaultCalendarView: "day",
        shareWorkAvailability: true,
        defaultEventClassification: "private",
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.userSettings.upsert).toHaveBeenCalledWith({
      where: { userId: USER_A },
      update: {
        defaultCalendarView: "day",
        shareWorkAvailability: true,
        defaultEventClassification: "private",
      },
      create: {
        userId: USER_A,
        defaultCalendarView: "day",
        shareWorkAvailability: true,
        defaultEventClassification: "private",
      },
      select: {
        defaultCalendarView: true,
        shareWorkAvailability: true,
        defaultEventClassification: true,
        shareSyncedEventsWithFamily: true,
      },
    });
  });

  it("persists shareSyncedEventsWithFamily", async () => {
    mocks.prisma.userSettings.upsert.mockResolvedValue({
      defaultCalendarView: "month",
      shareWorkAvailability: true,
      defaultEventClassification: "family",
      shareSyncedEventsWithFamily: true,
    });

    const response = await patchSettings(
      jsonRequest(BASE_URL, { shareSyncedEventsWithFamily: true })
    );

    expect(response.status).toBe(200);
    await expect(bodyOf(response)).resolves.toEqual({
      defaultCalendarView: "month",
      shareWorkAvailability: true,
      defaultEventClassification: "family",
      shareSyncedEventsWithFamily: true,
    });
    expect(mocks.prisma.userSettings.upsert).toHaveBeenCalledWith({
      where: { userId: USER_A },
      update: { shareSyncedEventsWithFamily: true },
      create: { userId: USER_A, shareSyncedEventsWithFamily: true },
      select: {
        defaultCalendarView: true,
        shareWorkAvailability: true,
        defaultEventClassification: true,
        shareSyncedEventsWithFamily: true,
      },
    });
  });

  it("rejects invalid enum values (400) and non-boolean shareWorkAvailability (400)", async () => {
    const badCalendar = await patchSettings(jsonRequest(BASE_URL, { defaultCalendarView: "monthly" }));
    expect(badCalendar.status).toBe(400);
    await expect(bodyOf(badCalendar)).resolves.toEqual({
      error: "defaultCalendarView must be one of: month, week, day, agenda.",
    });

    const badClassification = await patchSettings(
      jsonRequest(BASE_URL, { defaultEventClassification: "public" })
    );
    expect(badClassification.status).toBe(400);
    await expect(bodyOf(badClassification)).resolves.toEqual({
      error: "defaultEventClassification must be one of: family, work, private.",
    });

    const badShare = await patchSettings(jsonRequest(BASE_URL, { shareWorkAvailability: "yes" }));
    expect(badShare.status).toBe(400);
    await expect(bodyOf(badShare)).resolves.toEqual({
      error: "shareWorkAvailability must be a boolean.",
    });

    const badShareSynced = await patchSettings(
      jsonRequest(BASE_URL, { shareSyncedEventsWithFamily: "yes" })
    );
    expect(badShareSynced.status).toBe(400);
    await expect(bodyOf(badShareSynced)).resolves.toEqual({
      error: "shareSyncedEventsWithFamily must be a boolean.",
    });

    expect(mocks.prisma.userSettings.upsert).not.toHaveBeenCalled();
  });

  it("rejects empty update with 400", async () => {
    const response = await patchSettings(jsonRequest(BASE_URL, {}));
    expect(response.status).toBe(400);
    await expect(bodyOf(response)).resolves.toEqual({ error: "Provide a preference to update." });
    expect(mocks.prisma.userSettings.upsert).not.toHaveBeenCalled();
  });

  it("scopes updates to authenticated user", async () => {
    authState.userId = "user_c";
    mocks.prisma.userSettings.upsert.mockResolvedValue({
      defaultCalendarView: "agenda",
      shareWorkAvailability: false,
      defaultEventClassification: "family",
    });

    const response = await patchSettings(jsonRequest(BASE_URL, { defaultCalendarView: "agenda" }));
    expect(response.status).toBe(200);
    expect(mocks.prisma.userSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_c" } })
    );
  });
});

describe("PATCH /api/settings/profile", () => {
  it("updates the Clerk user name and returns { name, avatarPreset }", async () => {
    clerkConfigMocks.isKeylessDevMode.mockReturnValue(false);
    clerkProfileMocks.updateClerkUserProfile.mockResolvedValue(undefined);

    const response = await patchProfile(jsonRequest(`${BASE_URL}/profile`, { name: "Alice Smith" }));

    expect(response.status).toBe(200);
    await expect(bodyOf(response)).resolves.toEqual({ name: "Alice Smith", avatarPreset: null });
    expect(clerkProfileMocks.updateClerkUserProfile).toHaveBeenCalledWith(USER_A, {
      name: "Alice Smith",
    });
  });

  it("trims the name before returning", async () => {
    clerkConfigMocks.isKeylessDevMode.mockReturnValue(false);
    clerkProfileMocks.updateClerkUserProfile.mockResolvedValue(undefined);

    const response = await patchProfile(jsonRequest(`${BASE_URL}/profile`, { name: "  Bob Jones  " }));

    expect(response.status).toBe(200);
    await expect(bodyOf(response)).resolves.toEqual({ name: "Bob Jones", avatarPreset: null });
    expect(clerkProfileMocks.updateClerkUserProfile).toHaveBeenCalledWith(USER_A, {
      name: "  Bob Jones  ",
    });
  });

  it("persists a preset avatar on its own", async () => {
    clerkConfigMocks.isKeylessDevMode.mockReturnValue(false);
    clerkProfileMocks.updateClerkUserProfile.mockResolvedValue(undefined);

    const response = await patchProfile(jsonRequest(`${BASE_URL}/profile`, { avatarPreset: "fox" }));

    expect(response.status).toBe(200);
    await expect(bodyOf(response)).resolves.toEqual({ name: null, avatarPreset: "fox" });
    expect(clerkProfileMocks.updateClerkUserProfile).toHaveBeenCalledWith(USER_A, {
      avatarPreset: "fox",
    });
  });

  it("persists name and avatar preset in one update", async () => {
    clerkConfigMocks.isKeylessDevMode.mockReturnValue(false);
    clerkProfileMocks.updateClerkUserProfile.mockResolvedValue(undefined);

    const response = await patchProfile(
      jsonRequest(`${BASE_URL}/profile`, { name: "Alice", avatarPreset: "whale" })
    );

    expect(response.status).toBe(200);
    await expect(bodyOf(response)).resolves.toEqual({ name: "Alice", avatarPreset: "whale" });
    expect(clerkProfileMocks.updateClerkUserProfile).toHaveBeenCalledWith(USER_A, {
      name: "Alice",
      avatarPreset: "whale",
    });
  });

  it("rejects unknown avatar presets (400)", async () => {
    const response = await patchProfile(
      jsonRequest(`${BASE_URL}/profile`, { avatarPreset: "dragon" })
    );

    expect(response.status).toBe(400);
    await expect(bodyOf(response)).resolves.toEqual({
      error: "avatarPreset must be a known avatar preset.",
    });
    expect(clerkProfileMocks.updateClerkUserProfile).not.toHaveBeenCalled();
  });

  it("rejects empty/oversized names (400)", async () => {
    const empty = await patchProfile(jsonRequest(`${BASE_URL}/profile`, { name: "" }));
    expect(empty.status).toBe(400);
    await expect(bodyOf(empty)).resolves.toEqual({ error: "name must be a non-empty string." });

    const whitespace = await patchProfile(jsonRequest(`${BASE_URL}/profile`, { name: "   " }));
    expect(whitespace.status).toBe(400);
    await expect(bodyOf(whitespace)).resolves.toEqual({ error: "name must be a non-empty string." });

    const longName = "a".repeat(101);
    const oversized = await patchProfile(jsonRequest(`${BASE_URL}/profile`, { name: longName }));
    expect(oversized.status).toBe(400);
    await expect(bodyOf(oversized)).resolves.toEqual({
      error: "name must be 100 characters or fewer.",
    });

    expect(clerkProfileMocks.updateClerkUserProfile).not.toHaveBeenCalled();
  });

  it("rejects an update with neither field (400)", async () => {
    const response = await patchProfile(jsonRequest(`${BASE_URL}/profile`, {}));

    expect(response.status).toBe(400);
    await expect(bodyOf(response)).resolves.toEqual({
      error: "Provide a name or avatar preset to update.",
    });
    expect(clerkProfileMocks.updateClerkUserProfile).not.toHaveBeenCalled();
  });

  it("returns 400 in keyless/dev mode", async () => {
    clerkConfigMocks.isKeylessDevMode.mockReturnValue(true);

    const response = await patchProfile(jsonRequest(`${BASE_URL}/profile`, { name: "Alice" }));

    expect(response.status).toBe(400);
    await expect(bodyOf(response)).resolves.toEqual({
      error: "Account management is unavailable in development mode.",
    });
    expect(clerkProfileMocks.updateClerkUserProfile).not.toHaveBeenCalled();
  });

  it("scopes to authenticated user", async () => {
    authState.userId = "user_d";
    clerkConfigMocks.isKeylessDevMode.mockReturnValue(false);
    clerkProfileMocks.updateClerkUserProfile.mockResolvedValue(undefined);

    const response = await patchProfile(jsonRequest(`${BASE_URL}/profile`, { name: "Dana" }));
    expect(response.status).toBe(200);
    expect(clerkProfileMocks.updateClerkUserProfile).toHaveBeenCalledWith("user_d", { name: "Dana" });
  });
});
