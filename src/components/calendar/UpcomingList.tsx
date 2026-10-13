"use client";

import { useState, useEffect } from "react";
import { cn, formatDate, formatTime, formatWeekdayLong, getDateKey } from "@/lib/utils";
import { Calendar, Clock, MapPin, Briefcase } from "lucide-react";
import { isWorkBlock, entryColor } from "@/lib/calendar-entry";
import type { CalendarEntry, CalendarEvent } from "@/types";

interface UpcomingListProps {
  events: CalendarEntry[];
  /** Called only for real, editable events — never for read-only work blocks. */
  onClick?: (event: CalendarEvent) => void;
  className?: string;
  emptyMessage?: string;
  /** Omit events dated before today (true for "Upcoming" views). */
  hidePast?: boolean;
}

function getRelativeLabel(dateStr: string, todayKey: string | null): string {
  if (!todayKey) {
    return formatDate(dateStr, { weekday: "short", month: "short", day: "numeric" });
  }
  const eventDate = new Date(dateStr);
  eventDate.setHours(0, 0, 0, 0);
  const today = new Date(todayKey);
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((eventDate.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays <= 7) {
    return formatWeekdayLong(eventDate);
  }
  return formatDate(dateStr, { weekday: "short", month: "short", day: "numeric" });
}

export function UpcomingList({ events, onClick, className, emptyMessage = "No upcoming events", hidePast = false }: UpcomingListProps) {
  // SSR-safe: `new Date()` is unstable during prerender, so resolve the
  // today-key after mount and fall back to the formatted date during SSR.
  const [todayKey, setTodayKey] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTodayKey(getDateKey(new Date()));
  }, []);

  const visibleEvents = hidePast && todayKey ? events.filter((event) => event.date >= todayKey) : events;

  if (visibleEvents.length === 0) {
    return (
      <div className={cn("py-8 text-center", className)}>
        <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-3" aria-hidden="true" />
        <p className="text-slate-500">{emptyMessage}</p>
      </div>
    );
  }

  const rowClasses =
    "relative flex w-full items-center gap-3 rounded-xl border border-slate-200/60 bg-white p-3";

  return (
    <ul className={cn("space-y-2", className)} aria-label="Upcoming events">
      {visibleEvents.map((entry) => {
        const workBlock = isWorkBlock(entry);
        const color = entryColor(entry);
        const content = (
          <>
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={
                workBlock
                  ? { backgroundColor: "#f1f5f9", color }
                  : { backgroundColor: `${color}15`, color }
              }
              aria-hidden="true"
            >
              {workBlock ? <Briefcase className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-medium truncate",
                  workBlock ? "text-slate-500" : "text-slate-900"
                )}
              >
                {workBlock ? "Work" : entry.title}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {entry.endTime ? `${formatTime(entry.time)} – ${formatTime(entry.endTime)}` : formatTime(entry.time)}
                </span>
                <span className="flex items-center gap-1 font-medium text-slate-600">
                  {getRelativeLabel(entry.date, todayKey)}
                </span>
                {!workBlock && entry.location && (
                  <span className="flex items-center gap-1 min-w-0">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{entry.location}</span>
                  </span>
                )}
                {workBlock && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Busy
                  </span>
                )}
              </div>
            </div>
            {!workBlock && onClick && (
              <div className="text-slate-300" aria-hidden="true">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            )}
          </>
        );

        return (
          <li key={workBlock ? entry.key : entry.id} className="min-w-0">
            {!workBlock && onClick ? (
              // Only render a button when the row actually does something; a
              // focusable button with no handler is a dead control. Work blocks
              // are another member's private event, so they stay static.
              <button
                type="button"
                onClick={() => onClick(entry)}
                className={cn(
                  rowClasses,
                  "text-left transition-all duration-200",
                  "hover:border-slate-300 hover:shadow-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                )}
              >
                {content}
              </button>
            ) : (
              <div className={cn(rowClasses, workBlock && "bg-slate-50/70 border-dashed")}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
