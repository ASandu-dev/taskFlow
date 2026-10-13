import type { CalendarEntry, WorkBlock } from "@/types";

/** Neutral slate used for read-only work-availability blocks. */
export const WORK_BLOCK_COLOR = "#64748b";

/**
 * True for a sanitized work-availability block returned for another member's
 * work event. These carry `id: null` (the discriminant) and `source:
 * "work-block"`, and must never be edited or deleted.
 */
export function isWorkBlock(entry: CalendarEntry): entry is WorkBlock {
  return entry.id === null || entry.source === "work-block";
}

/** A stable React key for either entry shape. */
export function entryKey(entry: CalendarEntry): string {
  return isWorkBlock(entry) ? entry.key : entry.id;
}

/** The accent color for an entry; work blocks always use a neutral slate. */
export function entryColor(entry: CalendarEntry): string {
  return isWorkBlock(entry) ? WORK_BLOCK_COLOR : entry.color;
}

/** Human label for an entry; work blocks hide the underlying event title. */
export function entryTitle(entry: CalendarEntry): string {
  return isWorkBlock(entry) ? "Work" : entry.title;
}
