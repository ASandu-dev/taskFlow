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
      <Sidebar />
      <main className="flex-1 lg:pl-[240px]">
        <Header {...headerProps} />
        <MobileHeader />
        <div className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-6 lg:px-8 lg:pb-8">
          {children}
        </div>
      </main>
      <MobileNavigation />
    </div>
  );
}
