"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { useTaskStore } from "@/lib/store";
import { EVENT_CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { IntegrationStatus } from "@/types";
import { AlertCircle, Calendar, CheckCircle2, RefreshCw, Unplug } from "lucide-react";

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

function SettingsContent() {
  const { user, retryLoad } = useTaskStore();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus();
  }, [loadStatus]);

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

  const connected = Boolean(status?.connected);
  const configured = Boolean(status?.configured);

  return (
    <PageLayout
      title="Settings"
      description="Manage your profile, integrations, and calendar categories."
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>The account shown across TaskFlow.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {user && <Avatar initials={user.initials} color={user.avatarColor} size="md" alt={user.name} />}
              <div>
                <p className="text-sm font-medium text-slate-900">{user?.name ?? "Profile unavailable"}</p>
                <p className="text-sm text-slate-500">{user?.plan ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

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
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                )}
                <span>{notice.text}</span>
              </div>
            )}

            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white">
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
                    <p className="mt-1 text-xs text-slate-400">Last synced: {formatSyncedAt(status?.lastSyncedAt ?? null)}</p>
                  )}
                  {connected && status?.lastSyncError && (
                    <p className="mt-1 text-xs text-red-500">Last error: {status.lastSyncError}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
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
          </CardContent>
        </Card>

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
                    className="h-9 w-9 flex-shrink-0 rounded-xl"
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
