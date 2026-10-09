"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Pencil, Trash2, Clock } from "lucide-react";
import { formatTime } from "@/lib/utils";
import type { Task } from "@/types";
import { ProjectBadge } from "@/components/ui/Badge";
import { PriorityBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useTaskStore } from "@/lib/store";

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

export function TaskItem({ task, onToggle, onEdit, onDelete, className }: TaskItemProps) {
  const { projects } = useTaskStore();
  const [showActions, setShowActions] = useState(false);
  const project = projects.find((p) => p.id === task.projectId);
  
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
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
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
            task.status === "done" ? "text-slate-400 line-through" : "text-slate-900"
          )}
        >
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {project && <ProjectBadge project={project} size="sm" />}
          <PriorityBadge priority={task.priority} />
          {task.time && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {formatTime(task.time)}
            </span>
          )}
        </div>
      </div>
      
      <div className={cn("flex items-center gap-1 opacity-0 transition-opacity duration-200", showActions && "opacity-100")}>
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
