import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { TaskProvider } from "@/lib/store";
import { isClerkConfigured } from "@/lib/clerk-config";
import { AnonymousUserBridge, ClerkUserBridge } from "@/lib/user-bridge";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TaskFlow - Get things done",
  description: "A modern task management app",
};

// The entire app is behind Clerk auth (see proxy.ts) and uses dynamic Clerk/React
// hooks on every page, so skip static-shell prerendering and render per request.
export const instant = false;

// With placeholder/absent Clerk keys the app falls back to running without auth;
// once real keys are set and the container rebuilt, Clerk takes over.
const clerkConfigured = isClerkConfigured();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const providers = clerkConfigured ? (
    <ClerkProvider>
      <ClerkUserBridge>{children}</ClerkUserBridge>
    </ClerkProvider>
  ) : (
    <AnonymousUserBridge>{children}</AnonymousUserBridge>
  );
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#f6f7fb]">
        <TaskProvider>{providers}</TaskProvider>
      </body>
    </html>
  );
}
