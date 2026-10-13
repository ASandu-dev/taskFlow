import { connection, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api-response";
import { authErrorResponse, requireAuthenticatedUserId } from "@/lib/authorization";
import { isAvatarPreset } from "@/lib/avatars";
import { isKeylessDevMode } from "@/lib/clerk-config";
import { updateClerkUserProfile } from "@/lib/clerk-profile";

const MAX_NAME_LENGTH = 100;

/**
 * Updates the signed-in user's own display name and/or preset avatar in Clerk.
 * At least one field is required; every provided field is validated strictly.
 */
export async function PATCH(req: Request) {
  await connection();
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const { name, avatarPreset } = parsed.body;

  if (name === undefined && avatarPreset === undefined) {
    return NextResponse.json(
      { error: "Provide a name or avatar preset to update." },
      { status: 400 }
    );
  }

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name must be a non-empty string." }, { status: 400 });
    }
    if (name.trim().length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `name must be ${MAX_NAME_LENGTH} characters or fewer.` },
        { status: 400 }
      );
    }
  }

  if (avatarPreset !== undefined && !isAvatarPreset(avatarPreset)) {
    return NextResponse.json(
      { error: "avatarPreset must be a known avatar preset." },
      { status: 400 }
    );
  }

  try {
    const userId = await requireAuthenticatedUserId();
    // Without an identity provider there is no profile to edit; refuse rather
    // than silently pretending the change was saved.
    if (isKeylessDevMode()) {
      return NextResponse.json(
        { error: "Account management is unavailable in development mode." },
        { status: 400 }
      );
    }

    await updateClerkUserProfile(userId, {
      ...(typeof name === "string" ? { name } : {}),
      ...(avatarPreset !== undefined ? { avatarPreset } : {}),
    });

    return NextResponse.json({
      name: typeof name === "string" ? name.trim() : null,
      avatarPreset: avatarPreset ?? null,
    });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Updating profile", "Unable to update your profile.");
  }
}
