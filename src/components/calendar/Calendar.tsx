"use client";

import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getMonthDays, getDateKey, formatDate } from "@/lib/utils";
import type { CalendarEvent } from "@/types";

interface CalendarProps {
  selectedDate: string;
  onSelect: (date: string) => void;
  eventsByDate?: Record<string, CalendarEvent[]>;
  className?: string;
  defaultMonth?: Date;
}

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Calendar({
  selectedDate,
  onSelect,
  eventsByDate = {},
  className,
  defaultMonth,
}: CalendarProps) {
  // SSR-safe: a fixed literal month is used during render so the prerendered
  // HTML does not depend on `new Date()`. After mount, if no defaultMonth was
  // provided, switch to the real current month.
  const [currentMonth, setCurrentMonth] = useState(defaultMonth || new Date(2026, 9, 1));
  const [mounted, setMounted] = useState(false);
  
  const days = useMemo(() => getMonthDays(currentMonth.getFullYear(), currentMonth.getMonth()), [currentMonth]);
  const monthYear = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  // SSR-safe: `new Date()` is unstable during prerender, so resolve the
  // today-key after mount and fall back to the selected date during SSR.
  const [today, setToday] = useState<string>(selectedDate);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(getDateKey(new Date()));
    if (!defaultMonth && !mounted) {
      setCurrentMonth(new Date());
      setMounted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only: sync time-of-day and current month after first render

  const isCurrentMonth = (date: Date) => date.getMonth() === currentMonth.getMonth();

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleDayClick = (date: Date) => {
    onSelect(getDateKey(date));
  };

  const handleKeyDown = (e: React.KeyboardEvent, date: Date) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        onSelect(getDateKey(addDays(date, 1)));
        break;
      case "ArrowLeft":
        e.preventDefault();
        onSelect(getDateKey(addDays(date, -1)));
        break;
      case "ArrowDown":
        e.preventDefault();
        onSelect(getDateKey(addDays(date, 7)));
        break;
      case "ArrowUp":
        e.preventDefault();
        onSelect(getDateKey(addDays(date, -7)));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        handleDayClick(date);
        break;
    }
  };

  function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  return (
    <div className={cn("bg-white rounded-2xl border border-slate-200/60 p-4", className)}>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevMonth}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h2 className="text-lg font-semibold text-slate-900">{monthYear}</h2>
        <button
          onClick={handleNextMonth}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      
      <div className="grid grid-cols-7 gap-1 mb-2" role="row" aria-label="Weekdays">
        {weekdays.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-slate-500 py-2"
            role="columnheader"
          >
            {day}
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Calendar">
        {days.map((day, index) => {
          const dateKey = getDateKey(day);
          const isSelected = dateKey === selectedDate;
          const isTodayDate = dateKey === today;
          const isOtherMonth = !isCurrentMonth(day);
          const dayEvents = eventsByDate[dateKey] ?? [];
          const dayHasEvent = dayEvents.length > 0;
          
          return (
            <button
              key={index}
              onClick={() => handleDayClick(day)}
              onKeyDown={(e) => handleKeyDown(e, day)}
              className={cn(
                "relative aspect-square flex flex-col items-center justify-center rounded-xl",
                "transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2",
                isSelected
                  ? "bg-gradient-to-br from-purple-500 to-violet-600 text-white"
                  : isTodayDate
                  ? "ring-2 ring-purple-500 bg-purple-50 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50",
                isOtherMonth && "text-slate-300 hover:bg-transparent"
              )}
              role="gridcell"
              aria-selected={isSelected}
              aria-current={isTodayDate ? "date" : undefined}
              aria-label={formatDate(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              disabled={isOtherMonth}
              tabIndex={isSelected ? 0 : -1}
            >
              <span className="relative z-10 font-medium">{day.getDate()}</span>
              {dayHasEvent && (
                <span className="relative z-10 mt-0.5 flex items-center gap-0.5" aria-hidden="true">
                  {dayEvents.slice(0, 3).map((event, eventIndex) => (
                    <span
                      key={`${event.id}-${eventIndex}`}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: isSelected ? "#ffffff" : event.color }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
