"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Baby,
  CalendarDays,
  CalendarPlus,
  Check,
  Circle,
  Copy,
  Crown,
  Link2,
  LogOut,
  Mail,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { useTaskStore } from "@/lib/store";
import { invalidateFamilyMembers } from "@/components/tasks/family-members";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EVENT_CATEGORIES, getCategory } from "@/lib/categories";
import { formatDate, formatTime, getDateKey, cn } from "@/lib/utils";
import { getBrowserTimeZone, getTimeZoneOptions } from "@/components/calendar/timezones";
import type { CalendarEvent, InvitationStatus, Role } from "@/types";

interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  inviteCode: string;
  adminId: string;
  role: Role;
  isAdmin: boolean;
  createdAt: string;
  memberCount?: number;
  joinedAt?: string;
}

interface GroupMember {
  userId: string;
  joinedAt: string;
  role: Role;
  name: string;
  isYou: boolean;
}

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  inviteCode: string;
  adminId: string;
  role: Role;
  isAdmin: boolean;
  createdAt: string;
  members: GroupMember[];
  events: CalendarEvent[];
}

interface Invitation {
  id: string;
  familyGroupId: string;
  email: string | null;
  role: Role;
  createdById: string;
  expiresAt: string;
  createdAt: string;
  /** Server-derived lifecycle state. */
  status: InvitationStatus;
}

interface CreatedInvitation extends Invitation {
  /** Raw token — returned once at creation and never retrievable again. */
  token: string;
}

/** Error carrying the HTTP status so callers can map failures to friendly copy. */
class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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
    const message =
      (body as { error?: string } | null)?.error || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

/**
 * Member endpoints return a specific, already user-facing message for 400s
 * (e.g. "Transfer ownership to another member before leaving.") so those are
 * passed through. 403/404 are mapped to wording that does not assume the user
 * knows what changed server-side.
 */
function friendlyMemberError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return "You do not have permission to manage this family's members.";
    }
    if (err.status === 404) {
      return "That member is no longer part of this family. Refresh to see the latest list.";
    }
    if (err.status === 400) return err.message;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Group detail plus the admin-only invitation list, fetched together. */
async function fetchGroupDetail(
  groupId: string
): Promise<{ detail: GroupDetail; invitations: Invitation[] }> {
  const detail = await requestJson<GroupDetail>(`/api/family/groups/${groupId}`);
  let invitations: Invitation[] = [];
  if (detail.isAdmin) {
    invitations = await requestJson<Invitation[]>(
      `/api/family/invitations?familyGroupId=${encodeURIComponent(groupId)}`
    );
  }
  return { detail, invitations };
}

function roleLabel(role: Role): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function InvitationStatusBadge({ status }: { status: InvitationStatus }) {
  if (status === "accepted") return <Badge variant="success">Accepted</Badge>;
  if (status === "expired") return <Badge>Expired</Badge>;
  if (status === "revoked") {
    return <Badge className="bg-slate-100 text-slate-400">Revoked</Badge>;
  }
  return <Badge variant="warning">Pending</Badge>;
}

function RoleBadge({ role }: { role: Role }) {
  if (role === "owner") {
    return (
      <Badge variant="warning">
        <Crown className="mr-1 h-3 w-3" aria-hidden="true" /> Owner
      </Badge>
    );
  }
  if (role === "admin") {
    return (
      <Badge variant="warning">
        <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" /> Admin
      </Badge>
    );
  }
  if (role === "child") {
    return (
      <Badge variant="success">
        <Baby className="mr-1 h-3 w-3" aria-hidden="true" /> Child
      </Badge>
    );
  }
  return (
    <Badge variant="default">
      <User className="mr-1 h-3 w-3" aria-hidden="true" /> Member
    </Badge>
  );
}

interface MemberRowProps {
  member: GroupMember;
  currentRole: Role;
  onRemove: (member: GroupMember) => void;
  onTransfer: (member: GroupMember) => void;
}

