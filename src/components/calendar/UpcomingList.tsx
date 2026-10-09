import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Calendar, Clock } from "lucide-react";
import { formatDate, getDateKey } from "@/lib/utils";
import type { CalendarEvent } from "@/types";

interface UpcomingListProps {
  events: CalendarEvent[];
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
    return eventDate.toLocaleDateString("en-US", { weekday: "long" });
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

  return (
    <div className={cn("space-y-2", className)} role="list" aria-label="Upcoming events">
      {visibleEvents.map((event) => (
        <button
          key={event.id}
          onClick={() => onClick?.(event)}
          className={cn(
            "w-full relative flex items-center gap-3 p-3 rounded-xl",
            "bg-white border border-slate-200/60",
            "hover:border-slate-300 hover:shadow-sm",
            "transition-all duration-200",
            onClick && "cursor-pointer"
          )}
          role="listitem"
        >
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${event.color}15`, color: event.color } as React.CSSProperties}
            aria-hidden="true"
          >
            <Calendar className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{event.title}</p>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {event.time}
              </span>
              <span className="flex items-center gap-1 font-medium text-slate-600">
                {getRelativeLabel(event.date, todayKey)}
              </span>
            </div>
          </div>
          {onClick && (
            <div className="text-slate-300" aria-hidden="true">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
