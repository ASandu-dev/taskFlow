import { prisma } from "@/lib/prisma";
import type { CalendarView, EventVisibility, UserSettings } from "@/types";

/**
 * Per-user preferences. The schema supplies identical defaults, but exposing
 * them here lets callers fall back to a known value without a second query and
 * keeps the API response shape and the database defaults in lock-step.
 */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  defaultCalendarView: "month",
  shareWorkAvailability: true,
  defaultEventClassification: "family",
  shareSyncedEventsWithFamily: false,
};

export const CALENDAR_VIEWS: readonly CalendarView[] = ["month", "week", "day", "agenda"];

/** Narrows an untrusted value to a valid calendar view. */
export function isCalendarView(value: unknown): value is CalendarView {
  return typeof value === "string" && (CALENDAR_VIEWS as readonly string[]).includes(value);
}

/** The mutable subset of a user's preferences. */
export interface UserSettingsUpdate {
  defaultCalendarView?: CalendarView;
  shareWorkAvailability?: boolean;
  defaultEventClassification?: EventVisibility;
  shareSyncedEventsWithFamily?: boolean;
}

const SETTINGS_SELECT = {
  defaultCalendarView: true,
  shareWorkAvailability: true,
  defaultEventClassification: true,
  shareSyncedEventsWithFamily: true,
} as const;

/**
 * Loads the caller's settings, creating a default row on first use. `update: {}`
 * makes the upsert a no-op when the row already exists, so concurrent callers
 * cannot clobber saved preferences.
 */
export async function getOrCreateUserSettings(userId: string): Promise<UserSettings> {
  return prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: SETTINGS_SELECT,
  });
}

/**
 * Persists a partial preference update, creating the row when missing. Only the
 * fields present in `updates` are written, so callers can patch a single
 * preference without touching the rest.
 */
export async function updateUserSettings(
  userId: string,
  updates: UserSettingsUpdate
): Promise<UserSettings> {
  return prisma.userSettings.upsert({
    where: { userId },
    update: updates,
    create: { userId, ...updates },
    select: SETTINGS_SELECT,
  });
}
