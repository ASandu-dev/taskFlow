"use client";

import { useState, useEffect } from "react";
import { Calendar as CalendarComp } from "@/components/calendar/Calendar";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { UpcomingList } from "@/components/calendar/UpcomingList";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/lib/store";
import type { CalendarEntry, CalendarEvent, EventVisibility } from "@/types";
import { Plus, CalendarClock, Trash2, AlertCircle, Lock, Users } from "lucide-react";
import { getDateKey } from "@/lib/utils";
import { EVENT_CATEGORIES, getCategory, isEventCategory, type EventCategory } from "@/lib/categories";
import { getBrowserTimeZone, getTimeZoneOptions } from "@/components/calendar/timezones";

interface VisibilityOption {
  id: EventVisibility;
  label: string;
  hint: string;
}

const VISIBILITY_OPTIONS: readonly VisibilityOption[] = [
  {
    id: "family",
    label: "Family",
    hint: "Shared with your family — this event appears on every member's calendar.",
  },
  {
    id: "work",
    label: "Work",
    hint: "Stays personal. Family members may see a generic “Work” block if you share work availability.",
  },
  {
    id: "private",
    label: "Private",
    hint: "Stays personal. Only you can see this event.",
  },
];

interface SettingsPayload {
  settings?: { defaultEventClassification?: EventVisibility };
  families?: { id: string }[];
}

export default function UpcomingPage() {
  const { events: upcomingEvents, addEvent, updateEvent, deleteEvent } = useTaskStore();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState("");
  const [category, setCategory] = useState<EventCategory>("work");
  const [visibility, setVisibility] = useState<EventVisibility>("family");
  const [formError, setFormError] = useState<string | null>(null);

  // Saved defaults from /api/settings: the preferred classification for new
  // events and the family a "family" event must be scoped to. Both are best
  // effort — the form still works if the fetch fails.
  const [defaultVisibility, setDefaultVisibility] = useState<EventVisibility>("family");
  const [familyGroupId, setFamilyGroupId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/settings");
        if (!response.ok) return;
        const payload = (await response.json()) as SettingsPayload;
        if (cancelled) return;
        if (payload.settings?.defaultEventClassification) {
          setDefaultVisibility(payload.settings.defaultEventClassification);
        }
        setFamilyGroupId(payload.families?.[0]?.id ?? null);
      } catch {
        // Keep the built-in defaults when settings are unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const eventsByDate = upcomingEvents.reduce<Record<string, CalendarEntry[]>>((acc, e) => {
    (acc[e.date] ||= []).push(e);
    return acc;
  }, {});

  // A family event must belong to a family; offer the option only when one is
  // available (and, when editing, only if the event is already family-scoped).
  const familyAvailable = editingEvent ? editingEvent.familyGroupId != null : familyGroupId !== null;

  const openCreate = () => {
    setEditingEvent(null);
    setTitle("");
    setSelectedDate((selected) => selected || getDateKey(new Date()));
    setTime("");
    setEndTime("");
    setLocation("");
    setDescription("");
    // The browser zone is only meaningful on the client, which is where this
    // handler runs.
    setTimezone(getBrowserTimeZone());
    setCategory("work");
    // Fall back to a personal classification when the saved default is "family"
    // but the user has no family to scope the event to.
    setVisibility(defaultVisibility === "family" && !familyGroupId ? "private" : defaultVisibility);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setEditingEvent(event);
    setTitle(event.title);
    setSelectedDate(event.date);
    setTime(event.time);
    setEndTime(event.endTime ?? "");
    setLocation(event.location ?? "");
    setDescription(event.description ?? "");
    setTimezone(event.timezone ?? getBrowserTimeZone());
    setCategory(isEventCategory(event.category) ? event.category : "work");
    setVisibility(event.visibility);
    setFormError(null);
    setShowModal(true);
  };

  const saveEvent = async () => {
    if (!title.trim() || !selectedDate) return;
    if (endTime && time && endTime <= time) {
      setFormError("End time must be later than the start time.");
      return;
    }
    setFormError(null);
    try {
      const event: Omit<CalendarEvent, "id"> = {
        title: title.trim(),
        date: selectedDate,
        time: time || "00:00",
        color: getCategory(category)?.color ?? "#7c5cfc",
        category,
        endTime: endTime || null,
        location: location.trim() || null,
        description: description.trim() || null,
        timezone: timezone || null,
        visibility,
        // Scope new family events to the user's first family. (The backend
        // rejects a family event without a family.)
        ...(!editingEvent && visibility === "family" && familyGroupId
          ? { familyGroupId }
          : {}),
      };
      if (editingEvent) await updateEvent(editingEvent.id, event);
      else await addEvent(event);
      setShowModal(false);
      setEditingEvent(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save the event.");
    }
  };

  const activeVisibility = VISIBILITY_OPTIONS.find((option) => option.id === visibility) ?? VISIBILITY_OPTIONS[1]!;

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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Starts" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              <Input label="Ends (optional)" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <Input
              label="Location (optional)"
              placeholder="e.g. Meeting room 2"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
            />
            <div>
              <label htmlFor="event-timezone" className="block text-sm font-medium text-slate-700 mb-1.5">
                Timezone
              </label>
              <select
                id="event-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 hover:border-slate-300 transition-colors"
              >
                {getTimeZoneOptions(timezone).map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </select>
            </div>
            <Textarea
              label="Description (optional)"
              placeholder="Add notes or details for this event"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              className="min-h-20"
            />
            <div>
              <p id="event-category-label" className="mb-2 block text-sm font-medium text-slate-700">
                Category
              </p>
              <div className="flex items-center gap-2 flex-wrap" role="group" aria-labelledby="event-category-label">
                {EVENT_CATEGORIES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCategory(option.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2",
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
            <div>
              <p id="event-visibility-label" className="mb-2 block text-sm font-medium text-slate-700">
                Visibility
              </p>
              <div className="flex items-center gap-2 flex-wrap" role="group" aria-labelledby="event-visibility-label">
                {VISIBILITY_OPTIONS.map((option) => {
                  const disabled = option.id === "family" && !familyAvailable;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setVisibility(option.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2",
                        disabled && "cursor-not-allowed opacity-40",
                        visibility === option.id
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      )}
                      aria-pressed={visibility === option.id}
                    >
                      {option.id === "family" ? (
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {!familyAvailable && visibility === "family"
                  ? "Join a family before creating a family event."
                  : activeVisibility.hint}
              </p>
            </div>
            {formError && (
              <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {formError}
              </p>
            )}
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
