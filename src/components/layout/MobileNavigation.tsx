"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Calendar,
  Plus,
  Timer,
  MoreHorizontal,
  CheckSquare,
  Sun,
  CalendarClock,
  Target,
  FileText,
  Users,
  LayoutDashboard,
} from "lucide-react";
import { mobileNavItems, navItems } from "@/data/mock";
import { Modal } from "@/components/ui/Modal";
import { UserMenu } from "@/components/layout/UserMenu";

const bottomIconMap = {
  Home,
  Calendar,
  Plus,
  Timer,
  MoreHorizontal,
} as const;

const moreIconMap = {
  LayoutDashboard,
  CheckSquare,
  Sun,
  CalendarClock,
  Calendar,
  Target,
  Timer,
  FileText,
  Users,
} as const;

export function MobileNavigation() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  
  const moreItems = navItems.filter((item) => 
    !["Overview", "Calendar", "Focus Mode"].includes(item.label)
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
        <div className="grid grid-cols-5">
          {mobileNavItems.map((item) => {
            const Icon = bottomIconMap[item.icon as keyof typeof bottomIconMap];
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            
            if (item.prominent) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1 px-2 py-2.5",
                    "text-slate-400",
                    isActive && "text-purple-600"
                  )}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.label}
                >
                  <button
                    className={cn(
                      "relative z-10 flex h-12 w-12 items-center justify-center rounded-full",
                      "bg-gradient-to-br from-purple-500 to-violet-600 text-white",
                      "shadow-lg shadow-purple-500/30",
                      "transition-all duration-200",
                      "hover:scale-105 active:scale-95",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                    )}
                    aria-label={item.label}
                  >
                    <Plus className="h-6 w-6" aria-hidden="true" />
                  </button>
                </Link>
              );
            }
            
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-2.5",
                  "text-slate-400",
                  "transition-colors duration-200",
                  isActive ? "text-purple-600" : "hover:text-slate-600"
                )}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
                <span className="text-[10px] font-medium">{item.label}</span>
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
    </>
  );
}
