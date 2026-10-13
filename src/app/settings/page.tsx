"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UserProfile, useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Input } from "@/components/ui/Input";
import { useTaskStore } from "@/lib/store";
import { useUserSource } from "@/lib/user-bridge";
import { AVATAR_PRESETS } from "@/lib/avatars";
import { EVENT_CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type {
  CalendarView,
  EventVisibility,
  IntegrationStatus,
  Role,
  User,
  UserSettings,
} from "@/types";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Unplug,
  Users,
} from "lucide-react";

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.86c2.26-2.09 3.56-5.17 3.56-8.87Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12.01 12.01 0 0 0 0 10.76l3.98-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

interface Notice {
  tone: "success" | "error";
  text: string;
}

interface SettingsProfile {
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  avatarPreset: string | null;
}

interface SettingsFamily {
  id: string;
  name: string;
  role: Role;
}

interface SettingsData {
  settings: UserSettings;
  profile: SettingsProfile;
  families: SettingsFamily[];
}

type SavingField = "view" | "classification" | "share" | "syncedShare";

const CALENDAR_VIEW_OPTIONS: readonly { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "agenda", label: "Agenda" },
];

const CLASSIFICATION_OPTIONS: readonly { value: EventVisibility; label: string }[] = [
  { value: "family", label: "Family" },
  { value: "work", label: "Work" },
  { value: "private", label: "Private" },
];

function roleBadgeVariant(role: Role): "warning" | "success" | "default" {
  if (role === "owner" || role === "admin") return "warning";
  if (role === "child") return "success";
  return "default";
}

