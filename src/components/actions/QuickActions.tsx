import { cn } from "@/lib/utils";
import { Plus, Timer, FolderPlus, Calendar } from "lucide-react";

interface QuickAction {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  className?: string;
}

interface QuickActionsProps {
  actions: QuickAction[];
  className?: string;
}

export function QuickActions({ actions, className }: QuickActionsProps) {
  return (
    <div
      className={cn(
        // Single column on the narrowest phones so labels never clip; two
        // columns from 400px, four on large screens.
        "grid grid-cols-1 gap-3 min-[400px]:grid-cols-2",
        "lg:grid-cols-4",
        className
      )}
    >
      {actions.map((action, index) => (
        <button
          key={index}
          type="button"
          onClick={action.onClick}
          className={cn(
            "relative group flex min-h-11 min-w-0 w-full flex-col items-start p-4 rounded-2xl text-left",
            "bg-white border border-slate-200/60",
            "hover:border-slate-300 hover:shadow-md hover:-translate-y-1",
            "transition-all duration-300",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
            action.className
          )}
        >
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-white mb-3 group-hover:scale-110 transition-transform">
            {action.icon}
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">{action.title}</h3>
          <p className="text-sm text-slate-500">{action.description}</p>
        </button>
      ))}
    </div>
  );
}

export const defaultQuickActions = (
  onAddTask: () => void,
  onFocusMode: () => void,
  onNewProject: () => void,
  onViewCalendar: () => void
) => [
  {
    icon: <Plus className="h-5 w-5" aria-hidden="true" />,
    title: "Add Task",
    description: "Create a new task",
    onClick: onAddTask,
  },
  {
    icon: <Timer className="h-5 w-5" aria-hidden="true" />,
    title: "Focus Mode",
    description: "Start 25min session",
    onClick: onFocusMode,
  },
  {
    icon: <FolderPlus className="h-5 w-5" aria-hidden="true" />,
    title: "New Project",
    description: "Organize your work",
    onClick: onNewProject,
  },
  {
    icon: <Calendar className="h-5 w-5" aria-hidden="true" />,
    title: "View Calendar",
    description: "See your schedule",
    onClick: onViewCalendar,
  },
];
