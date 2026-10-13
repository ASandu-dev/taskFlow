import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, readJsonBody } from "@/lib/api-response";
import { authErrorResponse, requireAuthenticatedUserId } from "@/lib/authorization";
import { getClerkProfile } from "@/lib/clerk-profile";
import { isEventVisibility } from "@/lib/event-validation";
import {
  getOrCreateUserSettings,
  isCalendarView,
  updateUserSettings,
  type UserSettingsUpdate,
} from "@/lib/user-settings";

/**
 * The caller's preferences, profile summary, and family memberships. Settings
 * are created on first read so the UI always receives a complete object.
 */
export async function GET() {
  await connection();
  try {
    const userId = await requireAuthenticatedUserId();
    const [settings, memberships, profile] = await Promise.all([
      getOrCreateUserSettings(userId),
      prisma.familyGroupMember.findMany({
        where: { userId },
        select: { groupId: true, role: true, group: { select: { name: true } } },
        orderBy: { joinedAt: "asc" },
      }),
      getClerkProfile(userId),
    ]);

    return NextResponse.json({
      settings,
      profile,
      families: memberships.map((membership) => ({
        id: membership.groupId,
        name: membership.group.name,
        role: membership.role,
      })),
    });
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Loading settings", "Unable to load settings.");
  }
}

/** Updates the caller's preferences. Every provided field is validated strictly. */
export async function PATCH(req: Request) {
  await connection();
  const parsed = await readJsonBody(req);
  if ("response" in parsed) return parsed.response;
  const {
    defaultCalendarView,
    shareWorkAvailability,
    defaultEventClassification,
    shareSyncedEventsWithFamily,
  } = parsed.body;

  if (defaultCalendarView !== undefined && !isCalendarView(defaultCalendarView)) {
    return NextResponse.json(
      { error: "defaultCalendarView must be one of: month, week, day, agenda." },
      { status: 400 }
    );
  }
  if (shareWorkAvailability !== undefined && typeof shareWorkAvailability !== "boolean") {
    return NextResponse.json({ error: "shareWorkAvailability must be a boolean." }, { status: 400 });
  }
  if (defaultEventClassification !== undefined && !isEventVisibility(defaultEventClassification)) {
    return NextResponse.json(
      { error: "defaultEventClassification must be one of: family, work, private." },
      { status: 400 }
    );
  }
  if (shareSyncedEventsWithFamily !== undefined && typeof shareSyncedEventsWithFamily !== "boolean") {
    return NextResponse.json(
      { error: "shareSyncedEventsWithFamily must be a boolean." },
      { status: 400 }
    );
  }
  if (
    defaultCalendarView === undefined &&
    shareWorkAvailability === undefined &&
    defaultEventClassification === undefined &&
    shareSyncedEventsWithFamily === undefined
  ) {
    return NextResponse.json({ error: "Provide a preference to update." }, { status: 400 });
  }

  const updates: UserSettingsUpdate = {
    ...(defaultCalendarView !== undefined ? { defaultCalendarView } : {}),
    ...(shareWorkAvailability !== undefined ? { shareWorkAvailability } : {}),
    ...(defaultEventClassification !== undefined ? { defaultEventClassification } : {}),
    ...(shareSyncedEventsWithFamily !== undefined ? { shareSyncedEventsWithFamily } : {}),
  };

  try {
    const userId = await requireAuthenticatedUserId();
    const settings = await updateUserSettings(userId, updates);
    return NextResponse.json(settings);
  } catch (error) {
    return authErrorResponse(error) ?? apiError(error, "Updating settings", "Unable to update settings.");
  }
}
