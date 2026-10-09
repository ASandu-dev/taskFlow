import type { Task } from "@/types";

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: options?.year ? "numeric" : undefined,
    ...options,
  });
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

export function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: "Good morning", emoji: "☀️" };
  if (hour < 17) return { text: "Good afternoon", emoji: "☀️" };
  return { text: "Good evening", emoji: "🌙" };
}

export function isToday(date: string): boolean {
  return date === getDateKey(new Date());
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];
  const startDay = firstDay.getDay();
  const adjustedStart = startDay === 0 ? 6 : startDay - 1; // Monday = 0
  
  // Add previous month's trailing days
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = adjustedStart - 1; i >= 0; i--) {
    days.push(new Date(year, month - 1, prevMonthLastDay - i));
  }
  
  // Add current month's days
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  
  // Add next month's leading days to fill 6 weeks (42 days)
  while (days.length < 42) {
    const nextDay = days.length - (adjustedStart + lastDay.getDate()) + 1;
    days.push(new Date(year, month + 1, nextDay));
  }
  
  return days;
}

export function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTasksForDate(tasks: Task[], date: string): Task[] {
  return tasks.filter((t) => t.date === date);
}

export function getEventsForDate(events: { date: string }[], date: string) {
  return events.filter((e) => e.date === date);
}

export function getPriorityColor(priority: Task["priority"]): string {
  switch (priority) {
    case "high":
      return "#f43f5e";
    case "medium":
      return "#f59e0b";
    case "low":
      return "#64748b";
  }
}

export function getPriorityLabel(priority: Task["priority"]): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}
