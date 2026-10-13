import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pure unit tests for the calendar visibility policy and the shared enum guards
 * / invitation status derivation. Prisma is mocked so the suites load without a
 * database (user-settings imports the client at module scope).
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: { upsert: vi.fn(), findMany: vi.fn() },
  },
}));

import { EVENT_VISIBILITIES, isEventVisibility } from "@/lib/event-validation";
import {
  otherWorkEventOwnerIds,
  sanitizeEventForViewer,
  workBlockKey,
  type ViewableEvent,
} from "@/lib/event-visibility";
import {
  DEFAULT_INVITATION_EXPIRY_DAYS,
  MAX_INVITATION_EXPIRY_DAYS,
  deriveInvitationStatus,
  invitationExpiryFromDays,
} from "@/lib/invitations";
import { CALENDAR_VIEWS, isCalendarView } from "@/lib/user-settings";

const VIEWER = "user_viewer";
const OTHER = "user_other";
const FAMILY = "family_1";

function event(overrides: Partial<ViewableEvent> = {}): ViewableEvent {
  return {
    id: "event_1",
    ownerId: OTHER,
    familyGroupId: null,
    visibility: "work",
    date: "2026-10-12",
    time: "09:00",
    endTime: "10:00",
    timezone: "Europe/Bucharest",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enum guards", () => {
  it("accepts only the declared visibilities", () => {
    expect(EVENT_VISIBILITIES).toEqual(["family", "work", "private"]);
    for (const value of EVENT_VISIBILITIES) expect(isEventVisibility(value)).toBe(true);
    expect(isEventVisibility("public")).toBe(false);
    expect(isEventVisibility(null)).toBe(false);
    expect(isEventVisibility(1)).toBe(false);
  });

  it("accepts only the declared calendar views", () => {
    expect(CALENDAR_VIEWS).toEqual(["month", "week", "day", "agenda"]);
    for (const value of CALENDAR_VIEWS) expect(isCalendarView(value)).toBe(true);
    expect(isCalendarView("year")).toBe(false);
    expect(isCalendarView(undefined)).toBe(false);
  });
});

describe("sanitizeEventForViewer", () => {
  const noSharing = new Map<string, boolean>();

  it("returns the owner's own event in full", () => {
    const own = event({ ownerId: VIEWER, visibility: "private" });
    expect(sanitizeEventForViewer(own, VIEWER, noSharing)).toBe(own);
  });

  it("returns a family-scoped event in full", () => {
    const familyEvent = event({ ownerId: OTHER, familyGroupId: FAMILY, visibility: "family" });
    expect(sanitizeEventForViewer(familyEvent, VIEWER, noSharing)).toBe(familyEvent);
  });

  it("turns another member's shared work event into a detail-free busy block", () => {
    const result = sanitizeEventForViewer(event(), VIEWER, new Map([[OTHER, true]]));

    expect(result).toEqual({
      id: null,
      key: workBlockKey("event_1"),
      title: "Work",
      date: "2026-10-12",
      time: "09:00",
      endTime: "10:00",
      timezone: "Europe/Bucharest",
      visibility: "work",
      source: "work-block",
    });
    // No identifying field may survive the projection.
    expect(result).not.toHaveProperty("ownerId");
    expect(result).not.toHaveProperty("color");
    expect(result).not.toHaveProperty("category");
    expect(result).not.toHaveProperty("description");
    expect(result).not.toHaveProperty("location");
    expect(result).not.toHaveProperty("createdById");
    expect(result).not.toHaveProperty("externalId");
  });

  it("omits another member's work event when sharing is disabled", () => {
    expect(sanitizeEventForViewer(event(), VIEWER, new Map([[OTHER, false]]))).toBeNull();
  });

  it("defaults a missing settings row to sharing on", () => {
    expect(sanitizeEventForViewer(event(), VIEWER, new Map())).not.toBeNull();
  });

  it("never exposes another member's private event", () => {
    expect(sanitizeEventForViewer(event({ visibility: "private" }), VIEWER, new Map([[OTHER, true]]))).toBeNull();
  });

  it("derives a stable 16-hex key without revealing the id", () => {
    const key = workBlockKey("event_1");
    expect(key).toHaveLength(16);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(key).toBe(workBlockKey("event_1"));
    expect(key).not.toBe("event_1");
  });
});

describe("otherWorkEventOwnerIds", () => {
  it("collects distinct owners of other members' work events only", () => {
    const events: ViewableEvent[] = [
      event({ id: "a", ownerId: OTHER, visibility: "work" }),
      event({ id: "b", ownerId: OTHER, visibility: "work" }),
      event({ id: "c", ownerId: "user_three", visibility: "work" }),
      event({ id: "d", ownerId: VIEWER, visibility: "work" }),
      event({ id: "e", ownerId: OTHER, visibility: "private" }),
      event({ id: "f", ownerId: OTHER, familyGroupId: FAMILY, visibility: "family" }),
    ];

    const owners = otherWorkEventOwnerIds(events, VIEWER);
    expect(owners.sort()).toEqual(["user_other", "user_three"]);
  });
});

describe("invitation lifecycle", () => {
  const now = Date.UTC(2026, 9, 12, 12, 0, 0);

  it("derives status with accepted > revoked > expired > pending precedence", () => {
    const future = new Date(now + 60_000);
    const past = new Date(now - 60_000);

    expect(deriveInvitationStatus({ usedAt: new Date(now), revokedAt: new Date(now), expiresAt: future }, now)).toBe(
      "accepted"
    );
    expect(deriveInvitationStatus({ usedAt: null, revokedAt: new Date(now), expiresAt: past }, now)).toBe("revoked");
    expect(deriveInvitationStatus({ usedAt: null, revokedAt: null, expiresAt: past }, now)).toBe("expired");
    expect(deriveInvitationStatus({ usedAt: null, revokedAt: null, expiresAt: future }, now)).toBe("pending");
  });

  it("computes expiry from the day count", () => {
    expect(DEFAULT_INVITATION_EXPIRY_DAYS).toBe(7);
    expect(MAX_INVITATION_EXPIRY_DAYS).toBe(30);
    expect(invitationExpiryFromDays(7, now).getTime()).toBe(now + 7 * 24 * 60 * 60 * 1000);
  });
});
