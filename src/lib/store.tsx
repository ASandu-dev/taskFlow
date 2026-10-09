"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import type { Task, Project, Goal, CalendarEvent, User } from "@/types";

interface TaskContextType {
  tasks: Task[];
  projects: Project[];
  goals: Goal[];
  events: CalendarEvent[];
  user: User | null;
  hydrated: boolean;
  error: string | null;
  clearError: () => void;
  retryLoad: () => void;
  addTask: (task: Omit<Task, "id" | "createdAt">) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string) => Promise<Task>;
  addProject: (project: Omit<Project, "id">) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Omit<Project, "id">>) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  addGoal: (goal: Omit<Goal, "id">) => Promise<Goal>;
  updateGoalProgress: (id: string, progress: number) => Promise<Goal>;
  deleteGoal: (id: string) => Promise<void>;
  addEvent: (event: Omit<CalendarEvent, "id">) => Promise<CalendarEvent>;
  updateEvent: (id: string, updates: Partial<Omit<CalendarEvent, "id">>) => Promise<CalendarEvent>;
  deleteEvent: (id: string) => Promise<void>;
}

const TaskContext = createContext<TaskContextType | null>(null);

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(init?.headers).entries()),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      const payload: unknown = await res.json();
      if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
        message = payload.error;
      }
    } catch {
      // Keep the status-based message when the server did not return JSON.
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const [tasksData, projectsData, goalsData, eventsData, userData] = await Promise.all([
          apiFetch<Task[]>("/api/tasks"),
          apiFetch<Project[]>("/api/projects"),
          apiFetch<Goal[]>("/api/goals"),
          apiFetch<CalendarEvent[]>("/api/events"),
          apiFetch<User | null>("/api/user"),
        ]);
        if (cancelled) return;
        setTasks(tasksData);
        setProjects(projectsData);
        setGoals(goalsData);
        setEvents(eventsData);
        setUser(userData);
        setLoadFailed(false);
      } catch (err) {
        if (!cancelled) {
          setLoadFailed(true);
          setError(err instanceof Error ? err.message : "Unable to load saved data.");
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  const clearError = useCallback(() => setError(null), []);
  const retryLoad = useCallback(() => {
    setHydrated(false);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  const runMutation = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    setError(null);
    try {
      return await operation();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The requested change could not be saved.");
      throw err;
    }
  }, []);

  const addTask = useCallback(async (task: Omit<Task, "id" | "createdAt">) => {
    return runMutation(async () => {
      const created = await apiFetch<Task>("/api/tasks", {
        method: "POST",
        body: JSON.stringify(task),
      });
      setTasks((prev) => [created, ...prev]);
      return created;
    });
  }, [runMutation]);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    return runMutation(async () => {
      const updated = await apiFetch<Task>(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      setTasks((prev) => prev.map((task) => (task.id === id ? updated : task)));
      return updated;
    });
  }, [runMutation]);

  const deleteTask = useCallback(async (id: string) => {
    await runMutation(async () => {
      await apiFetch<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((task) => task.id !== id));
    });
  }, [runMutation]);

  const toggleTask = useCallback(async (id: string) => {
    const current = tasks.find((t) => t.id === id);
    if (!current) throw new Error("Task not found in the current view.");
    return updateTask(id, { status: current.status === "todo" ? "done" : "todo" });
  }, [tasks, updateTask]);

  const addProject = useCallback(async (project: Omit<Project, "id">) => {
    return runMutation(async () => {
      const created = await apiFetch<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify(project),
      });
      setProjects((prev) => [...prev, created]);
      return created;
    });
  }, [runMutation]);

  const updateProject = useCallback(async (id: string, updates: Partial<Omit<Project, "id">>) => {
    return runMutation(async () => {
      const updated = await apiFetch<Project>(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      setProjects((prev) => prev.map((project) => (project.id === id ? updated : project)));
      return updated;
    });
  }, [runMutation]);

  const deleteProject = useCallback(async (id: string) => {
    await runMutation(async () => {
      await apiFetch<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((project) => project.id !== id));
    });
  }, [runMutation]);

  const addGoal = useCallback(async (goal: Omit<Goal, "id">) => {
    return runMutation(async () => {
      const created = await apiFetch<Goal>("/api/goals", {
        method: "POST",
        body: JSON.stringify(goal),
      });
      setGoals((prev) => [...prev, created]);
      return created;
    });
  }, [runMutation]);

  const updateGoalProgress = useCallback(async (id: string, progress: number) => {
    return runMutation(async () => {
      const updated = await apiFetch<Goal>("/api/goals", {
        method: "PATCH",
        body: JSON.stringify({ id, progress }),
      });
      setGoals((prev) => prev.map((goal) => (goal.id === id ? updated : goal)));
      return updated;
    });
  }, [runMutation]);

  const deleteGoal = useCallback(async (id: string) => {
    await runMutation(async () => {
      await apiFetch<{ ok: boolean }>(`/api/goals/${id}`, { method: "DELETE" });
      setGoals((prev) => prev.filter((goal) => goal.id !== id));
    });
  }, [runMutation]);

  const addEvent = useCallback(async (event: Omit<CalendarEvent, "id">) => {
    return runMutation(async () => {
      const created = await apiFetch<CalendarEvent>("/api/events", {
        method: "POST",
        body: JSON.stringify(event),
      });
      setEvents((prev) => [...prev, created].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)));
      return created;
    });
  }, [runMutation]);

  const updateEvent = useCallback(async (id: string, updates: Partial<Omit<CalendarEvent, "id">>) => {
    return runMutation(async () => {
      const updated = await apiFetch<CalendarEvent>(`/api/events/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      setEvents((prev) => prev.map((event) => (event.id === id ? updated : event))
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)));
      return updated;
    });
  }, [runMutation]);

  const deleteEvent = useCallback(async (id: string) => {
    await runMutation(async () => {
      await apiFetch<{ ok: boolean }>(`/api/events/${id}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((event) => event.id !== id));
    });
  }, [runMutation]);

  return (
    <>
      {!hydrated && (
        <div role="status" className="fixed top-3 right-3 z-[100] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow" aria-live="polite">
          Loading saved TaskFlow data.
        </div>
      )}
      {error && (
        <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-md rounded-xl border border-red-200 bg-white p-4 text-sm text-red-800 shadow-lg">
          <p>{error}</p>
          {loadFailed && (
            <button className="mt-2 font-semibold underline" onClick={retryLoad}>
              Retry loading
            </button>
          )}
          {!loadFailed && (
            <button className="mt-2 font-semibold underline" onClick={clearError}>
              Dismiss
            </button>
          )}
        </div>
      )}
    <TaskContext.Provider
      value={{
        tasks,
        projects,
        goals,
        events,
        user,
        hydrated,
        error,
        clearError,
        retryLoad,
        addTask,
        updateTask,
        deleteTask,
        toggleTask,
        addProject,
        updateProject,
        deleteProject,
        addGoal,
        updateGoalProgress,
        deleteGoal,
        addEvent,
        updateEvent,
        deleteEvent,
      }}
    >
      {children}
    </TaskContext.Provider>
    </>
  );
}

export function useTaskStore() {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error("useTaskStore must be used within a TaskProvider");
  }
  return context;
}
