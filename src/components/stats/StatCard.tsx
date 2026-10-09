import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  icon: React.ReactNode;
  iconColor: string;
  value: string | number;
  label: string;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
  progress?: number;
  className?: string;
}

export function StatCard({ icon, iconColor, value, label, trend, progress, className }: StatCardProps) {
  const trendIcons = {
    up: <TrendingUp className="h-4 w-4 text-green-500" aria-hidden="true" />,
    down: <TrendingDown className="h-4 w-4 text-red-500" aria-hidden="true" />,
    neutral: <Minus className="h-4 w-4 text-slate-400" aria-hidden="true" />,
  };

  const trendColors = {
    up: "text-green-600",
    down: "text-red-600",
    neutral: "text-slate-500",
  };

  return (
    <div
      className={cn(
        "relative p-6 rounded-2xl",
        "bg-white border border-slate-200/60",
        "shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_-12px_rgba(15,23,42,.08)]",
        "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn("p-3 rounded-xl", iconColor)}>
          {icon}
        </div>
        {trend && (
          <div className={cn("flex items-center gap-1 text-sm font-medium", trendColors[trend.direction])}>
            {trendIcons[trend.direction]}
            <span>{trend.value}</span>
          </div>
        )}
      </div>
      
      <div className="mt-4">
        <p className="text-3xl font-bold tabular-nums text-slate-900">{value}</p>
        <p className="mt-1 text-sm text-slate-500">{label}</p>
      </div>
      
      {progress !== undefined && (
        <div className="mt-4" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} progress`}>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500 ease-out"
              style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` } as React.CSSProperties}
            />
          </div>
        </div>
      )}
    </div>
  );
}
