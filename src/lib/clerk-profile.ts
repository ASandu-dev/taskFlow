import { clerkClient } from "@clerk/nextjs/server";
import { isAvatarPreset } from "@/lib/avatars";
import { isClerkConfigured } from "@/lib/clerk-config";

/**
 * Thin, fail-soft wrapper around the Clerk Backend API. Every helper degrades to
 * a null/empty result when Clerk is not configured (keyless development, or a
 * misconfigured deployment) or the API call fails, so route handlers never have
 * to special-case provider outages. Callers must treat null as "unknown", never
 * as "authorized".
 */

export interface ClerkProfile {
  readonly name: string | null;
  readonly email: string | null;
  readonly emailVerified: boolean;
  /** Preset avatar id stored in publicMetadata, or null when unset/invalid. */
  readonly avatarPreset: string | null;
}

const EMPTY_PROFILE: ClerkProfile = {
  name: null,
  email: null,
  emailVerified: false,
  avatarPreset: null,
};

function displayName(user: {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}): string | null {
  const full = user.fullName?.trim();
  if (full) return full;
  const parts = [user.firstName, user.lastName].map((part) => part?.trim()).filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return user.username?.trim() || null;
}

/** Loads the caller's display name, primary email, and verification flag. */
export async function getClerkProfile(userId: string): Promise<ClerkProfile> {
  if (!isClerkConfigured()) return EMPTY_PROFILE;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const primary = user.primaryEmailAddress;
    const preset = user.publicMetadata.avatarPreset;
    return {
      name: displayName(user),
      email: primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null,
      emailVerified: primary?.verification?.status === "verified",
      // Anything other than a known preset id is treated as unset so a stale or
      // hand-edited metadata value can never reach the UI as a broken avatar.
      avatarPreset: isAvatarPreset(preset) ? preset : null,
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

/** Returns the caller's primary email (lowercased) or null when unavailable. */
export async function getClerkPrimaryEmail(userId: string): Promise<string | null> {
  const profile = await getClerkProfile(userId);
  return profile.email ? profile.email.toLowerCase() : null;
}

/**
 * Resolves every Clerk user id that owns the given email address. Invitation
 * duplicate prevention needs this because memberships store Clerk ids, not
 * emails. Returns an empty list when Clerk is unavailable or the lookup fails.
 */
export async function findClerkUserIdsByEmail(email: string): Promise<string[]> {
  if (!isClerkConfigured()) return [];
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ emailAddress: [email], limit: 10 });
    return data.map((user) => user.id);
  } catch {
    return [];
  }
}

export interface ClerkProfileUpdate {
  readonly name?: string;
  readonly avatarPreset?: string;
}

/**
 * Splits a display name on the last space so multi-word first names survive; a
 * single token becomes the first name with an empty last name.
 */
function splitDisplayName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, lastSpace), lastName: trimmed.slice(lastSpace + 1) };
}

/**
 * Updates the caller's own Clerk name and/or preset avatar. The name is set via
 * `updateUser`; the preset lives in `publicMetadata` and is written via
 * `updateUserMetadata`, which deep-merges server-side so keys owned by other
 * features survive without a read-modify-write race. When both fields change the
 * two calls run independently; a failure in either rejects so the route can
 * report the update as failed.
 */
export async function updateClerkUserProfile(
  userId: string,
  update: ClerkProfileUpdate
): Promise<void> {
  const client = await clerkClient();

  if (update.name !== undefined) {
    await client.users.updateUser(userId, splitDisplayName(update.name));
  }

  if (update.avatarPreset !== undefined) {
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { avatarPreset: update.avatarPreset },
    });
  }
}
