import { cn } from "@/lib/utils";
import type { Task } from "@/types";
import { TaskItem } from "./TaskItem";
import { CheckSquare } from "lucide-react";

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: string) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  className?: string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
}

export function TaskList({
  tasks,
  onToggle,
  onEdit,
  onDelete,
  className,
  emptyMessage = "No tasks yet",
  emptyIcon,
}: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className={cn("py-12 text-center", className)}>
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-4">
          {emptyIcon || <CheckSquare className="h-8 w-8" aria-hidden="true" />}
        </div>
        <p className="text-slate-500 font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className={cn("space-y-2", className)} aria-label="Task list">
      {tasks.map((task) => (
        <li key={task.id}>
          <TaskItem
            task={task}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </li>
      ))}
    </ul>
  );
}

interface TaskSectionProps {
  title: string;
  tasks: Task[];
  onToggle: (id: string) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
  className?: string;
}

export function TaskSection({
  title,
  tasks,
  onToggle,
  onEdit,
  onDelete,
  emptyMessage,
  className,
}: TaskSectionProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{title}</h3>
      <TaskList
        tasks={tasks}
        onToggle={onToggle}
        onEdit={onEdit}
        onDelete={onDelete}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
