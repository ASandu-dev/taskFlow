"use client";

import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header, MobileHeader } from "./Header";
import { MobileNavigation } from "./MobileNavigation";

interface DashboardLayoutProps {
  children: ReactNode;
  headerProps?: {
    onSearch?: (value: string) => void;
    searchValue?: string;
    searchInputRef?: React.RefObject<HTMLInputElement | null>;
  };
}

export function DashboardLayout({ children, headerProps }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen bg-[#f6f7fb]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900 focus:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
      >
        Skip to content
      </a>
      <Sidebar />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none lg:pl-[240px]">
        <Header {...headerProps} />
        <MobileHeader />
        <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 pb-24 pt-6 lg:px-8 lg:pb-8">
          {children}
        </div>
      </main>
      <MobileNavigation />
    </div>
  );
}
