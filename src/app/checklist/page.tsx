"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ListChecks,
  PartyPopper,
  RefreshCw,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { useTaskStore } from "@/lib/store";
import { cn, formatDate, formatDateLong, formatTime, getDateKey, getGreeting } from "@/lib/utils";
import type { Task } from "@/types";

/** Fetches a task list, surfacing the server's error message when present. */
async function requestTasks(url: string): Promise<Task[]> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    let message = `We couldn't load your list (${response.status}).`;
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error?: unknown }).error === "string"
      ) {
        message = (body as { error: string }).error;
      }
    } catch {
      // Non-JSON response — keep the status-based message.
    }
    throw new Error(message);
  }
  const data: unknown = await response.json();
  return Array.isArray(data) ? (data as Task[]) : [];
}

/** A day-scoped task is complete when the server says so, or when it is done. */
function isComplete(task: Task): boolean {
  if (typeof task.completedOnDate === "boolean") return task.completedOnDate;
  return task.status === "done";
}

interface ChecklistTaskRowProps {
  task: Task;
  done: boolean;
  busy: boolean;
  onToggle: (task: Task) => void;
}

function ChecklistTaskRow({ task, done, busy, onToggle }: ChecklistTaskRowProps) {
  return (
    <li>
      {/* The whole row is the label, so the tap target is the full width and a
          native checkbox keeps keyboard + screen-reader semantics intact. */}
      <label
        className={cn(
          "flex min-h-16 cursor-pointer items-center gap-4 rounded-2xl border-2 p-4 transition-colors",
          done
            ? "border-emerald-200 bg-emerald-50/70"
            : "border-slate-200 bg-white hover:border-purple-300",
          busy && "cursor-wait opacity-60"
        )}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={done}
          disabled={busy}
          onChange={() => onToggle(task)}
        />
        <span
          aria-hidden="true"
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-4 transition-colors",
            "peer-focus-visible:ring-4 peer-focus-visible:ring-purple-300 peer-focus-visible:ring-offset-2",
            done ? "border-emerald-400 bg-emerald-400 text-white" : "border-slate-300 bg-white text-transparent"
          )}
        >
          <Check className="h-7 w-7" strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-lg font-semibold",
              done ? "text-slate-500 line-through" : "text-slate-900"
            )}
          >
            {task.title}
          </span>
          {task.time && !done && (
            <span className="mt-0.5 block text-sm text-slate-500">{formatTime(task.time)}</span>
          )}
        </span>
      </label>
    </li>
  );
}

function ChecklistSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-28 animate-pulse rounded-3xl bg-slate-200/70" />
      <div className="h-14 animate-pulse rounded-2xl bg-slate-200/70" />
      <div className="space-y-3">
        <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70" />
      </div>
    </div>
  );
}

