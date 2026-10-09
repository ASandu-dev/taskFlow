import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "success" | "warning" | "danger";
}

export function Badge({ children, className, variant = "default" }: BadgeProps) {
  const variants = {
    default: "bg-slate-100 text-slate-700",
    success: "bg-green-100 text-green-700",
    warning: "bg-orange-100 text-orange-700",
    danger: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

interface ProjectBadgeProps {
  project: { name: string; color: string };
  size?: "sm" | "md";
  className?: string;
}

export function ProjectBadge({ project, size = "md", className }: ProjectBadgeProps) {
  const sizes = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-2.5 py-1 text-sm gap-1.5",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full",
        "bg-[color-mix(in_srgb,_var(--project-color)_15%,_transparent)]",
        "text-[color-mix(in_srgb,_var(--project-color)_70%,_black)]",
        sizes[size],
        className
      )}
      style={{ "--project-color": project.color } as React.CSSProperties}
    >
      <span
        className="rounded-full"
        style={{
          width: size === "sm" ? 6 : 8,
          height: size === "sm" ? 6 : 8,
          backgroundColor: project.color,
        }}
        aria-hidden="true"
      />
      {project.name}
    </span>
  );
}

interface PriorityBadgeProps {
  priority: "low" | "medium" | "high";
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const configs = {
    low: { bg: "bg-slate-100", text: "text-slate-600", label: "LOW" },
    medium: { bg: "bg-orange-100", text: "text-orange-600", label: "MED" },
    high: { bg: "bg-pink-100", text: "text-pink-600", label: "HIGH" },
  };
  const config = configs[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase",
        config.bg,
        config.text,
        className
      )}
    >
      {config.label}
    </span>
  );
}