function roleLabel(role: Role): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatSyncedAt(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const DEFAULT_AVATAR_COLOR = "linear-gradient(135deg, #7c5cfc 0%, #3b82f6 100%)";

/** The 10 preset avatars as a selectable grid. */
function AvatarPresetPicker({
  selectedId,
  disabled,
  onSelect,
}: {
  selectedId: string | null;
  disabled: boolean;
  onSelect: (presetId: string) => void;
}) {
  return (
    <div
      className="grid grid-cols-5 gap-2 sm:grid-cols-10 lg:grid-cols-5"
      role="group"
      aria-label="Avatar presets"
    >
      {AVATAR_PRESETS.map((preset) => {
        const selected = selectedId === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.id)}
            disabled={disabled}
            aria-pressed={selected}
            aria-label={preset.label}
            title={preset.label}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full text-lg transition-transform",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-60",
              selected ? "ring-2 ring-purple-600 ring-offset-2" : "hover:scale-110"
            )}
            style={{ background: preset.background }}
          >
            <span aria-hidden="true">{preset.emoji}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Photo upload/removal. Mounted only when Clerk is active, so it can safely
 * call `useUser()` (which throws outside a ClerkProvider).
 */
function AvatarPhotoControls({ onPhotoChanged }: { onPhotoChanged: () => void }) {
  const { user: clerkUser } = useUser();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<Notice | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasPhoto = Boolean(clerkUser?.imageUrl);

  const uploadPhoto = async () => {
    if (!photoFile || !clerkUser || photoBusy) return;
    setPhotoBusy(true);
    setPhotoError(null);
    setPhotoNotice(null);
    try {
      await clerkUser.setProfileImage({ file: photoFile });
      await clerkUser.reload();
      onPhotoChanged();
      setPhotoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setPhotoNotice({ tone: "success", text: "Profile photo uploaded." });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Unable to upload your photo.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!clerkUser || photoBusy) return;
    if (!confirm("Remove your profile photo?")) return;
    setPhotoBusy(true);
    setPhotoError(null);
    setPhotoNotice(null);
    try {
      await clerkUser.setProfileImage({ file: null });
      await clerkUser.reload();
      onPhotoChanged();
      setPhotoNotice({ tone: "success", text: "Profile photo removed." });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Unable to remove your photo.");
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-700">Profile photo</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Upload a photo, or remove the current one. A photo takes precedence over presets.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          aria-label="Choose a profile photo"
          disabled={photoBusy}
          onChange={(e) => {
            setPhotoFile(e.target.files?.[0] ?? null);
            setPhotoError(null);
            setPhotoNotice(null);
          }}
          className="block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <Button size="sm" loading={photoBusy} disabled={!photoFile || photoBusy} onClick={() => void uploadPhoto()}>
          Upload photo
        </Button>
        {hasPhoto && (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600"
            loading={photoBusy}
            disabled={photoBusy}
            onClick={() => void removePhoto()}
          >
            Remove photo
          </Button>
        )}
      </div>
      {photoError && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {photoError}
        </p>
      )}
      {photoNotice && (
        <p
          role="status"
          className={cn(
            "flex items-center gap-1.5 text-sm",
            photoNotice.tone === "success" ? "text-green-700" : "text-red-600"
          )}
        >
          {photoNotice.tone === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {photoNotice.text}
        </p>
      )}
    </div>
  );
}

/** Avatar management: preview, preset picker, and photo controls. */
function AvatarSettings({
  user,
  profileInitials,
  profileName,
  settingsData,
  retryLoad,
  clerkEnabled,
  onPresetSaved,
}: {
  user: User | null;
  profileInitials: string;
  profileName: string | null | undefined;
  settingsData: SettingsData | null;
  retryLoad: () => void;
  clerkEnabled: boolean;
  onPresetSaved: (presetId: string) => void;
}) {
  const { user: clerkUser } = useUserSource();
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetNotice, setPresetNotice] = useState<Notice | null>(null);

  const selectedPresetId = settingsData?.profile.avatarPreset ?? user?.avatarPreset ?? null;

  const selectPreset = async (presetId: string) => {
    if (savingPreset) return;
    setSavingPreset(true);
    setPresetError(null);
    setPresetNotice(null);
    try {
      const response = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarPreset: presetId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { avatarPreset?: string; error?: string }
        | null;
      if (!response.ok) {
        // Includes the keyless-development 400, which is expected there.
        throw new Error(payload?.error ?? "Unable to update your avatar.");
      }
      onPresetSaved(presetId);
      retryLoad();
      // The Clerk user object is reactive; reload it so the sidebar badge
      // reflects the new preset immediately.
      await clerkUser?.reload?.();
      setPresetNotice({ tone: "success", text: "Avatar updated." });
    } catch (error) {
      setPresetError(error instanceof Error ? error.message : "Unable to update your avatar.");
    } finally {
      setSavingPreset(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2 sm:w-36">
          <Avatar
            initials={profileInitials}
            color={user?.avatarColor ?? DEFAULT_AVATAR_COLOR}
            size="xl"
            alt={profileName ?? "Signed-in user"}
            imageUrl={user?.imageUrl}
            emoji={user?.avatarEmoji ?? undefined}
          />
          <p className="text-xs text-slate-500">Current avatar</p>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-slate-700">Preset avatars</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Pick a preset to use across TaskFlow. A photo takes precedence over presets.
            </p>
          </div>
          <AvatarPresetPicker
            selectedId={selectedPresetId}
            disabled={savingPreset}
            onSelect={(presetId) => void selectPreset(presetId)}
          />
          {savingPreset && (
            <p role="status" className="flex items-center gap-1.5 text-sm text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              Saving…
            </p>
          )}
          {presetError && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {presetError}
            </p>
          )}
          {presetNotice && (
            <p
              role="status"
              className={cn(
                "flex items-center gap-1.5 text-sm",
                presetNotice.tone === "success" ? "text-green-700" : "text-red-600"
              )}
            >
              {presetNotice.tone === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              {presetNotice.text}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        {clerkEnabled ? (
          clerkUser ? (
            <AvatarPhotoControls onPhotoChanged={retryLoad} />
          ) : (
            <p className="text-sm text-slate-500">Loading account details…</p>
          )
        ) : (
          <p className="text-sm text-slate-500">Photo upload requires authentication.</p>
        )}
      </div>
    </div>
  );
}

function SettingsContent() {
  const { user, retryLoad } = useTaskStore();
  const { user: clerkUser, clerkEnabled, isLoaded: clerkLoaded } = useUserSource();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Account / family / preference data from GET /api/settings.
  const [settingsData, setSettingsData] = useState<SettingsData | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameNotice, setNameNotice] = useState<Notice | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [pendingInvites, setPendingInvites] = useState<number | null>(null);

  const [savingField, setSavingField] = useState<SavingField | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/integrations/google");
      if (response.ok) {
        setStatus((await response.json()) as IntegrationStatus);
      }
    } catch {
      // The notice below covers the important states; fail quietly on refresh.
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const response = await fetch("/api/settings");
      if (!response.ok) {
        throw new Error(`Unable to load your settings (${response.status}).`);
      }
      const data = (await response.json()) as SettingsData;
      setSettingsData(data);
      setDisplayName((current) => current || data.profile.name || "");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Unable to load your settings.");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial integration status fetch
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial settings fetch
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const google = searchParams.get("google");
    if (!google) return;
    if (google === "connected") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotice({ tone: "success", text: "Google Calendar connected. Run a sync to import your events." });
    } else if (google === "not-configured") {
      setNotice({
        tone: "error",
        text: "Google Calendar is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then restart the app.",
      });
    } else if (google === "error") {
      const reason = searchParams.get("reason") ?? "unknown-error";
      setNotice({ tone: "error", text: `Could not connect to Google Calendar (${reason}).` });
    }
  }, [searchParams]);

  // Pending-invitation count for the first family the user can administer.
  useEffect(() => {
    const adminFamily = settingsData?.families.find(
      (family) => family.role === "owner" || family.role === "admin"
    );
    if (!adminFamily) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing a stale count
      setPendingInvites(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/family/invitations?familyGroupId=${encodeURIComponent(adminFamily.id)}`
        );
        if (!response.ok) return;
        const invitations = (await response.json()) as { status: string }[];
        if (!cancelled) {
          setPendingInvites(invitations.filter((invitation) => invitation.status === "pending").length);
        }
      } catch {
        // The count is supplementary — omit it rather than break the page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsData]);

  const handleConnect = () => {
    // Full-page navigation so the browser follows Google's consent redirect.
    const connectUrl = new URL("/api/integrations/google/connect", window.location.origin);
    window.location.href = connectUrl.toString();
  };

  const handleSync = async () => {
    setBusy("sync");
    setNotice(null);
    try {
      const response = await fetch("/api/integrations/google/sync", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { imported?: number; scanned?: number; error?: string }
        | null;
      if (!response.ok) {
        setNotice({ tone: "error", text: payload?.error ?? "Sync failed." });
      } else {
        setNotice({
          tone: "success",
          text: `Synced ${payload?.imported ?? 0} Google event${payload?.imported === 1 ? "" : "s"}.`,
        });
        retryLoad();
      }
    } catch {
      setNotice({ tone: "error", text: "Sync failed. Check the server logs." });
    } finally {
      await loadStatus();
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Google Calendar and remove the imported events?")) return;
    setBusy("disconnect");
    setNotice(null);
    try {
      const response = await fetch("/api/integrations/google", { method: "DELETE" });
      if (!response.ok) {
        setNotice({ tone: "error", text: "Disconnect failed." });
      } else {
        setNotice({ tone: "success", text: "Google Calendar disconnected." });
        retryLoad();
      }
    } catch {
      setNotice({ tone: "error", text: "Disconnect failed. Check the server logs." });
    } finally {
      await loadStatus();
      setBusy(null);
    }
  };

  const saveDisplayName = async () => {
    const name = displayName.trim();
    if (!name) return;
    setSavingName(true);
    setNameNotice(null);
    try {
      const response = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { name?: string; error?: string }
        | null;
      if (!response.ok) {
        // Includes the keyless-development 400, which is expected there.
        throw new Error(payload?.error ?? "Unable to update your profile.");
      }
      setDisplayName(payload?.name ?? name);
      setNameNotice({ tone: "success", text: "Display name updated." });
    } catch (error) {
      setNameNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to update your profile.",
      });
    } finally {
      setSavingName(false);
    }
  };

  // Moves the preset highlight immediately after a successful PATCH; the store
  // user (and thus the sidebar badge) refreshes via retryLoad + Clerk reload.
  const handlePresetSaved = useCallback((presetId: string) => {
    setSettingsData((data) =>
      data ? { ...data, profile: { ...data.profile, avatarPreset: presetId } } : data
    );
  }, []);

  const startRename = (family: SettingsFamily) => {
    setRenamingId(family.id);
    setRenameName(family.name);
    setRenameError(null);
  };

  const saveRename = async () => {
    if (!renamingId || !renameName.trim()) return;
    setRenameBusy(true);
    setRenameError(null);
    try {
      const response = await fetch(`/api/family/groups/${renamingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameName.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { id?: string; name?: string; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to rename this family.");
      }
      const savedName = payload?.name ?? renameName.trim();
      setSettingsData((data) =>
        data
          ? {
              ...data,
              families: data.families.map((family) =>
                family.id === renamingId ? { ...family, name: savedName } : family
              ),
            }
          : data
      );
      setRenamingId(null);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Unable to rename this family.");
    } finally {
      setRenameBusy(false);
    }
  };

  const updatePreference = useCallback(
    async (patch: Partial<UserSettings>, field: SavingField) => {
      const previous = settingsData?.settings;
      if (!previous) return;
      // Optimistic update so the control feels instant; reverted on failure.
      setSettingsData((data) => (data ? { ...data, settings: { ...data.settings, ...patch } } : data));
      setSavingField(field);
      setPrefsError(null);
      try {
        const response = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const payload = (await response.json().catch(() => null)) as
          | (UserSettings & { error?: string })
          | null;
        if (!response.ok || !payload) {
          throw new Error(payload?.error ?? "Unable to save your preference.");
        }
        setSettingsData((data) => (data ? { ...data, settings: payload } : data));
      } catch (error) {
        setSettingsData((data) => (data ? { ...data, settings: previous } : data));
        setPrefsError(error instanceof Error ? error.message : "Unable to save your preference.");
      } finally {
        setSavingField(null);
      }
    },
    [settingsData]
  );

  const connected = Boolean(status?.connected);
  const configured = Boolean(status?.configured);
  const profileName =
    clerkUser?.fullName?.trim() ||
    clerkUser?.firstName?.trim() ||
    clerkUser?.username?.trim() ||
    clerkUser?.primaryEmailAddress?.emailAddress ||
    settingsData?.profile.name ||
    user?.name;
  const profileEmail =
    settingsData?.profile.email ??
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;
  const emailVerified = settingsData?.profile.emailVerified ?? false;
  const profileInitials =
    profileName?.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";

  const settings = settingsData?.settings ?? null;

  return (
    <PageLayout
      title="Settings"
      description="Manage your profile, family, privacy, and integrations."
    >
      <div className="space-y-6">
        {/* Account */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>Your account</CardTitle>
                <CardDescription>Manage the profile and security for your signed-in account.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 sm:flex-row sm:items-center">
              {(clerkUser || user) && (
                <Avatar
                  initials={profileInitials}
                  color={user?.avatarColor ?? "linear-gradient(135deg, #7c5cfc 0%, #3b82f6 100%)"}
                  size="lg"
                  alt={profileName ?? "Signed-in user"}
                  imageUrl={clerkUser?.imageUrl ?? user?.imageUrl}
                  emoji={user?.avatarEmoji ?? undefined}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-slate-900">
                  {!clerkLoaded ? "Loading your account…" : profileName ?? (clerkEnabled ? "No signed-in account" : "Profile unavailable")}
                </p>
                {(profileEmail || clerkEnabled) && (
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {profileEmail ?? (clerkLoaded ? "No email address on this account" : " ")}
                  </p>
                )}
              </div>
              {clerkEnabled && clerkLoaded && clerkUser && <Badge variant="success">Connected with Clerk</Badge>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="display-name" className="block text-sm font-medium text-slate-700">
                  Display name
                </label>
                <div className="flex items-start gap-2">
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      setNameNotice(null);
                    }}
                    placeholder="Your name"
                    maxLength={100}
                    autoComplete="name"
                    hint="Shown to your family and on shared plans."
                  />
                  <Button
                    className="shrink-0"
                    loading={savingName}
                    disabled={savingName || !displayName.trim()}
                    onClick={() => void saveDisplayName()}
                  >
                    Save
                  </Button>
                </div>
                {nameNotice && (
                  <p
                    role="status"
                    className={cn(
                      "flex items-center gap-1.5 text-sm",
                      nameNotice.tone === "success" ? "text-green-700" : "text-red-600"
                    )}
                  >
                    {nameNotice.tone === "success" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    {nameNotice.text}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Email</p>
                <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {profileEmail ?? "No email address"}
                  </span>
                  {profileEmail && (
                    <Badge variant={emailVerified ? "success" : "warning"}>
                      {emailVerified ? "Verified" : "Unverified"}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Avatar */}
            <AvatarSettings
              user={user}
              profileInitials={profileInitials}
              profileName={profileName}
              settingsData={settingsData}
              retryLoad={retryLoad}
              clerkEnabled={clerkEnabled}
              onPresetSaved={handlePresetSaved}
            />

            {clerkEnabled && !clerkLoaded ? (
              <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-200/70 bg-white">
                <p className="text-sm text-slate-500">Loading your account settings…</p>
              </div>
            ) : clerkEnabled && clerkUser ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white p-2 sm:p-4">
                <UserProfile
                  routing="hash"
                />
              </div>
            ) : clerkEnabled ? (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Clerk did not return a signed-in user. Refresh the page or sign in again.
              </p>
            ) : (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Clerk account management is available when authentication is configured.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Family */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>Family</CardTitle>
                <CardDescription>Your family spaces and your role in each.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {settingsLoading ? (
              <div className="space-y-2" aria-label="Loading families">
                <div className="h-14 animate-pulse rounded-xl bg-slate-200/70" />
              </div>
            ) : settingsError ? (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p>{settingsError}</p>
                  <button type="button" className="mt-1 font-semibold underline" onClick={() => void loadSettings()}>
                    Try again
                  </button>
                </div>
              </div>
            ) : !settingsData || settingsData.families.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-7 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white text-purple-600 shadow-sm ring-1 ring-slate-200/70">
                  <Users className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">You&#39;re not part of a family yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                  Create a family or join one with an invitation to start planning together.
                </p>
                <Link
                  href="/family"
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-medium text-purple-700 ring-1 ring-slate-200 transition-colors hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                  Go to Family
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {settingsData.families.map((family, index) => {
                  const canManage = family.role === "owner" || family.role === "admin";
                  const isFirstAdminFamily =
                    canManage &&
                    settingsData.families.findIndex(
                      (candidate) => candidate.role === "owner" || candidate.role === "admin"
                    ) === index;
                  return (
                    <li
                      key={family.id}
                      className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        {renamingId === family.id ? (
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <div className="min-w-[12rem] flex-1">
                              <Input
                                aria-label={`Rename ${family.name}`}
                                value={renameName}
                                onChange={(e) => setRenameName(e.target.value)}
                                maxLength={60}
                                autoFocus
                              />
                            </div>
                            <Button size="sm" loading={renameBusy} disabled={!renameName.trim()} onClick={() => void saveRename()}>
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={renameBusy}
                              onClick={() => {
                                setRenamingId(null);
                                setRenameError(null);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="truncate text-sm font-medium text-slate-900">{family.name}</span>
                              <Badge variant={roleBadgeVariant(family.role)}>{roleLabel(family.role)}</Badge>
                              {canManage && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 min-h-0 w-8 min-w-0 text-slate-400 hover:text-slate-700"
                                  aria-label={`Rename ${family.name}`}
                                  onClick={() => startRename(family)}
                                >
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              )}
                            </div>
                            {isFirstAdminFamily && pendingInvites !== null && pendingInvites > 0 && (
                              <span className="text-xs font-medium text-slate-500">
                                {pendingInvites} pending invitation{pendingInvites === 1 ? "" : "s"}
                              </span>
                            )}
                            <Link
                              href="/family"
                              className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                            >
                              Manage family
                            </Link>
                          </>
                        )}
                      </div>
                      {renamingId === family.id && renameError && (
                        <p role="alert" className="mt-2 text-sm text-red-600">
                          {renameError}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Calendar & privacy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <Calendar className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>Calendar &amp; privacy</CardTitle>
                <CardDescription>Defaults for how your events are created and shared.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {settingsError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p>Couldn&#39;t load your calendar preferences. {settingsError}</p>
                  <button type="button" className="mt-1 font-semibold underline" onClick={() => void loadSettings()}>
                    Try again
                  </button>
                </div>
              </div>
            )}
            {prefsError && (
              <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {prefsError}
              </p>
            )}

            {settingsLoading || !settings ? (
              <div className="space-y-3" aria-label="Loading preferences">
                <div className="h-11 animate-pulse rounded-xl bg-slate-200/70" />
                <div className="h-11 animate-pulse rounded-xl bg-slate-200/70" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <label htmlFor="default-view" className="block text-sm font-medium text-slate-700">
                      Default calendar view
                    </label>
                    <p className="mt-0.5 text-xs text-slate-500">The layout the calendar opens with.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {savingField === "view" && <span className="text-xs text-slate-400">Saving…</span>}
                    <select
                      id="default-view"
                      value={settings.defaultCalendarView}
                      onChange={(e) =>
                        void updatePreference(
                          { defaultCalendarView: e.target.value as CalendarView },
                          "view"
                        )
                      }
                      className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    >
                      {CALENDAR_VIEW_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Default classification for new events</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Applied when you add an event without choosing a visibility.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {savingField === "classification" && <span className="text-xs text-slate-400">Saving…</span>}
                    <div className="flex items-center gap-2" role="group" aria-label="Default classification for new events">
                      {CLASSIFICATION_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            void updatePreference(
                              { defaultEventClassification: option.value },
                              "classification"
                            )
                          }
                          aria-pressed={settings.defaultEventClassification === option.value}
                          className={cn(
                            "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2",
                            settings.defaultEventClassification === option.value
                              ? "border-purple-300 bg-purple-50 text-purple-800"
                              : "border-slate-200 bg-white text-slate-600 hover:border-purple-200 hover:bg-purple-50/40"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="max-w-md">
                    <p className="text-sm font-medium text-slate-700">Share work availability with family</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Family members see your work events as generic &#39;Work&#39; blocks — never titles or details.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {savingField === "share" && <span className="text-xs text-slate-400">Saving…</span>}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.shareWorkAvailability}
                      aria-label="Share work availability with family"
                      onClick={() =>
                        void updatePreference(
                          { shareWorkAvailability: !settings.shareWorkAvailability },
                          "share"
                        )
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2",
                        settings.shareWorkAvailability ? "bg-purple-600" : "bg-slate-300"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                          settings.shareWorkAvailability ? "translate-x-5" : "translate-x-0.5"
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Integrations */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Integrations</CardTitle>
                <CardDescription>Connect external services to keep TaskFlow in sync.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {notice && (
              <div
                role="status"
                className={cn(
                  "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
                  notice.tone === "success"
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-red-200 bg-red-50 text-red-800"
                )}
              >
                {notice.tone === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>{notice.text}</span>
              </div>
            )}

            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white">
                  <GoogleLogo className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900">Google Calendar</p>
                    {connected ? (
                      <Badge variant="success">Connected</Badge>
                    ) : (
                      <Badge>Not connected</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {loadingStatus
                      ? "Checking connection…"
                      : connected
                      ? `Importing events into your TaskFlow calendar${status?.accountEmail ? ` as ${status.accountEmail}` : ""}.`
                      : configured
                      ? "Import events from your Google Calendar into TaskFlow."
                      : "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable this integration."}
                  </p>
                  {connected && (
                    <p className="mt-1 text-xs text-slate-500">Last synced: {formatSyncedAt(status?.lastSyncedAt ?? null)}</p>
                  )}
                  {connected && status?.lastSyncError && (
                    <p className="mt-1 text-xs text-red-500">Last error: {status.lastSyncError}</p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {connected ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => void handleSync()} loading={busy === "sync"} disabled={busy !== null}>
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      Sync now
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => void handleDisconnect()}
                      loading={busy === "disconnect"}
                      disabled={busy !== null}
                    >
                      <Unplug className="h-4 w-4" aria-hidden="true" />
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={handleConnect} disabled={!configured || loadingStatus}>
                    <Calendar className="h-4 w-4" aria-hidden="true" />
                    Connect
                  </Button>
                )}
              </div>
            </div>

            {/* Only meaningful for users in a family; hidden entirely when the
                settings fetch failed (settingsData null) rather than breaking. */}
            {settings && settingsData && settingsData.families.length > 0 && (
              <div className="rounded-2xl border border-slate-200/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="max-w-md">
                    <p className="text-sm font-medium text-slate-700">Share synced events with family</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      When on, Google Calendar sync imports your events onto your family&#39;s shared calendar with full details. When off, synced events stay personal and family members only see generic &#39;Work&#39; blocks.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {savingField === "syncedShare" && <span className="text-xs text-slate-400">Saving…</span>}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.shareSyncedEventsWithFamily}
                      aria-label="Share synced events with family"
                      disabled={!connected}
                      onClick={() =>
                        void updatePreference(
                          { shareSyncedEventsWithFamily: !settings.shareSyncedEventsWithFamily },
                          "syncedShare"
                        )
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2",
                        settings.shareSyncedEventsWithFamily ? "bg-purple-600" : "bg-slate-300",
                        !connected && "cursor-not-allowed opacity-50"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                          settings.shareSyncedEventsWithFamily ? "translate-x-5" : "translate-x-0.5"
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>
                <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Only enable this if you want your family to see the titles and details of your Google Calendar events.
                </p>
                {!connected && (
                  <p className="mt-2 text-xs text-slate-500">Connect Google Calendar to change this.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Calendar categories */}
        <Card>
          <CardHeader>
            <CardTitle>Calendar categories</CardTitle>
            <CardDescription>Each event category has its own color across the calendar and event lists.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {EVENT_CATEGORIES.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200/60 p-4"
                >
                  <span
                    className="h-9 w-9 shrink-0 rounded-xl"
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{category.label}</p>
                    <p className="text-xs text-slate-500">{category.color}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <Suspense
        fallback={
          <PageLayout title="Settings" description="Loading your settings…">
            <Card>
              <CardContent>
                <p className="py-8 text-center text-sm text-slate-500">Loading settings…</p>
              </CardContent>
            </Card>
          </PageLayout>
        }
      >
        <SettingsContent />
      </Suspense>
    </DashboardLayout>
  );
}
