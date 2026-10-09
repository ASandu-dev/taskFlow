"use client";

import { useState } from "react";
import { Calendar as CalendarComp } from "@/components/calendar/Calendar";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { UpcomingList } from "@/components/calendar/UpcomingList";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/lib/store";
import type { CalendarEvent } from "@/types";
import { Plus, CalendarClock, Trash2 } from "lucide-react";
import { getDateKey } from "@/lib/utils";
import { EVENT_CATEGORIES, getCategory, isEventCategory, type EventCategory } from "@/lib/categories";

export default function UpcomingPage() {
  const { events: upcomingEvents, addEvent, updateEvent, deleteEvent } = useTaskStore();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [category, setCategory] = useState<EventCategory>("work");

  const eventsByDate = upcomingEvents.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    (acc[e.date] ||= []).push(e);
    return acc;
  }, {});

  const openCreate = () => {
    setEditingEvent(null);
    setTitle("");
    setSelectedDate((selected) => selected || getDateKey(new Date()));
    setTime("");
    setCategory("work");
    setShowModal(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setEditingEvent(event);
    setTitle(event.title);
    setSelectedDate(event.date);
    setTime(event.time);
    setCategory(isEventCategory(event.category) ? event.category : "work");
    setShowModal(true);
  };

  const saveEvent = async () => {
    if (!title.trim() || !selectedDate) return;
    try {
      const event = {
        title: title.trim(),
        date: selectedDate,
        time: time || "00:00",
        color: getCategory(category)?.color ?? "#7c5cfc",
        category,
      };
      if (editingEvent) await updateEvent(editingEvent.id, event);
      else await addEvent(event);
      setShowModal(false);
      setEditingEvent(null);
    } catch {
      // The provider displays the request error and keeps the dialog open.
    }
  };

  return (
    <DashboardLayout>
      <PageLayout
        title="Upcoming"
        description="Events and appointments scheduled in the coming days."
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Event
          </Button>
        }
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-purple-500" aria-hidden="true" />
                  Upcoming Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <UpcomingList
                  events={upcomingEvents}
                  onClick={openEdit}
                  emptyMessage="No upcoming events"
                  hidePast
                />
              </CardContent>
            </Card>
          </div>
          <div>
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
        </div>

        <Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          title={editingEvent ? "Edit Event" : "New Event"}
          description={editingEvent ? "Update the event details." : "Add an upcoming event or appointment."}
          size="sm"
        >
          <div className="space-y-4">
            <Input label="Event title" placeholder="e.g. Team meeting" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
            <Input label="Date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} required />
            <Input label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
              <div className="flex items-center gap-2 flex-wrap">
                {EVENT_CATEGORIES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCategory(option.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-medium transition-all",
                      category === option.id
                        ? "border-purple-500 bg-purple-50 text-slate-900"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    )}
                    aria-pressed={category === option.id}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ backgroundColor: option.color }}
                      aria-hidden="true"
                    />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              {editingEvent && (
                <Button
                  variant="ghost"
                  className="mr-auto text-red-600"
                  onClick={() => {
                    if (confirm(`Delete "${editingEvent.title}"?`)) {
                      void deleteEvent(editingEvent.id).then(() => {
                        setShowModal(false);
                        setEditingEvent(null);
                      }).catch(() => {});
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </Button>
              )}
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={() => { void saveEvent(); }} disabled={!title.trim() || !selectedDate}>
                {editingEvent ? "Save Changes" : "Add Event"}
              </Button>
            </div>
          </div>
        </Modal>
      </PageLayout>
    </DashboardLayout>
  );
}
