"use client";

import { cn } from "@/lib/utils";
import { Check, Pencil, Trash2, Clock, User, Repeat } from "lucide-react";
import { formatTime } from "@/lib/utils";
import type { Task } from "@/types";
import { ProjectBadge } from "@/components/ui/Badge";
import { PriorityBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useTaskStore } from "@/lib/store";
import { useFamilyMembers } from "./family-members";

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

export function TaskItem({ task, onToggle, onEdit, onDelete, className }: TaskItemProps) {
  const { projects } = useTaskStore();
  const project = projects.find((p) => p.id === task.projectId);

  // Resolve a human label for the assignee. Family members are shared across
  // items via the module cache; personal tasks are assigned to their owner.
  const familyGroupId = project?.familyGroupId ?? null;
  const members = useFamilyMembers(familyGroupId);
  const assignee = task.assigneeId
    ? members?.find((member) => member.userId === task.assigneeId) ??
      (project && !familyGroupId && task.assigneeId === project.ownerId
        ? { userId: task.assigneeId, name: "You", isYou: true }
        : null)
    : null;
  const assigneeLabel = assignee ? (assignee.isYou ? "You" : assignee.name) : task.assigneeId ? "Assigned" : null;
  
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle(task.id);
  };

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 px-4 py-3",
        "bg-white rounded-xl border border-slate-200/60",
        "transition-all duration-200",
        "hover:border-slate-300 hover:shadow-sm",
        task.status === "done" && "opacity-60",
        className
      )}
    >
      <button
        onClick={handleCheckboxClick}
        className={cn(
          "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2",
          task.status === "done"
            ? "bg-gradient-to-br from-purple-500 to-violet-600 border-transparent text-white"
            : "border-slate-300 hover:border-purple-400"
        )}
        aria-pressed={task.status === "done"}
        aria-label={task.status === "done" ? "Mark as incomplete" : "Mark as complete"}
      >
        {task.status === "done" && (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
      
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium truncate transition-colors",
            task.status === "done" ? "text-slate-500 line-through" : "text-slate-900"
          )}
        >
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {project && <ProjectBadge project={project} size="sm" />}
          <PriorityBadge priority={task.priority} />
          {task.time && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {formatTime(task.time)}
            </span>
          )}
          {assigneeLabel && (
            <span className="inline-flex max-w-40 items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
              <User className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{assigneeLabel}</span>
            </span>
          )}
          {task.recurring && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
              <Repeat className="h-3 w-3" aria-hidden="true" />
              Daily
            </span>
          )}
        </div>
      </div>
      
      {/* Always visible on touch/small screens; revealed on hover or keyboard
          focus on larger screens so the controls are never invisible-but-focusable. */}
      <div className="flex items-center gap-1 opacity-100 transition-opacity duration-200 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onEdit(task); }}
            aria-label="Edit task"
            className="text-slate-400 hover:text-slate-600"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            aria-label="Delete task"
            className="text-slate-400 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
