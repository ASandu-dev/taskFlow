export type Priority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "done";
export type EventSource = "local" | "google";

export type EventCategory = "work" | "family" | "errands";

export interface Task {
  id: string;
  title: string;
  projectId: string;
  priority: Priority;
  status: TaskStatus;
  time?: string | null;
  date?: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
}

export interface Goal {
  id: string;
  title: string;
  progress: number;
  target: number;
  color: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  color: string;
  category?: EventCategory | null;
  source?: EventSource | string;
  externalId?: string | null;
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
}

export type TimeRange = "this-week" | "last-week" | "this-month";

export interface ProductivityData {
  [key: string]: number[];
}
