"use client";

import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Calendar as CalendarComp } from "@/components/calendar/Calendar";
import { UpcomingList } from "@/components/calendar/UpcomingList";
import { TaskList } from "@/components/tasks/TaskList";
import { useTaskStore } from "@/lib/store";
import type { CalendarEntry } from "@/types";
import { cn, getPriorityColor } from "@/lib/utils";
import { getTasksForDate } from "@/lib/utils";

/** Client-side calendar filter. Never affects what the backend returns. */
type CalendarFilter = "all" | "family" | "work";

const FILTERS: readonly { id: CalendarFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "family", label: "Family" },
  { id: "work", label: "Work" },
];

export default function CalendarPage() {
  const { tasks, toggleTask, deleteTask, events: upcomingEvents } = useTaskStore();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [filter, setFilter] = useState<CalendarFilter>("all");

  // Filtering happens entirely in the browser; the store always holds the full
  // server response (including other members' work blocks).
  const filteredEvents = useMemo(() => {
    if (filter === "all") return upcomingEvents;
    return upcomingEvents.filter((event) => event.visibility === filter);
  }, [upcomingEvents, filter]);

  const eventsByDate = useMemo<Record<string, CalendarEntry[]>>(() => {
    const map: Record<string, CalendarEntry[]> = {};
    tasks.forEach((t) => {
      if (t.date) {
        (map[t.date] ||= []).push({
          id: `task-${t.id}`,
          title: t.title,
          date: t.date,
          time: t.time || "00:00",
          color: getPriorityColor(t.priority),
          visibility: "private",
        });
      }
    });
    filteredEvents.forEach((event) => {
      (map[event.date] ||= []).push(event);
    });
    return map;
  }, [tasks, filteredEvents]);

  const selectedTasks = useMemo(
    () => selectedDate ? getTasksForDate(tasks, selectedDate) : [],
    [tasks, selectedDate]
  );

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  return (
    <DashboardLayout>
      <PageLayout
        title="Calendar"
        description="View your schedule, tasks, and events by day."
      >
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter events"
        >
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2",
                filter === option.id
                  ? "border-purple-300 bg-purple-50 text-purple-800"
                  : "border-slate-200 bg-white text-slate-600 hover:border-purple-200 hover:bg-purple-50/40"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Calendar</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <CalendarComp
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                  eventsByDate={eventsByDate}
                />
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>
                  {selectedDate ? "Selected Day" : "Upcoming"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {selectedDate ? (
                  <div className="space-y-4">
                    {selectedEvents.length > 0 && (
                      <UpcomingList
                        events={selectedEvents}
                        onClick={(e) => setSelectedDate(e.date)}
                        emptyMessage="No events"
                      />
                    )}
                    {selectedTasks.length > 0 ? (
                      <TaskList
                        tasks={selectedTasks}
                        onToggle={(id) => { void toggleTask(id).catch(() => {}); }}
                        onDelete={(id) => {
                          if (confirm("Delete this task?")) void deleteTask(id).catch(() => {});
                        }}
                        emptyMessage="No tasks"
                      />
                    ) : selectedEvents.length === 0 ? (
                      <p className="text-sm text-slate-500 py-4 text-center">No tasks or events on this day</p>
                    ) : null}
                  </div>
                ) : (
                  <UpcomingList
                    events={filteredEvents}
                    onClick={(e) => setSelectedDate(e.date)}
                    emptyMessage="No upcoming events"
                    hidePast
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </PageLayout>
    </DashboardLayout>
  );
}
