/**
 * Shared validation for the optional calendar-event scheduling fields. Kept
 * pure so every event route (personal and family, create and update) applies
 * identical rules.
 */

import type { EventVisibility } from "@/types";

const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const EVENT_DESCRIPTION_MAX_LENGTH = 2000;
export const EVENT_LOCATION_MAX_LENGTH = 200;

export const EVENT_VISIBILITIES: readonly EventVisibility[] = ["family", "work", "private"];

/** Narrows an untrusted value to a valid event visibility. */
export function isEventVisibility(value: unknown): value is EventVisibility {
  return typeof value === "string" && (EVENT_VISIBILITIES as readonly string[]).includes(value);
}

/** True when `value` is an HH:MM 24-hour clock time. */
export function isValidClockTime(value: string): boolean {
  return CLOCK_TIME_PATTERN.test(value);
}

/**
 * True when the runtime accepts `value` as a timezone name. Probing
 * Intl.DateTimeFormat validates IANA zones and also accepts canonical aliases
 * (e.g. "UTC") that `Intl.supportedValuesOf("timeZone")` may omit.
 */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates the optional event fields. `undefined` means "not provided" and is
 * always valid; `null` explicitly clears a value. `startTime` is the effective
 * start used to keep `endTime` strictly after `time`. Returns an error message
 * for the client, or null when everything is valid.
 */
export function validateEventOptionalFields(input: {
  readonly endTime: unknown;
  readonly description: unknown;
  readonly location: unknown;
  readonly timezone: unknown;
  readonly startTime: string | null;
}): string | null {
  const { endTime, description, location, timezone, startTime } = input;

  if (endTime !== undefined && endTime !== null) {
    if (typeof endTime !== "string" || !isValidClockTime(endTime)) {
      return "endTime must use HH:MM format or be null.";
    }
    // HH:MM strings compare chronologically under lexicographic ordering.
    if (startTime && endTime <= startTime) {
      return "endTime must be later than time.";
    }
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== "string" || description.length > EVENT_DESCRIPTION_MAX_LENGTH) {
      return `description must be ${EVENT_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
    }
  }

  if (location !== undefined && location !== null) {
    if (typeof location !== "string" || location.length > EVENT_LOCATION_MAX_LENGTH) {
      return `location must be ${EVENT_LOCATION_MAX_LENGTH} characters or fewer.`;
    }
  }

  if (timezone !== undefined && timezone !== null) {
    if (typeof timezone !== "string" || !isValidTimeZone(timezone)) {
      return "timezone must be a valid IANA timezone.";
    }
  }

  return null;
}
