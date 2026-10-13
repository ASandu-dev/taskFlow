"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { cn, addDays, getMonthDays, getDateKey, formatDateLong, formatMonthYear } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { entryColor, entryKey } from "@/lib/calendar-entry";
import type { CalendarEntry } from "@/types";

interface CalendarProps {
  selectedDate: string;
  onSelect: (date: string) => void;
  eventsByDate?: Record<string, CalendarEntry[]>;
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
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  // Set while navigating with the keyboard so focus follows the selected day.
  const moveFocusRef = useRef(false);

  const days = useMemo(() => getMonthDays(currentMonth.getFullYear(), currentMonth.getMonth()), [currentMonth]);
  const monthYear = formatMonthYear(currentMonth);
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

  // Move DOM focus to the newly selected day after keyboard navigation. Roving
  // tabindex alone is not enough: without this the key handler stays bound to
  // the original cell and repeated arrow presses would only advance one day.
  useEffect(() => {
    if (!moveFocusRef.current) return;
    moveFocusRef.current = false;
    dayRefs.current.get(selectedDate)?.focus();
  }, [selectedDate, currentMonth]);

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
    const offsets: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 7,
      ArrowUp: -7,
    };
    const offset = offsets[e.key];
    if (offset !== undefined) {
      e.preventDefault();
      const target = addDays(date, offset);
      moveFocusRef.current = true;
      // Follow the selection across month boundaries so focus never lands on a
      // disabled (out-of-month) cell.
      if (!isCurrentMonth(target)) {
        setCurrentMonth(new Date(target.getFullYear(), target.getMonth(), 1));
      }
      onSelect(getDateKey(target));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleDayClick(date);
    }
  };

  return (
    <div className={cn("bg-white rounded-2xl border border-slate-200/60 p-3 sm:p-4", className)}>
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={handlePrevMonth} aria-label="Previous month">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg" aria-live="polite">
          {monthYear}
        </h2>
        <Button variant="ghost" size="icon" onClick={handleNextMonth} aria-label="Next month">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1 sm:gap-1" aria-hidden="true">
        {weekdays.map((day) => (
          <div key={day} className="py-2 text-center text-xs font-medium text-slate-500">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 sm:gap-1" role="group" aria-label="Calendar days">
        {days.map((day) => {
          const dateKey = getDateKey(day);
          const isSelected = dateKey === selectedDate;
          const isTodayDate = dateKey === today;
          const isOtherMonth = !isCurrentMonth(day);
          const dayEvents = eventsByDate[dateKey] ?? [];
          const dayHasEvent = dayEvents.length > 0;

          return (
            <button
              key={dateKey}
              ref={(node) => {
                if (node) dayRefs.current.set(dateKey, node);
                else dayRefs.current.delete(dateKey);
              }}
              onClick={() => handleDayClick(day)}
              onKeyDown={(e) => handleKeyDown(e, day)}
              className={cn(
                "relative flex aspect-square min-h-9 flex-col items-center justify-center rounded-xl",
                "transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2",
                isSelected
                  ? "bg-gradient-to-br from-purple-500 to-violet-600 text-white"
                  : isTodayDate
                  ? "ring-2 ring-purple-500 bg-purple-50 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50",
                isOtherMonth && "text-slate-300 hover:bg-transparent"
              )}
              aria-pressed={isSelected}
              aria-current={isTodayDate ? "date" : undefined}
              aria-label={formatDateLong(day)}
              disabled={isOtherMonth}
              tabIndex={isSelected ? 0 : -1}
            >
              <span className="relative z-10 font-medium">{day.getDate()}</span>
              {dayHasEvent && (
                <span className="relative z-10 mt-0.5 flex items-center gap-0.5" aria-hidden="true">
                  {dayEvents.slice(0, 3).map((event, eventIndex) => (
                    <span
                      key={`${entryKey(event)}-${eventIndex}`}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: isSelected ? "#ffffff" : entryColor(event) }}
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
