export type Priority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "done";
export type EventSource = "local" | "google";

export type EventCategory = "work" | "family" | "errands";

/** Membership role within a family group. */
export type Role = "owner" | "admin" | "member" | "child";

/**
 * Visibility classification for a calendar event.
 * - `family`: shared with every member of the owning family group.
 * - `work`: personal; family members only see a generic "Work" busy block when
 *   the owner has enabled `shareWorkAvailability`.
 * - `private`: personal; never visible to anyone but the owner.
 */
export type EventVisibility = "family" | "work" | "private";

/** Default calendar page layout persisted per user. */
export type CalendarView = "month" | "week" | "day" | "agenda";

/** Lifecycle state of a family invitation, derived server-side. */
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface Task {
  id: string;
  title: string;
  projectId: string;
  priority: Priority;
  status: TaskStatus;
  time?: string | null;
  date?: string | null;
  /** Clerk user id this task is assigned to; null/absent = unassigned. */
  assigneeId?: string | null;
  /** True for a daily template whose completion is tracked per day. */
  recurring?: boolean;
  /** Clerk user id of the creator (audit metadata). */
  createdById?: string | null;
  createdAt: string;
  updatedAt?: string;
  /**
   * Only present on list responses fetched with a `date` query: whether the
   * task is completed on that day. For recurring tasks this reflects a
   * TaskCompletion row; for non-recurring tasks it reflects `status`.
   */
  completedOnDate?: boolean;
}

/** A per-day completion record for a recurring task. */
export interface TaskCompletion {
  id: string;
  taskId: string;
  /** YYYY-MM-DD day the task was completed. */
  date: string;
  /** Clerk user id of the member who completed it. */
  completedById: string;
  completedAt: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  /** Set for personal projects; null for family projects. */
  ownerId?: string | null;
  /** Set for family projects; null for personal projects. */
  familyGroupId?: string | null;
}

export interface Goal {
  id: string;
  title: string;
  progress: number;
  target: number;
  color: string;
  ownerId?: string | null;
  familyGroupId?: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  /** HH:MM; null/absent = no explicit end. */
  endTime?: string | null;
  color: string;
  category?: EventCategory | null;
  description?: string | null;
  location?: string | null;
  /** IANA timezone name; null/absent = family/local default. */
  timezone?: string | null;
  source?: EventSource | string;
  externalId?: string | null;
  /** Clerk user id of the creator (audit metadata). */
  createdById?: string | null;
  ownerId?: string | null;
  familyGroupId?: string | null;
  /** Visibility classification; family events are shared with the family. */
  visibility: EventVisibility;
  updatedAt?: string;
}

/**
 * Sanitized calendar entry returned for another family member's `work` event
 * when that owner has enabled work-availability sharing. It deliberately omits
 * every identifying/original field: `id` is null and `key` is a stable hash so
 * the client can key the block without learning the real event id.
 */
export interface WorkBlock {
  id: null;
  key: string;
  title: "Work";
  date: string;
  time: string;
  endTime: string | null;
  timezone: string | null;
  visibility: "work";
  source: "work-block";
}

/**
 * A calendar entry is either one of the viewer's own/visible events or a
 * sanitized work-availability block belonging to another family member. The
 * union makes the `id === null` case explicit so rendering code cannot treat a
 * read-only work block as an editable event.
 */
export type CalendarEntry = CalendarEvent | WorkBlock;

/** A user's persisted preference row (no id/userId — scoped to the caller). */
export interface UserSettings {
  defaultCalendarView: CalendarView;
  shareWorkAvailability: boolean;
  defaultEventClassification: EventVisibility;
  /**
   * Opt-in: when true (and the user belongs to a family) Google Calendar sync
   * imports events as family-shared events instead of personal work events.
   */
  shareSyncedEventsWithFamily: boolean;
}

/** A family invitation as returned to an owner/admin (never the token). */
export interface Invitation {
  id: string;
  email: string | null;
  role: Role;
  createdById: string;
  expiresAt: string;
  createdAt: string;
  status: InvitationStatus;
}

/** A family invitation as returned to the inviter (never includes the token). */
export interface FamilyInvitation {
  id: string;
  familyGroupId: string;
  email: string | null;
  role: Role;
  createdById: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

/** The one-time response returned when an invitation is created. */
export interface CreatedFamilyInvitation extends FamilyInvitation {
  /** Raw token — returned exactly once and never stored in plaintext. */
  token: string;
}

export interface IntegrationStatus {
  provider: string;
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  calendarId: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export interface User {
  name: string;
  plan: string;
  avatarColor: string;
  initials: string;
  imageUrl?: string | null;
  /** Preset avatar id from Clerk publicMetadata, or null when unset/invalid. */
  avatarPreset: string | null;
  /** Emoji for the preset avatar, or null when no preset is set. */
  avatarEmoji: string | null;
}

export type TimeRange = "this-week" | "last-week" | "this-month";

export interface ProductivityData {
  [key: string]: number[];
}
