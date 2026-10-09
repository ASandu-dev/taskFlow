"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ProductivityChartProps {
  data: number[];
  labels: string[];
  className?: string;
  maxValue?: number;
}

export function ProductivityChart({ data, labels, className, maxValue }: ProductivityChartProps) {
  const [animated, setAnimated] = useState(false);
  const prevDataRef = useRef<number[]>(data);
  
  useEffect(() => {
    if (prevDataRef.current !== data) {
      setAnimated(false);
      requestAnimationFrame(() => setAnimated(true));
      prevDataRef.current = data;
    }
  }, [data]);

  const max = maxValue || Math.max(...data, 1);

  return (
    <div className={cn("space-y-4", className)} role="img" aria-label="Productivity chart">
      <div className="relative h-48" style={{ maxHeight: "200px" }}>
        <div className="absolute inset-0 flex items-end justify-between px-1" role="list" aria-label="Daily tasks completed">
          {data.map((value, index) => {
            const height = (value / max) * 100;
            const label = labels[index];
            return (
              <div
                key={index}
                className="relative flex-1 flex flex-col items-center justify-end px-1 min-w-0"
                role="listitem"
                aria-label={`${label}: ${value} tasks`}
              >
                <div
                  className={cn(
                    "w-full max-w-[40px] mx-auto rounded-t-lg",
                    "bg-gradient-to-t from-purple-500 to-blue-500",
                    "transition-all duration-700 ease-out",
                    "origin-bottom",
                    animated ? "scale-y-100" : "scale-y-0"
                  )}
                  style={{ height: `${height}%` } as React.CSSProperties}
                >
                  <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-slate-900 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                    style={{ transform: "translateX(-50%) translateY(4px)" } as React.CSSProperties}
                  >
                    {value}
                  </div>
                </div>
                <span className="mt-2 text-xs text-slate-500 font-medium">{label}</span>
              </div>
            );
          })}
        </div>
        <div className="absolute inset-0 flex items-end justify-between px-1 pointer-events-none" aria-hidden="true">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="w-full border-t border-slate-100"
              style={{ height: `${(i + 1) * 25}%` } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TimeRangeSelectorProps {
  value: "this-week" | "last-week" | "this-month";
  onChange: (value: "this-week" | "last-week" | "this-month") => void;
  className?: string;
}

export function TimeRangeSelector({ value, onChange, className }: TimeRangeSelectorProps) {
  const options = [
    { value: "this-week" as const, label: "This week" },
    { value: "last-week" as const, label: "Last week" },
    { value: "this-month" as const, label: "This month" },
  ];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100",
        className
      )}
      role="group"
      aria-label="Time range"
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
            value === option.value
              ? "bg-white text-purple-600 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          )}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
