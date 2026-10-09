"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Copy,
  Check,
  Trash2,
  CalendarPlus,
  UserPlus,
  Crown,
  Circle,
} from "lucide-react";
import { useTaskStore } from "@/lib/store";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EVENT_CATEGORIES, getCategory } from "@/lib/categories";
import { formatDate, formatTime } from "@/lib/utils";
import type { CalendarEvent } from "@/types";

interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  inviteCode: string;
  adminId: string;
  isAdmin: boolean;
  createdAt: string;
  memberCount: number;
  joinedAt: string;
}

interface GroupMember {
  userId: string;
  joinedAt: string;
  name: string;
  isYou: boolean;
}

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  inviteCode: string;
  adminId: string;
  isAdmin: boolean;
  createdAt: string;
  members: GroupMember[];
  events: CalendarEvent[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON response — rely on the status.
  }
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function FamilyPage() {
  const { refresh } = useTaskStore();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selected, setSelected] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create group form
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Join form
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  // Add event form — date defaults to today at submit time (kept out of render
  // so the prerendered HTML doesn't bake in a fixed date).
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("18:00");
  const [eventCategory, setEventCategory] = useState<string>("family");
  const [addingEvent, setAddingEvent] = useState(false);

  const [copied, setCopied] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await requestJson<GroupSummary[]>("/api/family/groups");
      setGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load family groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void loadGroups();
  }, [loadGroups]);

  const selectGroup = useCallback(async (id: string) => {
    setError(null);
    try {
      const detail = await requestJson<GroupDetail>(`/api/family/groups/${id}`);
      setSelected(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the family group.");
    }
  }, []);

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const group = await requestJson<GroupSummary>("/api/family/groups", {
        method: "POST",
        body: JSON.stringify({ name: createName, description: createDescription }),
      });
      setCreateName("");
      setCreateDescription("");
      await loadGroups();
      await selectGroup(group.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the family group.");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setJoining(true);
    setError(null);
    try {
      const group = await requestJson<GroupSummary>("/api/family/groups/join", {
        method: "POST",
        body: JSON.stringify({ code: joinCode }),
      });
      setJoinCode("");
      await loadGroups();
      await selectGroup(group.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to join the family group.");
    } finally {
      setJoining(false);
    }
  }

  async function handleAddEvent() {
    if (!selected || !eventTitle.trim()) return;
    setAddingEvent(true);
    setError(null);
    try {
      await requestJson<CalendarEvent>(`/api/family/groups/${selected.id}/events`, {
        method: "POST",
        body: JSON.stringify({ title: eventTitle, date: eventDate || todayISO(), time: eventTime, category: eventCategory }),
      });
      setEventTitle("");
      await selectGroup(selected.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add the family event.");
    } finally {
      setAddingEvent(false);
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!selected) return;
    setError(null);
    try {
      await requestJson<{ ok: boolean }>(`/api/family/groups/${selected.id}/events/${eventId}`, {
        method: "DELETE",
      });
      await selectGroup(selected.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete the family event.");
    }
  }

  async function copyInviteCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — the code is still visible to copy manually.
    }
  }

  return (
    <PageLayout
      title="Family"
      description="Create a family group, share your calendar, and coordinate events together."
    >
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: your groups + create/join */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Your family groups</CardTitle>
                <CardDescription>
                  {loading ? "Loading…" : groups.length === 0 ? "You aren't in any group yet." : `${groups.length} group${groups.length === 1 ? "" : "s"}`}
                </CardDescription>
              </div>
              <Users className="h-5 w-5 text-slate-400" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              {!loading && groups.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500">
                    Create a group and share the invite code with family, or join one with a code below.
                  </p>
                </div>
              )}
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => void selectGroup(group.id)}
                  className={`block w-full text-left rounded-xl border px-4 py-3 mb-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                    selected?.id === group.id
                      ? "border-purple-400 bg-purple-50/60"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{group.name}</span>
                    {group.isAdmin ? (
                      <Badge variant="warning">
                        <Crown className="h-3 w-3 mr-1" aria-hidden="true" /> Admin
                      </Badge>
                    ) : (
                      <Badge>Member</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                    {group.description ? ` · ${group.description}` : ""}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Create a group</CardTitle>
              <CardDescription>You become the admin and can invite the rest of your family.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                label="Group name"
                placeholder="e.g. The Smith Family"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                maxLength={60}
              />
              <Input
                label="Description (optional)"
                placeholder="e.g. Household chores & events"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                maxLength={200}
              />
              <Button className="w-full" onClick={() => void handleCreate()} loading={creating} disabled={!createName.trim()}>
                <Users className="h-4 w-4" aria-hidden="true" /> Create group
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Join a group</CardTitle>
              <CardDescription>Ask the group admin for their invite code.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                label="Invite code"
                placeholder="e.g. ABC123"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={10}
              />
              <Button variant="secondary" className="w-full" onClick={() => void handleJoin()} loading={joining} disabled={!joinCode.trim()}>
                <UserPlus className="h-4 w-4" aria-hidden="true" /> Join group
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right column: selected group detail */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{selected.name}</CardTitle>
                      {selected.description && <CardDescription>{selected.description}</CardDescription>}
                    </div>
                    {selected.isAdmin && <Badge variant="warning"><Crown className="h-3 w-3 mr-1" aria-hidden="true" /> Admin</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-1.5">Invite code</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold tracking-widest text-slate-900">
                        {selected.inviteCode}
                      </code>
                      <Button variant="secondary" size="icon" onClick={() => void copyInviteCode(selected.inviteCode)} aria-label="Copy invite code">
                        {copied ? <Check className="h-4 w-4 text-green-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                      </Button>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">Share this code with family so they can join.</p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Members ({selected.members.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.members.map((member) => (
                        <span key={member.userId} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                          {member.isYou ? "You" : member.name}
                          {member.isYou && <span className="text-slate-400">· you</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Shared events</CardTitle>
                  <CardDescription>Added events appear on every member&apos;s calendar.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                    <Input
                      label="New event"
                      placeholder="e.g. Sunday dinner at Mom's"
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      maxLength={120}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="Date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                      <Input label="Time" type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
                    </div>
                    <div>
                      <p className="block text-sm font-medium text-slate-700 mb-1.5">Category</p>
                      <div className="flex flex-wrap gap-2">
                        {EVENT_CATEGORIES.map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => setEventCategory(category.id)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                              eventCategory === category.id
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <Circle className="h-2.5 w-2.5 fill-current" style={{ color: category.color }} aria-hidden="true" />
                            {category.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button className="w-full" onClick={() => void handleAddEvent()} loading={addingEvent} disabled={!eventTitle.trim()}>
                      <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Add event
                    </Button>
                  </div>

                  {selected.events.length === 0 ? (
                    <p className="text-center text-sm text-slate-500 py-6">No shared events yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {selected.events.map((event) => {
                        const category = getCategory(event.category);
                        return (
                          <li key={event.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                            <span
                              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: category?.color || event.color }}
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-900 truncate">{event.title}</p>
                              <p className="text-xs text-slate-500">
                                {formatDate(event.date, { weekday: "short", month: "short", day: "numeric" })} · {formatTime(event.time)}
                                {category ? ` · ${category.label}` : ""}
                              </p>
                            </div>
                            {selected.isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => void handleDeleteEvent(event.id)}
                                aria-label={`Delete ${event.title}`}
                                className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 mb-4">
                  <Users className="h-7 w-7 text-white" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">No group selected</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Choose a group from the list, create a new one, or join with an invite code to get started.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageLayout>
  );
}