function MemberRow({ member, currentRole, onRemove, onTransfer }: MemberRowProps) {
  const isAdmin = currentRole === "owner" || currentRole === "admin";
  // The backend refuses removing the owner and self-removal; hide those anyway
  // so the UI never offers an action the server will reject.
  const canRemove = isAdmin && !member.isYou && member.role !== "owner";
  const canTransfer = currentRole === "owner" && !member.isYou && member.role !== "owner";

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium text-slate-900">{member.name}</span>
        {member.isYou && (
          <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700">
            You
          </span>
        )}
      </div>
      <RoleBadge role={member.role} />
      {canTransfer && (
        <Button
          variant="secondary"
          size="sm"
          className="min-h-11"
          onClick={() => onTransfer(member)}
          aria-label={`Transfer ownership to ${member.name}`}
        >
          <Crown className="h-4 w-4" aria-hidden="true" />
          Transfer
        </Button>
      )}
      {canRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 text-slate-500 hover:bg-red-50 hover:text-red-600"
          onClick={() => onRemove(member)}
          aria-label={`Remove ${member.name} from the family`}
        >
          <UserMinus className="h-4 w-4" aria-hidden="true" />
          Remove
        </Button>
      )}
    </li>
  );
}

interface CreateFamilyCardProps {
  creating: boolean;
  onCreate: (name: string, description: string) => Promise<boolean>;
}

function CreateFamilyCard({ creating, onCreate }: CreateFamilyCardProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <Users className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <CardTitle>Create a family</CardTitle>
          <CardDescription>Start a shared space and invite your family.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-3">
        <Input
          label="Family name"
          placeholder="e.g. The Smith Family"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
        />
        <Input
          label="Description (optional)"
          placeholder="e.g. Household chores & events"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
        />
        <Button
          className="mt-auto w-full"
          loading={creating}
          disabled={!name.trim()}
          onClick={() => {
            void onCreate(name, description).then((ok) => {
              if (ok) {
                setName("");
                setDescription("");
              }
            });
          }}
        >
          <Users className="h-4 w-4" aria-hidden="true" /> Create family
        </Button>
      </CardContent>
    </Card>
  );
}

interface JoinFamilyCardProps {
  joining: boolean;
  onJoin: (token: string) => Promise<boolean>;
}

function JoinFamilyCard({ joining, onJoin }: JoinFamilyCardProps) {
  const [token, setToken] = useState("");
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <Link2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <CardTitle>Join with an invitation</CardTitle>
          <CardDescription>Paste the invitation token you were sent.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-3">
        <Input
          label="Invitation token"
          placeholder="Paste your invitation token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          hint="Invitation tokens are long and unique — copy the whole thing."
        />
        <Button
          variant="secondary"
          className="mt-auto w-full border-sky-200 text-sky-800 hover:border-sky-300 hover:bg-sky-50"
          loading={joining}
          disabled={!token.trim()}
          onClick={() => {
            void onJoin(token).then((ok) => {
              if (ok) setToken("");
            });
          }}
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" /> Join family
        </Button>
      </CardContent>
    </Card>
  );
}

