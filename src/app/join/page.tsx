"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertCircle, CheckCircle2, Link2, Users } from "lucide-react";

type PreviewReason =
  | "not-found"
  | "revoked"
  | "expired"
  | "already-accepted"
  | "email-mismatch"
  | "already-member";

interface PreviewResponse {
  valid: boolean;
  reason?: PreviewReason;
  familyName?: string;
  emailMatch?: boolean;
  alreadyMember?: boolean;
}

type LoadState = "loading" | "ready" | "unauthorized" | "error";

const REASON_MESSAGES: Record<PreviewReason, string> = {
  "not-found": "This invitation link is invalid.",
  revoked: "This invitation was revoked.",
  expired: "This invitation has expired.",
  "already-accepted": "This invitation was already used.",
  "email-mismatch":
    "This invitation was issued to a different email address. Sign in with the invited email.",
  "already-member": "You're already a member of this family.",
};

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") ?? "").trim();

  const [state, setState] = useState<LoadState>("loading");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!token) {
      setState("ready");
      return;
    }
    setState("loading");
    setLoadError(null);
    try {
      const response = await fetch(
        `/api/family/invitations/preview?token=${encodeURIComponent(token)}`
      );
      if (response.status === 401) {
        setState("unauthorized");
        return;
      }
      const body = (await response.json().catch(() => null)) as
        | (PreviewResponse & { error?: string })
        | null;
      if (!response.ok || !body) {
        setLoadError(body?.error ?? `Unable to check this invitation (${response.status}).`);
        setState("error");
        return;
      }
      setPreview(body);
      setState("ready");
    } catch {
      setLoadError("Unable to check this invitation. Check your connection and try again.");
      setState("error");
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial preview fetch
    void loadPreview();
  }, [loadPreview]);

  const handleAccept = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const response = await fetch("/api/family/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setJoinError(body?.error ?? "Unable to join the family. Please try again.");
        return;
      }
      router.push("/family");
    } catch {
      setJoinError("Unable to join the family. Check your connection and try again.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <PageLayout title="Join a family" description="Accept your invitation to share a family space.">
      <Card className="mx-auto max-w-lg">
        <CardContent className="py-8">
          {!token ? (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Link2 className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">No invitation token</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                This link is missing its token. Open the full invitation link you were sent, or paste
                your token on the Family page.
              </p>
              <Link
                href="/family"
                className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 px-5 text-sm font-medium text-white transition-colors hover:from-purple-600 hover:to-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
              >
                Go to Family
              </Link>
            </div>
          ) : state === "loading" ? (
            <div className="flex flex-col items-center py-8 text-center" role="status" aria-live="polite">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-purple-500" aria-hidden="true" />
              <p className="mt-4 text-sm text-slate-500">Checking your invitation…</p>
            </div>
          ) : state === "unauthorized" ? (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
                <Users className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">Sign in to accept</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                You need to be signed in to accept this invitation.
              </p>
              <Link
                href="/sign-in"
                className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 px-5 text-sm font-medium text-white transition-colors hover:from-purple-600 hover:to-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
              >
                Sign in
              </Link>
            </div>
          ) : state === "error" ? (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                <AlertCircle className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">We couldn&#39;t check this invitation</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{loadError}</p>
              <Button className="mt-4" onClick={() => void loadPreview()}>
                Try again
              </Button>
            </div>
          ) : preview?.valid ? (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                You&#39;re invited to {preview.familyName ?? "this family"}
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                Accept to join {preview.familyName ?? "the family"} and see shared tasks and events.
              </p>
              {joinError && (
                <p
                  role="alert"
                  className="mx-auto mt-4 flex max-w-sm items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {joinError}
                </p>
              )}
              <Button className="mt-5" loading={joining} onClick={() => void handleAccept()}>
                Accept invitation
              </Button>
            </div>
          ) : (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertCircle className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                {preview?.reason === "already-member" ? "You're already a member" : "Invitation unavailable"}
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                {preview?.reason ? REASON_MESSAGES[preview.reason] : "This invitation can't be used."}
              </p>
              {preview?.reason === "already-member" && (
                <Link
                  href="/family"
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 px-5 text-sm font-medium text-white transition-colors hover:from-purple-600 hover:to-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                >
                  Go to Family
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
}

export default function JoinPage() {
  return (
    <DashboardLayout>
      <Suspense
        fallback={
          <PageLayout title="Join a family" description="Checking your invitation…">
            <Card className="mx-auto max-w-lg">
              <CardContent className="py-8">
                <p className="text-center text-sm text-slate-500">Loading invitation…</p>
              </CardContent>
            </Card>
          </PageLayout>
        }
      >
        <JoinContent />
      </Suspense>
    </DashboardLayout>
  );
}
