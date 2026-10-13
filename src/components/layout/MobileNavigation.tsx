"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, getDateKey } from "@/lib/utils";
import {
  Home,
  Calendar,
  Plus,
  Timer,
  MoreHorizontal,
  CheckSquare,
  Sun,
  CalendarClock,
  ListChecks,
  Target,
  FileText,
  Users,
  LayoutDashboard,
} from "lucide-react";
import { mobileNavItems, navItems } from "@/data/mock";
import { Modal } from "@/components/ui/Modal";
import { TaskModal } from "@/components/tasks/TaskModal";
import { UserMenu } from "@/components/layout/UserMenu";
import { useTaskStore } from "@/lib/store";

const bottomIconMap = {
  Home,
  Calendar,
  Plus,
  ListChecks,
  Timer,
  MoreHorizontal,
} as const;

const moreIconMap = {
  LayoutDashboard,
  CheckSquare,
  Sun,
  CalendarClock,
  Calendar,
  ListChecks,
  Target,
  Timer,
  FileText,
  Users,
} as const;

export function MobileNavigation() {
  const pathname = usePathname();
  const { addTask } = useTaskStore();
  const [showMore, setShowMore] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const moreItems = navItems.filter((item) =>
    !["Overview", "Calendar", "Focus Mode", "Checklist"].includes(item.label)
  );

  // The bottom bar only has room for six destinations; the items not shown
  // there live behind "More" instead of linking to a route that does not exist.
  const navLinkClasses = (isActive: boolean) =>
    cn(
      "flex min-w-0 flex-col items-center gap-1 px-1 py-2.5",
      "text-slate-500 transition-colors duration-200",
      isActive ? "text-purple-600" : "hover:text-slate-700"
    );

  return (
    <>
      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 lg:hidden",
          "bg-white border-t border-slate-200/60",
          "shadow-[0_-1px_2px_rgba(15,23,42,.04),0_-8px_24px_-12px_rgba(15,23,42,.08)]"
        )}
        aria-label="Mobile bottom navigation"
      >
        <div className="grid grid-cols-6">
          {mobileNavItems.map((item) => {
            // A native button opening the "More" sheet, rather than a link to a
            // page that does not exist.
            if (item.label === "More") {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setShowMore(true)}
                  aria-haspopup="dialog"
                  aria-expanded={showMore}
                  className={navLinkClasses(false)}
                >
                  <MoreHorizontal className="h-6 w-6" aria-hidden="true" />
                  <span className="w-full truncate text-center text-[10px] font-medium">{item.label}</span>
                </button>
              );
            }

            // The prominent centre action opens the task composer directly. It
            // is a single button — nesting a button inside a link is invalid.
            if (item.prominent) {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setAddOpen(true)}
                  aria-label="Add task"
                  className="flex flex-col items-center justify-center gap-1 px-1 py-2.5 text-slate-400"
                >
                  <span
                    className={cn(
                      "relative z-10 flex h-12 w-12 items-center justify-center rounded-full",
                      "bg-gradient-to-br from-purple-500 to-violet-600 text-white",
                      "shadow-lg shadow-purple-500/30",
                      "transition-all duration-200",
                      "hover:scale-105 active:scale-95",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                    )}
                  >
                    <Plus className="h-6 w-6" aria-hidden="true" />
                  </span>
                </button>
              );
            }

            const Icon = bottomIconMap[item.icon as keyof typeof bottomIconMap];
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.label}
                href={item.href}
                className={navLinkClasses(isActive)}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
                <span className="w-full truncate text-center text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <Modal
        open={showMore}
        onClose={() => setShowMore(false)}
        title="More"
        size="sm"
      >
        <div className="space-y-1">
          {moreItems.map((item) => {
            const Icon = moreIconMap[item.icon as keyof typeof moreIconMap];
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setShowMore(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gradient-to-r from-purple-500/10 to-violet-500/10 text-purple-600"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <div className="pt-4 border-t border-slate-200/60">
            <UserMenu showName onNavigate={() => setShowMore(false)} />
          </div>
        </div>
      </Modal>

      {/* Only resolve the clock when the sheet is open; evaluating it during
          the initial render would abort static prerendering (Next treats
          `new Date()` as a request-time value). */}
      <TaskModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (data) => {
          await addTask(data);
        }}
        defaultDate={addOpen ? getDateKey(new Date()) : undefined}
      />
    </>
  );
}