export default function FamilyPage() {
  const { refresh } = useTaskStore();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);

  // Member management: remove/transfer targets and the leave confirmation.
  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null);
  const [transferTarget, setTransferTarget] = useState<GroupMember | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState<"remove" | "transfer" | "leave" | null>(null);
  const [copied, setCopied] = useState<"token" | "code" | "link" | null>(null);

  // Family rename
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameDescription, setRenameDescription] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // Invitation form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");

  // Family event form
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("18:00");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventTimezone, setEventTimezone] = useState("");
  const [eventCategory, setEventCategory] = useState<string>("family");
  const [addingEvent, setAddingEvent] = useState(false);

  const selectedGroup = groups.find((group) => group.id === selectedId) ?? null;
  const activeRef = useRef<string | null>(null);

  const loadGroups = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setGroupsError(null);
    try {
      const data = await requestJson<GroupSummary[]>("/api/family/groups");
      setGroups(data);
      setSelectedId((current) => current ?? data[0]?.id ?? null);
    } catch (err) {
      setGroupsError(err instanceof Error ? err.message : "Unable to load your families.");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void loadGroups();
  }, [loadGroups]);

  const loadInvitations = useCallback(async (groupId: string) => {
    const data = await requestJson<Invitation[]>(
      `/api/family/invitations?familyGroupId=${encodeURIComponent(groupId)}`
    );
    setInvitations(data);
  }, []);

  // Re-fetch the selected group's detail without the full-page loading state.
  const refreshSelected = useCallback(async (groupId: string) => {
    const loaded = await fetchGroupDetail(groupId);
    if (activeRef.current === groupId) {
      setDetail(loaded.detail);
      setInvitations(loaded.invitations);
    }
  }, []);

  // Load the selected group's members, events, and (for admins) invitations.
  useEffect(() => {
    if (!selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale detail
      setDetail(null);
      setInvitations([]);
      return;
    }
    activeRef.current = selectedId;
    setDetailLoading(true);
    setError(null);
    setMembersError(null);
    void (async () => {
      try {
        const loaded = await fetchGroupDetail(selectedId);
        if (activeRef.current !== selectedId) return;
        setDetail(loaded.detail);
        setInvitations(loaded.invitations);
      } catch (err) {
        if (activeRef.current === selectedId) {
          setError(err instanceof Error ? err.message : "Unable to load the family group.");
        }
      } finally {
        if (activeRef.current === selectedId) setDetailLoading(false);
      }
    })();
  }, [selectedId]);

  const selectGroup = useCallback((id: string) => {
    setCreatedInvitation(null);
    setRevokeTarget(null);
    setRemoveTarget(null);
    setTransferTarget(null);
    setLeaveOpen(false);
    setMembersError(null);
    setError(null);
    setRenameOpen(false);
    setSelectedId(id);
  }, []);

  const handleCreate = useCallback(
    async (name: string, description: string): Promise<boolean> => {
      if (!name.trim()) return false;
      setCreating(true);
      setError(null);
      try {
        const group = await requestJson<GroupSummary>("/api/family/groups", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        });
        await loadGroups();
        selectGroup(group.id);
        refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to create the family.");
        return false;
      } finally {
        setCreating(false);
      }
    },
    [loadGroups, refresh, selectGroup]
  );

  const handleJoin = useCallback(
    async (token: string): Promise<boolean> => {
      if (!token.trim()) return false;
      setJoining(true);
      setError(null);
      try {
        const group = await requestJson<GroupSummary>("/api/family/groups/join", {
          method: "POST",
          body: JSON.stringify({ token: token.trim() }),
        });
        await loadGroups();
        selectGroup(group.id);
        refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to join the family.");
        return false;
      } finally {
        setJoining(false);
      }
    },
    [loadGroups, refresh, selectGroup]
  );

  const handleCreateInvitation = useCallback(async () => {
    if (!detail) return;
    setCreatingInvite(true);
    setError(null);
    try {
      const created = await requestJson<CreatedInvitation>("/api/family/invitations", {
        method: "POST",
        body: JSON.stringify({
          familyGroupId: detail.id,
          email: inviteEmail.trim() || undefined,
          role: inviteRole,
        }),
      });
      setCreatedInvitation(created);
      setInviteEmail("");
      await loadInvitations(detail.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the invitation.");
    } finally {
      setCreatingInvite(false);
    }
  }, [detail, inviteEmail, inviteRole, loadInvitations]);

  const handleRevoke = useCallback(async () => {
    if (!revokeTarget || !detail) return;
    setRevoking(true);
    setError(null);
    try {
      await requestJson<{ ok: boolean }>(`/api/family/invitations/${revokeTarget.id}`, {
        method: "DELETE",
      });
      setRevokeTarget(null);
      await loadInvitations(detail.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke the invitation.");
    } finally {
      setRevoking(false);
    }
  }, [revokeTarget, detail, loadInvitations]);

  // Re-issue a pending email-bound invitation. The replacement token is shown
  // in the copy-once panel and the list is refreshed (the old row is revoked).
  const handleResend = useCallback(
    async (invitation: Invitation) => {
      if (!detail) return;
      setResendingId(invitation.id);
      setError(null);
      try {
        const created = await requestJson<CreatedInvitation>(
          `/api/family/invitations/${invitation.id}/resend`,
          { method: "POST" }
        );
        setCreatedInvitation(created);
        await loadInvitations(detail.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to resend the invitation.");
      } finally {
        setResendingId(null);
      }
    },
    [detail, loadInvitations]
  );

  const openRename = useCallback(() => {
    if (!detail) return;
    setRenameName(detail.name);
    setRenameDescription(detail.description ?? "");
    setRenameError(null);
    setRenameOpen(true);
  }, [detail]);

  const handleRename = useCallback(async () => {
    if (!detail || !renameName.trim()) return;
    const groupId = detail.id;
    setRenameBusy(true);
    setRenameError(null);
    try {
      const saved = await requestJson<{ id: string; name: string; description: string | null }>(
        `/api/family/groups/${groupId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: renameName.trim(),
            description: renameDescription.trim() || null,
          }),
        }
      );
      setDetail((current) =>
        current && current.id === groupId
          ? { ...current, name: saved.name, description: saved.description }
          : current
      );
      setRenameOpen(false);
      await loadGroups({ silent: true });
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Unable to update the family.");
    } finally {
      setRenameBusy(false);
    }
  }, [detail, renameName, renameDescription, loadGroups]);

  const handleRemoveMember = useCallback(async () => {
    if (!removeTarget || !detail) return;
    const groupId = detail.id;
    setMemberBusy("remove");
    setMembersError(null);
    try {
      await requestJson<{ ok: boolean }>(
        `/api/family/groups/${groupId}/members/${encodeURIComponent(removeTarget.userId)}`,
        { method: "DELETE" }
      );
      setRemoveTarget(null);
      // The removed member may still be cached for task assignment options.
      invalidateFamilyMembers(groupId);
      await refreshSelected(groupId);
      await loadGroups({ silent: true });
      refresh();
    } catch (err) {
      setMembersError(friendlyMemberError(err, "Unable to remove this member. Please try again."));
    } finally {
      setMemberBusy(null);
    }
  }, [removeTarget, detail, refreshSelected, loadGroups, refresh]);

  const handleTransfer = useCallback(async () => {
    if (!transferTarget || !detail) return;
    const groupId = detail.id;
    setMemberBusy("transfer");
    setMembersError(null);
    try {
      await requestJson<{ id: string; name: string; adminId: string; role: Role }>(
        `/api/family/groups/${groupId}/transfer`,
        { method: "POST", body: JSON.stringify({ userId: transferTarget.userId }) }
      );
      setTransferTarget(null);
      await refreshSelected(groupId);
      await loadGroups({ silent: true });
      refresh();
    } catch (err) {
      setMembersError(friendlyMemberError(err, "Unable to transfer ownership. Please try again."));
    } finally {
      setMemberBusy(null);
    }
  }, [transferTarget, detail, refreshSelected, loadGroups, refresh]);

  const handleLeave = useCallback(async () => {
    if (!detail) return;
    const groupId = detail.id;
    setMemberBusy("leave");
    setMembersError(null);
    try {
      await requestJson<{ ok: boolean }>(`/api/family/groups/${groupId}/leave`, {
        method: "POST",
      });
      setLeaveOpen(false);
      invalidateFamilyMembers(groupId);
      // Drop the now-inaccessible group and select whatever remains.
      setCreatedInvitation(null);
      setRevokeTarget(null);
      setDetail(null);
      setInvitations([]);
      setSelectedId(null);
      await loadGroups();
      refresh();
    } catch (err) {
      setMembersError(friendlyMemberError(err, "Unable to leave this family. Please try again."));
    } finally {
      setMemberBusy(null);
    }
  }, [detail, loadGroups, refresh]);

  const copyText = useCallback(async (text: string, which: "token" | "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard unavailable — the value is still selectable on screen.
    }
  }, []);

  // Convenience wrapper: the raw token is still shown, but sharing the full
  // /join link is easier for the recipient.
  const copyInviteLink = useCallback(
    async (token: string) => {
      const link = `${window.location.origin}/join?token=${encodeURIComponent(token)}`;
      await copyText(link, "link");
    },
    [copyText]
  );

  async function handleAddEvent() {
    if (!detail || !eventTitle.trim()) return;
    setAddingEvent(true);
    setError(null);
    try {
      await requestJson<CalendarEvent>(`/api/family/groups/${detail.id}/events`, {
        method: "POST",
        body: JSON.stringify({
          title: eventTitle,
          date: eventDate || getDateKey(new Date()),
          time: eventTime,
          endTime: eventEndTime || undefined,
          location: eventLocation.trim() || undefined,
          timezone: eventTimezone || undefined,
          category: eventCategory,
        }),
      });
      setEventTitle("");
      setEventEndTime("");
      setEventLocation("");
      const refreshed = await requestJson<GroupDetail>(`/api/family/groups/${detail.id}`);
      if (activeRef.current === detail.id) setDetail(refreshed);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add the family event.");
    } finally {
      setAddingEvent(false);
    }
  }

  async function handleDeleteEvent(event: CalendarEvent) {
    if (!detail) return;
    if (!confirm(`Delete "${event.title}" for everyone in this family?`)) return;
    setError(null);
    try {
      await requestJson<{ ok: boolean }>(`/api/family/groups/${detail.id}/events/${event.id}`, {
        method: "DELETE",
      });
      const refreshed = await requestJson<GroupDetail>(`/api/family/groups/${detail.id}`);
      if (activeRef.current === detail.id) setDetail(refreshed);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete the family event.");
    }
  }

  // Resolve the browser timezone after mount so SSR and the first client render
  // agree (server timezone !== browser timezone).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value
    setEventTimezone((current) => current || getBrowserTimeZone());
  }, []);

  return (
    <DashboardLayout>
      <PageLayout
        title="Family"
        description="Create a family, invite the people you love, and plan together."
      >
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-violet-600 via-purple-600 to-indigo-700 px-6 py-7 text-white shadow-lg shadow-purple-900/15 sm:px-8">
          <div
            className="pointer-events-none absolute -right-8 -top-16 h-56 w-56 rounded-full border-28 border-white/10"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-20 right-36 h-40 w-40 rounded-full bg-white/5 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-purple-100">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Together is better
              </span>
              <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                Make room for the moments that matter.
              </h2>
              <p className="mt-2 text-sm leading-6 text-purple-100">
                Bring everyone onto one shared calendar and keep your family plans in sync.
              </p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-inner sm:mr-5">
              <Users className="h-8 w-8" aria-hidden="true" />
            </div>
          </div>
        </div>

        {error && (
          <div
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {groupsError ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-red-300" aria-hidden="true" />
              <p className="mt-4 text-lg font-semibold text-slate-800">We couldn&#39;t load your families</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{groupsError}</p>
              <Button className="mt-5" onClick={() => void loadGroups()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" aria-label="Loading families">
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70" />
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70" />
          </div>
        ) : groups.length === 0 ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-7 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white text-purple-600 shadow-sm ring-1 ring-slate-200/70">
                <Users className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="mt-3 text-base font-semibold text-slate-800">Your family space starts here</p>
              <p className="mx-auto mt-1 max-w-md text-sm leading-5 text-slate-500">
                Create a new family and invite members, or join one with an invitation token.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <CreateFamilyCard creating={creating} onCreate={handleCreate} />
              <JoinFamilyCard joining={joining} onJoin={handleJoin} />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.length > 1 && (
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Your families">
                {groups.map((group) => {
                  const isActive = group.id === selectedId;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => selectGroup(group.id)}
                      className={
                        "rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 " +
                        (isActive
                          ? "border-purple-300 bg-purple-50 text-purple-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-purple-200 hover:bg-purple-50/40")
                      }
                    >
                      {group.name}
                    </button>
                  );
                })}
              </div>
            )}

            {detailLoading && !detail ? (
              <div className="h-72 animate-pulse rounded-2xl bg-slate-200/70" aria-label="Loading family" />
            ) : detail ? (
              <div className="space-y-6">
                <Card className="overflow-hidden">
                  <CardHeader className="bg-linear-to-r from-purple-50/80 via-white to-white">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                          <Users className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 pt-0.5">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <CardTitle className="truncate">{detail.name}</CardTitle>
                            {detail.isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 min-h-0 w-8 min-w-0 shrink-0 text-slate-400 hover:text-slate-700"
                                onClick={openRename}
                                aria-label={`Edit ${detail.name}`}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                          {detail.description && <CardDescription>{detail.description}</CardDescription>}
                        </div>
                      </div>
                      <RoleBadge role={detail.role} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="mb-2 text-sm font-semibold text-slate-800">
                        Members <span className="font-normal text-slate-500">({detail.members.length})</span>
                      </p>
                      {membersError && (
                        <div
                          className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                          role="alert"
                        >
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{membersError}</span>
                        </div>
                      )}
                      {detail.members.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-center text-sm text-slate-500">
                          No members yet.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {detail.members.map((member) => (
                            <MemberRow
                              key={member.userId}
                              member={member}
                              currentRole={detail.role}
                              onRemove={setRemoveTarget}
                              onTransfer={setTransferTarget}
                            />
                          ))}
                        </ul>
                      )}

                      <div className="mt-4 border-t border-slate-200/60 pt-4">
                        {detail.role === "owner" ? (
                          <div className="space-y-1">
                            <Button
                              variant="ghost"
                              className="min-h-11 w-full justify-start text-slate-500"
                              aria-describedby="leave-owner-hint"
                              onClick={() =>
                                setMembersError(
                                  "You own this family. Transfer ownership to another member before you can leave."
                                )
                              }
                            >
                              <LogOut className="h-4 w-4" aria-hidden="true" /> Leave family
                            </Button>
                            <p id="leave-owner-hint" className="text-xs text-slate-500">
                              You own this family. Transfer ownership to another member before leaving.
                            </p>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            className="min-h-11 w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => {
                              setMembersError(null);
                              setLeaveOpen(true);
                            }}
                          >
                            <LogOut className="h-4 w-4" aria-hidden="true" /> Leave family
                          </Button>
                        )}
                      </div>
                    </div>

                    {detail.isAdmin && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                        <p className="text-xs font-medium text-slate-500">
                          Legacy invite code (for reference only)
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <code className="select-all text-sm font-bold tracking-[0.2em] text-slate-600">
                            {detail.inviteCode}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void copyText(detail.inviteCode, "code")}
                            aria-label="Copy legacy invite code"
                            className="h-7 w-7"
                          >
                            {copied === "code" ? (
                              <Check className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </Button>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          This code can no longer be used to join. Use an invitation below instead.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {detail.isAdmin && (
                  <Card className="overflow-hidden">
                    <CardHeader className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                        <UserPlus className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <CardTitle>Invite people</CardTitle>
                        <CardDescription>
                          Generate a single-use invitation token. Only owners and admins can invite.
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                        <Input
                          label="Email (optional)"
                          type="email"
                          placeholder="name@example.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          maxLength={254}
                          hint="Optional — a note for your records. The token works for anyone who has it."
                        />
                        <div>
                          <label htmlFor="invite-role" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Role
                          </label>
                          <select
                            id="invite-role"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as Role)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 transition-colors hover:border-slate-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                          >
                            <option value="member">Member</option>
                            <option value="child">Child</option>
                          </select>
                        </div>
                        <Button className="w-full" loading={creatingInvite} onClick={() => void handleCreateInvitation()}>
                          <Link2 className="h-4 w-4" aria-hidden="true" /> Create invitation
                        </Button>
                      </div>

                      {createdInvitation && (
                        <div
                          role="status"
                          className="rounded-2xl border-2 border-purple-200 bg-purple-50 p-4"
                        >
                          <div className="flex items-start gap-2">
                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-purple-900">
                                Invitation ready for {roleLabel(createdInvitation.role).toLowerCase()}
                              </p>
                              <p className="mt-0.5 text-xs text-purple-700">
                                Copy this token now — for security it is shown only once.
                              </p>
                              <div className="mt-3 space-y-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    readOnly
                                    value={createdInvitation.token}
                                    aria-label="Invitation token"
                                    onFocus={(e) => e.currentTarget.select()}
                                    className="min-w-0 flex-1 rounded-xl border border-purple-200 bg-white px-3 py-2 font-mono text-xs text-purple-900"
                                  />
                                  <Button
                                    variant="secondary"
                                    onClick={() => void copyText(createdInvitation.token, "token")}
                                  >
                                    {copied === "token" ? (
                                      <>
                                        <Check className="h-4 w-4 text-green-600" aria-hidden="true" /> Copied
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-4 w-4" aria-hidden="true" /> Copy
                                      </>
                                    )}
                                  </Button>
                                </div>
                                <Button
                                  variant="secondary"
                                  className="w-full"
                                  onClick={() => void copyInviteLink(createdInvitation.token)}
                                >
                                  {copied === "link" ? (
                                    <>
                                      <Check className="h-4 w-4 text-green-600" aria-hidden="true" /> Link copied
                                    </>
                                  ) : (
                                    <>
                                      <Link2 className="h-4 w-4" aria-hidden="true" /> Copy invite link
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="mb-2 text-sm font-semibold text-slate-800">
                          Invitations{" "}
                          <span className="font-normal text-slate-500">({invitations.length})</span>
                        </p>
                        {invitations.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                            No invitations yet.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {invitations.map((invitation) => {
                              const isPending = invitation.status === "pending";
                              const isRevoked = invitation.status === "revoked";
                              return (
                                <li
                                  key={invitation.id}
                                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p
                                        className={cn(
                                          "truncate text-sm font-medium",
                                          isRevoked ? "text-slate-400 line-through" : "text-slate-900"
                                        )}
                                      >
                                        {invitation.email || "Anyone with the token"}
                                      </p>
                                      <InvitationStatusBadge status={invitation.status} />
                                    </div>
                                    <p className="text-xs text-slate-500">
                                      {roleLabel(invitation.role)} ·{" "}
                                      {invitation.status === "expired"
                                        ? `expired ${formatDate(invitation.expiresAt, { month: "short", day: "numeric", year: "numeric" })}`
                                        : `expires ${formatDate(invitation.expiresAt, { month: "short", day: "numeric", year: "numeric" })}`}
                                    </p>
                                  </div>
                                  {isPending && invitation.email && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      loading={resendingId === invitation.id}
                                      disabled={resendingId !== null}
                                      onClick={() => void handleResend(invitation)}
                                      aria-label={`Resend invitation to ${invitation.email}`}
                                      className="text-slate-500 hover:bg-purple-50 hover:text-purple-700"
                                    >
                                      <Mail className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                  )}
                                  {isPending && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setRevokeTarget(invitation)}
                                      aria-label={`Revoke invitation for ${invitation.email || "anyone with the token"}`}
                                      className="text-slate-500 hover:bg-red-50 hover:text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="overflow-hidden">
                  <CardHeader className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <CalendarDays className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <CardTitle>Shared events</CardTitle>
                      <CardDescription>Plans added here appear on every member&#39;s calendar.</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <Input
                        label="New event"
                        placeholder="e.g. Sunday dinner at Mom's"
                        value={eventTitle}
                        onChange={(e) => setEventTitle(e.target.value)}
                        maxLength={120}
                      />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                          label="Date"
                          type="date"
                          value={eventDate}
                          onChange={(e) => setEventDate(e.target.value)}
                        />
                        <Input
                          label="Starts"
                          type="time"
                          value={eventTime}
                          onChange={(e) => setEventTime(e.target.value)}
                        />
                        <Input
                          label="Ends (optional)"
                          type="time"
                          value={eventEndTime}
                          onChange={(e) => setEventEndTime(e.target.value)}
                        />
                        <Input
                          label="Location (optional)"
                          placeholder="e.g. Grandma's house"
                          value={eventLocation}
                          onChange={(e) => setEventLocation(e.target.value)}
                          maxLength={200}
                        />
                      </div>
                      <div>
                        <label htmlFor="event-timezone" className="mb-1.5 block text-sm font-medium text-slate-700">
                          Timezone
                        </label>
                        <select
                          id="event-timezone"
                          value={eventTimezone}
                          onChange={(e) => setEventTimezone(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 transition-colors hover:border-slate-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                        >
                          {getTimeZoneOptions(eventTimezone).map((zone) => (
                            <option key={zone.value} value={zone.value}>
                              {zone.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <p className="mb-1.5 block text-sm font-medium text-slate-700">Category</p>
                        <div className="flex flex-wrap gap-2">
                          {EVENT_CATEGORIES.map((category) => (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => setEventCategory(category.id)}
                              className={
                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 " +
                                (eventCategory === category.id
                                  ? "border-slate-900 bg-slate-900 text-white"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                              }
                              aria-pressed={eventCategory === category.id}
                            >
                              <Circle
                                className="h-2.5 w-2.5 fill-current"
                                style={{ color: category.color }}
                                aria-hidden="true"
                              />
                              {category.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => void handleAddEvent()}
                        loading={addingEvent}
                        disabled={!eventTitle.trim()}
                      >
                        <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Add event
                      </Button>
                    </div>

                    {detail.events.length === 0 ? (
                      <p className="py-6 text-center text-sm text-slate-500">No shared events yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {detail.events.map((event) => {
                          const category = getCategory(event.category);
                          return (
                            <li
                              key={event.id}
                              className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"
                            >
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: category?.color || event.color }}
                                aria-hidden="true"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-900">{event.title}</p>
                                <p className="truncate text-xs text-slate-500">
                                  {formatDate(event.date, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
                                  {formatTime(event.time)}
                                  {event.endTime ? `–${formatTime(event.endTime)}` : ""}
                                  {event.location ? ` · ${event.location}` : ""}
                                  {category ? ` · ${category.label}` : ""}
                                </p>
                              </div>
                              {detail.isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => void handleDeleteEvent(event)}
                                  aria-label={`Delete ${event.title}`}
                                  className="text-slate-500 hover:bg-red-50 hover:text-red-600"
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

                <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <summary className="cursor-pointer rounded-2xl px-5 py-4 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">
                    Create or join another family
                  </summary>
                  <div className="grid grid-cols-1 gap-6 border-t border-slate-200/60 p-5 lg:grid-cols-2">
                    <CreateFamilyCard creating={creating} onCreate={handleCreate} />
                    <JoinFamilyCard joining={joining} onJoin={handleJoin} />
                  </div>
                </details>
              </div>
            ) : (
              <Card className="flex min-h-72 items-center justify-center overflow-hidden bg-linear-to-br from-white to-purple-50/50">
                <CardContent className="py-16 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20">
                    <Users className="h-7 w-7 text-white" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {selectedGroup ? selectedGroup.name : "Your family calendar"}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
                    Select a family to see its members and shared events.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </PageLayout>

      <Modal
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title="Revoke invitation"
        description={
          revokeTarget
            ? `Anyone with this token will no longer be able to join. ${
                revokeTarget.email ? `Invited: ${revokeTarget.email}.` : ""
              }`
            : undefined
        }
        size="sm"
      >
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={() => setRevokeTarget(null)} disabled={revoking}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
            loading={revoking}
            onClick={() => void handleRevoke()}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Revoke
          </Button>
        </div>
      </Modal>

      <Modal
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title="Remove member"
        description={
          removeTarget
            ? `Remove ${removeTarget.name} from ${detail?.name ?? "this family"}? They'll lose access to all family tasks and events.`
            : undefined
        }
        size="sm"
      >
        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={() => setRemoveTarget(null)}
            disabled={memberBusy !== null}
          >
            Cancel
          </Button>
          <Button
            variant="ghost"
            className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
            loading={memberBusy === "remove"}
            onClick={() => void handleRemoveMember()}
          >
            <UserMinus className="h-4 w-4" aria-hidden="true" />
            Remove
          </Button>
        </div>
      </Modal>

      <Modal
        open={transferTarget !== null}
        onClose={() => setTransferTarget(null)}
        title="Transfer ownership"
        description={
          transferTarget && detail
            ? `Make ${transferTarget.name} the owner of ${detail.name}? You'll become an admin and keep member-management access.`
            : undefined
        }
        size="sm"
      >
        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={() => setTransferTarget(null)}
            disabled={memberBusy !== null}
          >
            Cancel
          </Button>
          <Button
            loading={memberBusy === "transfer"}
            onClick={() => void handleTransfer()}
          >
            <Crown className="h-4 w-4" aria-hidden="true" />
            Transfer ownership
          </Button>
        </div>
      </Modal>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Leave family"
        description={
          detail
            ? `Leave ${detail.name}? You'll lose access to all family tasks and events.`
            : undefined
        }
        size="sm"
      >
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={() => setLeaveOpen(false)} disabled={memberBusy !== null}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
            loading={memberBusy === "leave"}
            onClick={() => void handleLeave()}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Leave family
          </Button>
        </div>
      </Modal>

      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Edit family"
        description="Update the family name and description. Visible to every member."
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Family name"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            maxLength={60}
            autoFocus
            required
          />
          <Input
            label="Description (optional)"
            value={renameDescription}
            onChange={(e) => setRenameDescription(e.target.value)}
            maxLength={200}
            placeholder="e.g. Household chores & events"
          />
          {renameError && (
            <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {renameError}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setRenameOpen(false)} disabled={renameBusy}>
              Cancel
            </Button>
            <Button loading={renameBusy} disabled={!renameName.trim()} onClick={() => void handleRename()}>
              Save changes
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