export default function ChecklistPage() {
  const { user, hydrated, retryLoad, completeTask, uncompleteTask } = useTaskStore();

  // SSR-safe: `new Date()` and the greeting depend on the machine clock, so they
  // are resolved after mount (mirrors the Today page pattern).
  const [todayStr, setTodayStr] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [dateLabel, setDateLabel] = useState<string | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [upcoming, setUpcoming] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const now = new Date();
    /* eslint-disable react-hooks/set-state-in-effect -- resolve clock after mount */
    setTodayStr(getDateKey(now));
    setGreeting(getGreeting().text);
    setDateLabel(formatDateLong(now));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const loadToday = useCallback(async (date: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [todayTasks, assignedTasks] = await Promise.all([
        requestTasks(`/api/tasks?date=${encodeURIComponent(date)}&assignee=me`),
        requestTasks("/api/tasks?assignee=me"),
      ]);
      setTasks(todayTasks);
      // Keep the upcoming strip light: a handful of unfinished future tasks.
      setUpcoming(
        assignedTasks
          .filter((task) => task.date && task.date > date && !isComplete(task))
          .sort((a, b) => `${a.date} ${a.time ?? ""}`.localeCompare(`${b.date} ${b.time ?? ""}`))
          .slice(0, 5)
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "We couldn't load your list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!todayStr) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch once the clock resolves
    void loadToday(todayStr);
  }, [todayStr, loadToday]);

  const retry = useCallback(() => {
    // Re-run both the page fetch and the global store load so a transient
    // failure anywhere recovers in one tap.
    retryLoad();
    if (todayStr) void loadToday(todayStr);
  }, [retryLoad, loadToday, todayStr]);

  const toggle = useCallback(
    async (task: Task) => {
      if (!todayStr || busyIds.has(task.id)) return;
      const done = isComplete(task);
      setActionError(null);
      setBusyIds((prev) => new Set(prev).add(task.id));

      // Optimistic: flip locally so the child sees the result instantly; the
      // store throws on failure and we reconcile below.
      setTasks((prev) =>
        prev.map((current) =>
          current.id === task.id
            ? { ...current, status: done ? "todo" : "done", completedOnDate: !done }
            : current
        )
      );

      try {
        const updated = done
          ? await uncompleteTask(task.id, todayStr)
          : await completeTask(task.id, todayStr);
        setTasks((prev) =>
          prev.map((current) =>
            current.id === task.id
              ? {
                  ...current,
                  ...updated,
                  completedOnDate: typeof updated.completedOnDate === "boolean" ? updated.completedOnDate : !done,
                }
              : current
          )
        );
      } catch (error) {
        setTasks((prev) => prev.map((current) => (current.id === task.id ? task : current)));
        setActionError(error instanceof Error ? error.message : "That didn't save. Please try again.");
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    },
    [todayStr, busyIds, completeTask, uncompleteTask]
  );

  const doneTasks = useMemo(() => tasks.filter(isComplete), [tasks]);
  const todoTasks = useMemo(() => tasks.filter((task) => !isComplete(task)), [tasks]);
  const total = tasks.length;
  const doneCount = doneTasks.length;
  const allDone = total > 0 && doneCount === total;

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const safeName = firstName && firstName !== "TaskFlow" ? firstName : null;
  const greetingLine = greeting
    ? safeName
      ? `${greeting}, ${safeName}!`
      : `${greeting}!`
    : "Hello!";

  const showSkeleton = !hydrated || (loading && total === 0 && !loadError);
  const showError = Boolean(loadError);

  return (
    <DashboardLayout>
      <PageLayout title="My Checklist" description="A simple list of what to do today.">
        {actionError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
        )}

        {showSkeleton ? (
          <ChecklistSkeleton />
        ) : showError ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-red-300" aria-hidden="true" />
              <p className="mt-4 text-lg font-semibold text-slate-800">We couldn&#39;t load your list</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{loadError}</p>
              <Button className="mt-5" onClick={retry}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Deeper 600/700 shades keep white text at WCAG AA contrast (the
                previous amber-400 start was ~1.6:1 against white). */}
            <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-orange-700 via-pink-600 to-fuchsia-600 px-6 py-6 text-white shadow-lg shadow-orange-900/10">
              <div
                className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full border-18 border-white/15"
                aria-hidden="true"
              />
              <div className="relative flex items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20" aria-hidden="true">
                  <PartyPopper className="h-7 w-7" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{greetingLine}</h2>
                  <p className="mt-0.5 text-sm font-medium text-white">{dateLabel ?? ""}</p>
                </div>
              </div>
            </div>

            {total === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                    <ListChecks className="h-8 w-8" aria-hidden="true" />
                  </div>
                  <p className="mt-4 text-lg font-semibold text-slate-800">Nothing on your list today</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                    Enjoy your day! New tasks will show up here when they are assigned to you.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {allDone && (
                  <div
                    role="status"
                    className="flex items-center gap-4 rounded-3xl border-2 border-emerald-200 bg-emerald-50 p-5"
                  >
                    <span className="text-4xl" aria-hidden="true">
                      🎉
                    </span>
                    <div>
                      <p className="text-lg font-bold text-emerald-800">All done!</p>
                      <p className="text-sm text-emerald-700">
                        You finished everything on your list today. Nice work!
                      </p>
                    </div>
                  </div>
                )}

                <div aria-live="polite">
                  <Progress
                    value={doneCount}
                    max={total}
                    label={`${doneCount} of ${total} completed`}
                    color="linear-gradient(90deg, #f59e0b 0%, #ec4899 100%)"
                    className="[&_[role=progressbar]]:h-3"
                  />
                </div>

                <section aria-labelledby="checklist-today-heading" className="space-y-3">
                  <h2 id="checklist-today-heading" className="text-xl font-bold text-slate-900">
                    Today
                  </h2>
                  {todoTasks.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 px-4 py-6 text-center text-base font-medium text-emerald-700">
                      Everything here is done. Great job!
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {todoTasks.map((task) => (
                        <ChecklistTaskRow
                          key={task.id}
                          task={task}
                          done={false}
                          busy={busyIds.has(task.id)}
                          onToggle={(next) => {
                            void toggle(next);
                          }}
                        />
                      ))}
                    </ul>
                  )}
                </section>

                {doneTasks.length > 0 && (
                  <section aria-labelledby="checklist-done-heading" className="space-y-3">
                    <h2 id="checklist-done-heading" className="text-xl font-bold text-slate-900">
                      Done today
                    </h2>
                    <ul className="space-y-3">
                      {doneTasks.map((task) => (
                        <ChecklistTaskRow
                          key={task.id}
                          task={task}
                          done
                          busy={busyIds.has(task.id)}
                          onToggle={(next) => {
                            void toggle(next);
                          }}
                        />
                      ))}
                    </ul>
                  </section>
                )}

                {upcoming.length > 0 && (
                  <section aria-labelledby="checklist-upcoming-heading" className="space-y-3">
                    <h2 id="checklist-upcoming-heading" className="flex items-center gap-2 text-xl font-bold text-slate-900">
                      <CalendarDays className="h-5 w-5 text-purple-500" aria-hidden="true" />
                      Coming up
                    </h2>
                    <ul className="space-y-2">
                      {upcoming.map((task) => (
                        <li
                          key={task.id}
                          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5"
                        >
                          <span className="min-w-0 flex-1 truncate text-base font-medium text-slate-800">
                            {task.title}
                          </span>
                          {task.date && (
                            <span className="shrink-0 text-sm text-slate-500">
                              {formatDate(task.date, { weekday: "short", month: "short", day: "numeric" })}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </PageLayout>
    </DashboardLayout>
  );
}
