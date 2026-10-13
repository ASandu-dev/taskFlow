import { createHash } from "node:crypto";
import type { EventVisibility, WorkBlock } from "@/types";

/**
 * The subset of a calendar event the visibility policy inspects. Callers pass a
 * fully loaded row; the original row is returned unchanged for events the viewer
 * may see in full.
 */
export interface ViewableEvent {
  readonly id: string;
  readonly ownerId: string | null;
  readonly familyGroupId: string | null;
  readonly visibility: EventVisibility;
  readonly date: string;
  readonly time: string;
  readonly endTime: string | null;
  readonly timezone: string | null;
}

/** Stable, non-reversible key for a sanitized work block. */
export function workBlockKey(eventId: string): string {
  return createHash("sha256").update(eventId).digest("hex").slice(0, 16);
}

/**
 * Applies the calendar visibility policy for a single viewer.
 *
 * - The owner always sees their own event in full.
 * - A family-scoped event is fully visible (the caller must have already
 *   restricted the query to families the viewer belongs to).
 * - Any other (personal) event is another member's: work events become a
 *   sanitized busy block when the owner shares availability, and private events
 *   (or unshared work events) are omitted entirely.
 *
 * Pure and framework-free so the policy can be unit tested in isolation.
 */
export function sanitizeEventForViewer<T extends ViewableEvent>(
  event: T,
  viewerId: string,
  shareWorkAvailabilityByOwner: ReadonlyMap<string, boolean>
): T | WorkBlock | null {
  if (event.ownerId === viewerId) return event;
  if (event.familyGroupId !== null) return event;
  if (event.visibility !== "work") return null;

  const shares = shareWorkAvailabilityByOwner.get(event.ownerId ?? "") ?? true;
  if (!shares) return null;

  return {
    id: null,
    key: workBlockKey(event.id),
    title: "Work",
    date: event.date,
    time: event.time,
    endTime: event.endTime,
    timezone: event.timezone,
    visibility: "work",
    source: "work-block",
  };
}

/** Collects the distinct owner ids whose work-sharing flag must be looked up. */
export function otherWorkEventOwnerIds(
  events: readonly ViewableEvent[],
  viewerId: string
): string[] {
  const ownerIds = new Set<string>();
  for (const event of events) {
    if (
      event.ownerId !== null &&
      event.ownerId !== viewerId &&
      event.familyGroupId === null &&
      event.visibility === "work"
    ) {
      ownerIds.add(event.ownerId);
    }
  }
  return [...ownerIds];
}
