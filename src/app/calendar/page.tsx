"use client";

import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Calendar as CalendarComp } from "@/components/calendar/Calendar";
import { UpcomingList } from "@/components/calendar/UpcomingList";
import { TaskList } from "@/components/tasks/TaskList";
import { useTaskStore } from "@/lib/store";
import type { CalendarEvent } from "@/types";
import { getPriorityColor } from "@/lib/utils";
import { getTasksForDate } from "@/lib/utils";

export default function CalendarPage() {
  const { tasks, toggleTask, deleteTask, events: upcomingEvents } = useTaskStore();
  const [selectedDate, setSelectedDate] = useState<string>("");

  const eventsByDate = useMemo<Record<string, CalendarEvent[]>>(() => {
    const map: Record<string, CalendarEvent[]> = {};
    tasks.forEach((t) => {
      if (t.date) {
        (map[t.date] ||= []).push({
          id: `task-${t.id}`,
          title: t.title,
          date: t.date,
          time: t.time || "00:00",
          color: getPriorityColor(t.priority),
        });
      }
    });
    upcomingEvents.forEach((event) => {
      (map[event.date] ||= []).push(event);
    });
    return map;
  }, [tasks, upcomingEvents]);

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
                        onToggle={toggleTask}
                        onEdit={() => {}}
                        onDelete={deleteTask}
                        emptyMessage="No tasks"
                      />
                    ) : selectedEvents.length === 0 ? (
                      <p className="text-sm text-slate-500 py-4 text-center">No tasks or events on this day</p>
                    ) : null}
                  </div>
                ) : (
                  <UpcomingList
                    events={upcomingEvents}
                    onClick={(e) => setSelectedDate(e.date)}
                    emptyMessage="No upcoming events"
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
