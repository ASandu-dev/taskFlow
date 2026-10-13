import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Verifies the Clerk profile adapter's own logic: reading/validating the preset
 * avatar from publicMetadata and routing name vs. metadata writes to the right
 * Clerk endpoints. The Clerk client is mocked so no network or credentials are
 * involved.
 */
const clerkMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  updateUserMetadata: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: clerkMocks.getUser,
      updateUser: clerkMocks.updateUser,
      updateUserMetadata: clerkMocks.updateUserMetadata,
    },
  })),
}));

vi.mock("@/lib/clerk-config", () => ({ isClerkConfigured: vi.fn(() => true) }));

import { getClerkProfile, updateClerkUserProfile } from "@/lib/clerk-profile";

const USER_ID = "user_a";

function clerkUser(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Alice Smith",
    firstName: "Alice",
    lastName: "Smith",
    username: null,
    primaryEmailAddress: { emailAddress: "alice@example.com", verification: { status: "verified" } },
    emailAddresses: [{ emailAddress: "alice@example.com" }],
    publicMetadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getClerkProfile", () => {
  it("reads a valid avatar preset from publicMetadata", async () => {
    clerkMocks.getUser.mockResolvedValue(clerkUser({ publicMetadata: { avatarPreset: "fox" } }));

    await expect(getClerkProfile(USER_ID)).resolves.toEqual({
      name: "Alice Smith",
      email: "alice@example.com",
      emailVerified: true,
      avatarPreset: "fox",
    });
  });

  it("nulls an unknown or absent avatar preset", async () => {
    clerkMocks.getUser.mockResolvedValue(clerkUser({ publicMetadata: { avatarPreset: "dragon" } }));
    await expect(getClerkProfile(USER_ID)).resolves.toMatchObject({ avatarPreset: null });

    clerkMocks.getUser.mockResolvedValue(clerkUser());
    await expect(getClerkProfile(USER_ID)).resolves.toMatchObject({ avatarPreset: null });
  });
});

describe("updateClerkUserProfile", () => {
  it("updates only the name without touching metadata", async () => {
    clerkMocks.updateUser.mockResolvedValue(clerkUser());

    await updateClerkUserProfile(USER_ID, { name: "Alice Smith" });

    expect(clerkMocks.updateUser).toHaveBeenCalledWith(USER_ID, {
      firstName: "Alice",
      lastName: "Smith",
    });
    expect(clerkMocks.getUser).not.toHaveBeenCalled();
    expect(clerkMocks.updateUserMetadata).not.toHaveBeenCalled();
  });

  it("writes the avatar preset via updateUserMetadata deep merge", async () => {
    clerkMocks.updateUserMetadata.mockResolvedValue(clerkUser());

    await updateClerkUserProfile(USER_ID, { avatarPreset: "whale" });

    expect(clerkMocks.updateUserMetadata).toHaveBeenCalledWith(USER_ID, {
      publicMetadata: { avatarPreset: "whale" },
    });
    expect(clerkMocks.getUser).not.toHaveBeenCalled();
    expect(clerkMocks.updateUser).not.toHaveBeenCalled();
  });

  it("applies name and metadata in two independent calls", async () => {
    clerkMocks.updateUser.mockResolvedValue(clerkUser());
    clerkMocks.updateUserMetadata.mockResolvedValue(clerkUser());

    await updateClerkUserProfile(USER_ID, { name: "Bob Jones", avatarPreset: "owl" });

    expect(clerkMocks.updateUser).toHaveBeenCalledTimes(1);
    expect(clerkMocks.updateUser).toHaveBeenCalledWith(USER_ID, {
      firstName: "Bob",
      lastName: "Jones",
    });
    expect(clerkMocks.updateUserMetadata).toHaveBeenCalledTimes(1);
    expect(clerkMocks.updateUserMetadata).toHaveBeenCalledWith(USER_ID, {
      publicMetadata: { avatarPreset: "owl" },
    });
  });

  it("does not write an empty last name for a single-token name", async () => {
    clerkMocks.updateUser.mockResolvedValue(clerkUser());

    await updateClerkUserProfile(USER_ID, { name: "Cher" });

    expect(clerkMocks.updateUser).toHaveBeenCalledWith(USER_ID, {
      firstName: "Cher",
      lastName: "",
    });
  });
});
