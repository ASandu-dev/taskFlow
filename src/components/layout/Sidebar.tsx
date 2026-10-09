"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CheckSquare,
  Sun,
  CalendarClock,
  Calendar,
  Target,
  Timer,
  FileText,
  Settings,
  ChevronRight,
} from "lucide-react";
import { navItems } from "@/data/mock";
import { useTaskStore } from "@/lib/store";
import { ProjectBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";

const iconMap = {
  LayoutDashboard,
  CheckSquare,
  Sun,
  CalendarClock,
  Calendar,
  Target,
  Timer,
  FileText,
  Settings,
  ChevronRight,
} as const;

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const { projects, user } = useTaskStore();
  const pathname = usePathname();
  
  return (
    <aside
      className={cn(
        "fixed lg:static inset-y-0 left-0 z-40 w-[240px] flex flex-col",
        "bg-[#0f1729] text-white hidden lg:flex",
        className
      )}
      aria-label="Main navigation"
    >
      <div className="flex flex-col h-full">
        <div className="p-6 border-b border-white/10">
          <Link href="/" className="flex items-center gap-3" aria-label="TaskFlow Home">
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <CheckSquare className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">TaskFlow</h1>
              <p className="text-xs text-slate-400">Get things done.</p>
            </div>
          </Link>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap];
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-purple-500/20 to-violet-500/10 text-white"
                    : "text-slate-300 hover:text-white hover:bg-white/5"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-purple-300")} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="flex items-center justify-between px-3 py-1">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Projects</h3>
            <button className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors" aria-label="Add project">
              <ChevronRight className="h-4 w-4 rotate-90" aria-hidden="true" />
            </button>
          </div>
          <div className="px-3 space-y-2 max-h-40 overflow-y-auto">
            {projects.map((project) => (
              <Link
                key={project.id}
                href="/projects"
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ProjectBadge project={project} size="sm" />
              </Link>
            ))}
          </div>
        </div>
        
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            {user && <Avatar initials={user.initials} color={user.avatarColor} size="md" alt={user.name} />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name ?? "Profile unavailable"}</p>
              <p className="text-xs text-slate-400 truncate">{user?.plan ?? ""}</p>
            </div>
            <button className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors" aria-label="Settings">
              <Settings className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
