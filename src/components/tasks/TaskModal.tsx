"use client";

import { useState, useEffect, useRef } from "react";
import { useTaskStore } from "@/lib/store";
import type { Task, Priority } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useFamilyMembers } from "./family-members";

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (task: Omit<Task, "id" | "createdAt">) => Promise<void>;
  initialTask?: Task | null;
  loading?: boolean;
  defaultDate?: string;
}

function getInitialValues(initialTask?: Task | null, defaultDate = "", projectIds: string[] = []) {
  if (initialTask) {
    return {
      title: initialTask.title,
      projectId: initialTask.projectId,
      priority: initialTask.priority,
      time: initialTask.time || "",
      date: initialTask.date || defaultDate,
      assigneeId: initialTask.assigneeId ?? "",
      recurring: initialTask.recurring ?? false,
    };
  }
  return {
    title: "",
    projectId: projectIds[0] || "",
    priority: "medium" as Priority,
    time: "",
    date: defaultDate,
    assigneeId: "",
    recurring: false,
  };
}

export function TaskModal({ open, onClose, onSubmit, initialTask, loading, defaultDate = "" }: TaskModalProps) {
  const { projects } = useTaskStore();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [priority, setPriority] = useState<Priority>("medium");
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const prevOpenRef = useRef(open);
  const prevInitialTaskRef = useRef(initialTask);

  const selectedProject = projects.find((project) => project.id === projectId) ?? null;
  const familyGroupId = selectedProject?.familyGroupId ?? null;
  const members = useFamilyMembers(familyGroupId);

  // Family projects can be assigned to any member; personal projects only to
  // their owner. An existing value that is not in the loaded list stays
  // selectable so editing never silently drops it.
  const assigneeOptions: Array<{ value: string; label: string }> = [{ value: "", label: "Unassigned" }];
  if (familyGroupId) {
    for (const member of members ?? []) {
      assigneeOptions.push({ value: member.userId, label: member.isYou ? `Me (${member.name})` : member.name });
    }
  } else if (selectedProject?.ownerId) {
    assigneeOptions.push({ value: selectedProject.ownerId, label: "Me" });
  }
  if (assigneeId && !assigneeOptions.some((option) => option.value === assigneeId)) {
    assigneeOptions.push({ value: assigneeId, label: "Assigned member" });
  }

  // Reset form when modal opens or initialTask changes
  useEffect(() => {
    if (open && (!prevOpenRef.current || prevInitialTaskRef.current !== initialTask)) {
      const values = getInitialValues(initialTask, defaultDate, projects.map((p) => p.id));
      setTitle(values.title);
      setProjectId(values.projectId);
      setPriority(values.priority);
      setTime(values.time);
      setDate(values.date);
      setAssigneeId(values.assigneeId);
      setRecurring(values.recurring);
      setError("");
    }
    prevOpenRef.current = open;
    prevInitialTaskRef.current = initialTask;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTask, defaultDate]);

  useEffect(() => {
    if (open && !projectId && projects[0]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProjectId(projects[0].id);
    }
  }, [open, projectId, projects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        title: title.trim(),
        projectId,
        priority,
        status: initialTask?.status ?? "todo",
        time: time || null,
        date: date || null,
        assigneeId: assigneeId || null,
        recurring,
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save task.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialTask ? "Edit Task" : "Add Task"}
      description={initialTask ? "Update your task details" : "Create a new task to get started"}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Title"
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={error}
          autoFocus
          required
        />

        <div>
          <label htmlFor="project" className="block text-sm font-medium text-slate-700 mb-1.5">
            Project
          </label>
          <select
            id="project"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              // Assignments are project-scoped, so switching projects clears it.
              setAssigneeId("");
            }}
            disabled={projects.length === 0}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 hover:border-slate-300 transition-colors"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="priority" className="block text-sm font-medium text-slate-700 mb-1.5">
            Priority
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 hover:border-slate-300 transition-colors"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            id="time"
          />
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            id="date"
          />
        </div>

        <div>
          <label htmlFor="assignee" className="block text-sm font-medium text-slate-700 mb-1.5">
            Assign to
          </label>
          <select
            id="assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 hover:border-slate-300 transition-colors"
          >
            {assigneeOptions.map((option) => (
              <option key={option.value || "unassigned"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
          <div>
            <label htmlFor="recurring" className="text-sm font-medium text-slate-700">
              Repeats daily
            </label>
            <p className="mt-0.5 text-xs text-slate-500">Completion is tracked for each day.</p>
          </div>
          <input
            id="recurring"
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            className="h-5 w-5 shrink-0 cursor-pointer rounded accent-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading || submitting} disabled={projects.length === 0 || loading || submitting}>
            {initialTask ? "Save Changes" : "Add Task"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
