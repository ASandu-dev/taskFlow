"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Search, Bell, CheckSquare } from "lucide-react";
import { getGreeting } from "@/lib/utils";
import { useTaskStore } from "@/lib/store";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { UserMenu } from "@/components/layout/UserMenu";

interface HeaderProps {
  onSearch?: (value: string) => void;
  searchValue?: string;
  className?: string;
}

export function Header({ onSearch, searchValue, className }: HeaderProps) {
  const { user } = useTaskStore();
  const [search, setSearch] = useState(searchValue || "");
  // SSR-safe: compute the time-of-day greeting only after mount so the
  // prerendered HTML does not depend on `new Date()` (Next.js blocks that).
  const [greeting, setGreeting] = useState<{ text: string; emoji: string }>({
    text: "Good afternoon",
    emoji: "☀️",
  });
  // SSR-safe: the time-of-day greeting must not be computed during render
  // (Next.js blocks `new Date()` in client components during prerender), so we
  // set it after mount. The initial literal keeps SSR/client markup identical.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(getGreeting());
  }, []);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    onSearch?.(value);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-30 lg:z-20",
        "bg-white/80 backdrop-blur-md border-b border-slate-200/60",
        "hidden lg:flex",
        className
      )}
      role="banner"
    >
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 max-w-xl">
            <p className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              {greeting.text}{user ? `, ${user.name}` : ""} <span aria-hidden="true">{greeting.emoji}</span>
            </p>
            <p className="text-sm text-slate-500 mt-0.5">A little progress each day adds up to big results.</p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="relative hidden sm:block w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
              <Input
                type="search"
                placeholder="Search tasks, projects..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10 pr-4 py-2"
                aria-label="Search tasks and projects"
              />
            </div>

            <div className="flex items-center gap-2">
              <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-mono border border-slate-200">
                <span className="text-slate-400">⌘</span>K
              </kbd>

              <Button variant="ghost" size="icon" className="relative text-slate-400 hover:text-slate-600" aria-label="Notifications">
                <Bell className="h-5 w-5" aria-hidden="true" />
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-pink-500" aria-hidden="true" />
              </Button>

              <UserMenu avatarSize="sm" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function MobileHeader() {
  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
      <div className="px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2" aria-label="TaskFlow Home">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <CheckSquare className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <span className="font-bold text-slate-900">TaskFlow</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600" aria-label="Notifications">
            <Bell className="h-5 w-5" aria-hidden="true" />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-pink-500" aria-hidden="true" />
          </Button>
          <UserMenu avatarSize="sm" />
        </div>
      </div>
    </header>
  );
}
